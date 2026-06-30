-- ============================================================================
-- M1a foundation schema: allowlist, core tables, allowlist-enforced RLS,
-- and the slot_conflict() cross-user read RPC.
-- ============================================================================

-- ---- Allowlist (source of truth for who may use the app) --------------------
create table public.allowed_users (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;

-- SECURITY DEFINER so it can read allowed_users regardless of the caller's RLS.
create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users a
    where a.email = (auth.jwt() ->> 'email')
  );
$$;

create policy "allowlisted can read allowlist"
  on public.allowed_users for select
  to authenticated
  using (public.is_allowed_user());

-- ---- Domain tables ----------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null default 'invited',
  invited_facility_id text,
  timezone text not null default 'America/Los_Angeles',
  booking_window_days int,
  open_time_local time,
  max_players int not null default 4,
  created_at timestamptz not null default now(),
  constraint clubs_name_uq unique (name)
);

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  username_enc text not null,
  password_enc text not null,
  status text not null default 'active',
  last_login_at timestamptz,
  unique (user_id, club_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.credentials (id) on delete cascade,
  storage_state_enc text,
  expires_at timestamptz,
  version int not null default 0,
  unique (credential_id)
);

create table public.companions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'guest',
  member_number text,
  email text,
  tags jsonb,
  note text,
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id),
  tee_datetime timestamptz not null,
  players jsonb not null default '[]'::jsonb,
  holes int not null default 18,
  transport text,
  status text not null default 'requested',
  confirmation_ref text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index bookings_slot_uq
  on public.bookings (user_id, club_id, tee_datetime);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  result jsonb,
  error text,
  auth_mode text,
  claimed_by text,
  claimed_at timestamptz,
  locked_until timestamptz,
  attempt int not null default 0,
  club_id uuid references public.clubs (id),
  tee_datetime timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index jobs_active_slot_uq
  on public.jobs (user_id, type, club_id, tee_datetime)
  where status in ('queued', 'running');

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  expires_at timestamptz
);

-- ---- Enable RLS everywhere --------------------------------------------------
alter table public.users         enable row level security;
alter table public.clubs         enable row level security;
alter table public.credentials   enable row level security;
alter table public.sessions      enable row level security;
alter table public.companions    enable row level security;
alter table public.bookings      enable row level security;
alter table public.jobs          enable row level security;
alter table public.chat_sessions enable row level security;

-- ---- Per-user policies (allow-listed AND own the row) -----------------------
create policy "users self read"   on public.users        for select to authenticated using (public.is_allowed_user() and id = (select auth.uid()));
create policy "users self insert" on public.users        for insert to authenticated with check (public.is_allowed_user() and id = (select auth.uid()));
create policy "users self update" on public.users        for update to authenticated using (public.is_allowed_user() and id = (select auth.uid()));

create policy "cred self all"  on public.credentials   for all to authenticated using (public.is_allowed_user() and user_id = (select auth.uid())) with check (public.is_allowed_user() and user_id = (select auth.uid()));
create policy "book self all"  on public.bookings      for all to authenticated using (public.is_allowed_user() and user_id = (select auth.uid())) with check (public.is_allowed_user() and user_id = (select auth.uid()));
create policy "jobs self all"  on public.jobs          for all to authenticated using (public.is_allowed_user() and user_id = (select auth.uid())) with check (public.is_allowed_user() and user_id = (select auth.uid()));
create policy "chat self all"  on public.chat_sessions for all to authenticated using (public.is_allowed_user() and user_id = (select auth.uid())) with check (public.is_allowed_user() and user_id = (select auth.uid()));

-- sessions has no user_id column; gate through the owning credential.
create policy "sessions via cred" on public.sessions for all to authenticated
  using (public.is_allowed_user() and exists (
    select 1 from public.credentials c where c.id = credential_id and c.user_id = (select auth.uid())))
  with check (public.is_allowed_user() and exists (
    select 1 from public.credentials c where c.id = credential_id and c.user_id = (select auth.uid())));

-- ---- Shared (couple-wide) policies ------------------------------------------
create policy "clubs shared read" on public.clubs      for select to authenticated using (public.is_allowed_user());
create policy "companions shared" on public.companions for all to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

-- ---- The only sanctioned cross-user read: spouse slot-conflict check --------
create or replace function public.slot_conflict(p_club_id uuid, p_tee timestamptz)
returns table (conflict boolean, owner text)
language sql
stable
security definer
set search_path = ''
as $$
  select true, u.display_name
  from public.bookings b
  join public.users u on u.id = b.user_id
  where b.club_id = p_club_id
    and b.tee_datetime = p_tee
    and b.status in ('requested', 'confirmed')
  limit 1;
$$;
