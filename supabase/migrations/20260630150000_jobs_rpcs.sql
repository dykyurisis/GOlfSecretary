-- Job-queue RPCs for the worker: atomic claim + stuck-job reaper.

-- Atomically claim a queued job (returns the row if claimed, empty otherwise).
create or replace function public.claim_job(p_job_id uuid, p_worker text, p_budget_seconds int)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  update public.jobs
     set status = 'running', claimed_by = p_worker, claimed_at = now(),
         locked_until = now() + make_interval(secs => p_budget_seconds),
         attempt = attempt + 1, updated_at = now()
   where id = p_job_id and status = 'queued'
  returning *;
$$;

-- Fail jobs that have been 'running' past their lock (worker crash / timeout).
-- NOTE: book jobs must never be auto-retried — this only marks them failed for human follow-up.
create or replace function public.reap_stuck_jobs()
returns int
language sql
security definer
set search_path = ''
as $$
  with upd as (
    update public.jobs
       set status = 'failed', error = 'worker_lost_or_timeout', updated_at = now()
     where status = 'running' and locked_until < now()
    returning 1)
  select count(*)::int from upd;
$$;
