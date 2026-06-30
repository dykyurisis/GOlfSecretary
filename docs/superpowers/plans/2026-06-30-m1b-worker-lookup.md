# M1b — Worker + Coto Tee-Time Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the dashboard, a logged-in allow-listed user requests Coto de Caza tee-time availability for a date; a dedicated Playwright worker logs into invited (reusing a stored session), scrapes the tee sheet, and the dashboard shows the available slots — end to end.

**Architecture:** A new `worker/` Node service (TypeScript + Playwright + supabase-js, service_role) exposes `POST /run` (shared-secret auth). The Next.js dashboard creates a row in `jobs` (status `queued`), then calls the worker's `/run`; the worker atomically claims the job, runs the invited Coto adapter (login with session reuse → navigate CCTTWEB → scrape sheet → parse slots), writes `jobs.result`, and the dashboard polls `jobs` until `done`/`failed` and renders the slots. Lookup is read-only — it does NOT submit bookings, so the booking-page reCAPTCHA (found in M0) is not exercised here.

**Tech Stack:** Node 24 + TypeScript + Playwright (worker, on Render later); Next.js 15 App Router (dashboard); Supabase (Postgres + RLS + `jobs` queue); shared-secret HTTP between dashboard and worker.

**Scope:** This is milestone M1b from `prd.md` §11. ONLY Coto + the husband's account + LOOKUP. Booking execution (M2), companion DB UI (M2), chat NLU (M2.5), wife's account / other clubs (M3) are out of scope. Realtime is optional polish — primary status delivery is **polling** (simpler, reliable on iOS).

**Inputs already in place (from M1a + M0):**
- Hosted Supabase with schema + RLS; `jobs` table has `claimed_by/claimed_at/locked_until/attempt`.
- Encrypted Coto credential row for daeyoung71@gmail.com (verified decryptable with `ENC_KEY`).
- `lib/crypto.ts` (`decryptSecret`). M0 selectors (see Appendix).
- Secrets in `.env.seed` (owner-only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENC_KEY`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `worker/package.json`, `worker/tsconfig.json` | worker project (own deps; deployable to Render) |
| `worker/.env.worker.example` | template: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENC_KEY, WORKER_SHARED_SECRET, PORT |
| `worker/src/lib/crypto.ts` | copy of AES-GCM `decryptSecret` (worker is standalone) |
| `worker/src/lib/supabase.ts` | service_role supabase client |
| `worker/src/invited/parseTeeSheet.ts` | PURE: tee-sheet HTML → `Slot[]` (unit-tested) |
| `worker/src/invited/cotoAdapter.ts` | Playwright: login (session reuse) → CCTTWEB → scrape HTML |
| `worker/src/jobs/process.ts` | claim → run lookup → write result; reaper call |
| `worker/src/server.ts` | HTTP `POST /run` (shared secret) + `GET /health` |
| `worker/test/fixtures/teesheet.html` | sanitized fixture for parser test |
| `worker/test/parseTeeSheet.test.ts` | Vitest unit tests for the parser |
| `supabase/migrations/20260630150000_jobs_rpcs.sql` | `claim_job()` + `reap_stuck_jobs()` |
| `app/lookup/page.tsx` | lookup form (Coto, date, time range) |
| `app/lookup/actions.ts` | server action: insert job + POST /run |
| `app/lookup/[jobId]/page.tsx` | result page (polls job, renders slots) |
| `components/JobStatus.tsx` | client component: poll `jobs` row, render status/slots |
| `.env.local` (dashboard) | add `WORKER_URL`, `WORKER_SHARED_SECRET` (server-only) |

**Shared types** (define in `worker/src/invited/parseTeeSheet.ts`; the dashboard `components/JobStatus.tsx` re-declares the same `Slot` shape inline since the two projects don't share a package):
```ts
export type Slot = { club: string; course: string; date: string; time: string; slotsAvailable: number };
```

---

## Task 1: Worker scaffold

**Files:** `worker/package.json`, `worker/tsconfig.json`, `worker/.env.worker.example`, `worker/src/lib/crypto.ts`, `worker/src/lib/supabase.ts`

- [ ] **Step 1: Create `worker/package.json`**
```json
{
  "name": "golf-teetime-worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --env-file=.env.worker src/server.ts",
    "start": "node --env-file=.env.worker src/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.110.0",
    "playwright": "^1.61.1"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "vitest": "^4.1.9"
  }
}
```
> Node 24 runs `.ts` directly via type-stripping, so no build step is needed for dev/start.

- [ ] **Step 2: Create `worker/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "noEmit": true, "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Install worker deps**
Run: `cd worker && npm install && npx playwright install chromium`
Expected: deps installed; chromium present (may already be cached from M0).

- [ ] **Step 4: Create `worker/.env.worker.example`**
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
ENC_KEY=<same base64 32-byte key used by the seed>
WORKER_SHARED_SECRET=<long random string; also set in dashboard .env.local>
PORT=8787
```

- [ ] **Step 5: Create `worker/src/lib/crypto.ts`** — copy the exact contents of the repo-root `lib/crypto.ts` (the hardened version with `encryptSecret`/`decryptSecret`, key-length and blob-format checks). The worker is a standalone deployable, so it carries its own copy.

- [ ] **Step 6: Create `worker/src/lib/supabase.ts`**
```ts
import { createClient } from '@supabase/supabase-js';

export function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 7: Commit**
```bash
git add worker/package.json worker/tsconfig.json worker/.env.worker.example worker/src/lib worker/package-lock.json
git commit -m "chore(m1b): worker scaffold (playwright + supabase service client)"
```

---

## Task 2: Tee-sheet parser (pure, TDD)

**Files:** `worker/src/invited/parseTeeSheet.ts`, `worker/test/fixtures/teesheet.html`, `worker/test/parseTeeSheet.test.ts`

- [ ] **Step 1: Create the fixture `worker/test/fixtures/teesheet.html`** (sanitized — structure mirrors the live CCTTWEB sheet; only the rows the parser reads):
```html
<table id="SheetDetails-MyTeeTimes" class="cc-table-detail"><tbody>
<tr><td style="height:47px;" colspan="6">&nbsp;</td></tr>
<tr class="cc-tee-time-row" data-id="a1">
  <td colspan="6" class="cc-grid-myteetimes">
    <div class="cc-col-action-only cc-selectable"><span>&nbsp;</span></div>
    <div>Coto De Caza Golf &amp; Racquet Club</div><div>SOUTH COURSE</div><div>Tue 06/30</div>
    <div><table class="cc-table"><tbody><tr><td class="cc-tee-time-subtable"><span>02:20 PM</span></td></tr></tbody></table></div>
    <div class="cc-col-players">2</div>
  </td></tr>
<tr class="cc-tee-time-row" data-id="a2">
  <td colspan="6" class="cc-grid-myteetimes">
    <div class="cc-col-action-only cc-selectable"><span>&nbsp;</span></div>
    <div>Coto De Caza Golf &amp; Racquet Club</div><div>SOUTH COURSE</div><div>Wed 07/01</div>
    <div><table class="cc-table"><tbody><tr><td class="cc-tee-time-subtable"><span>08:10 AM</span></td></tr></tbody></table></div>
    <div class="cc-col-players">0</div>
  </td></tr>
<tr class="cc-tee-time-row" data-id="a3">
  <td colspan="6" class="cc-grid-myteetimes">
    <div class="cc-col-action-only cc-selectable"><span>&nbsp;</span></div>
    <div>Coto De Caza Golf &amp; Racquet Club</div><div>NORTH COURSE</div><div>Tue 07/07</div>
    <div><table class="cc-table"><tbody><tr><td class="cc-tee-time-subtable"><span>01:00 PM</span></td></tr></tbody></table></div>
    <div class="cc-col-players">3</div>
  </td></tr>
</tbody></table>
```

- [ ] **Step 2: Write the failing test `worker/test/parseTeeSheet.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTeeSheet } from '../src/invited/parseTeeSheet';

const html = readFileSync(fileURLToPath(new URL('./fixtures/teesheet.html', import.meta.url)), 'utf8');

describe('parseTeeSheet', () => {
  it('extracts all tee-time rows', () => {
    const slots = parseTeeSheet(html);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual({ club: 'Coto De Caza Golf & Racquet Club', course: 'SOUTH COURSE', date: 'Tue 06/30', time: '02:20 PM', slotsAvailable: 2 });
  });

  it('parses slot counts as numbers', () => {
    const slots = parseTeeSheet(html);
    expect(slots.map(s => s.slotsAvailable)).toEqual([2, 0, 3]);
  });

  it('filters available + a given mm/dd date via helper', () => {
    const slots = parseTeeSheet(html);
    const open = slots.filter(s => s.slotsAvailable > 0 && s.date.endsWith('07/07'));
    expect(open).toHaveLength(1);
    expect(open[0].course).toBe('NORTH COURSE');
  });
});
```

- [ ] **Step 3: Run the test, confirm it FAILS** — Run: `cd worker && npm test`. Expected: module not found.

- [ ] **Step 4: Implement `worker/src/invited/parseTeeSheet.ts`** (regex/DOM-light parser; runs in Node without a browser):
```ts
export type Slot = { club: string; course: string; date: string; time: string; slotsAvailable: number };

// Parses the CCTTWEB tee-sheet HTML into rows. Resilient to whitespace; reads each
// `tr.cc-tee-time-row` block: club/course/date divs, the tee-time span, and `.cc-col-players`.
export function parseTeeSheet(html: string): Slot[] {
  const rows = html.split(/<tr[^>]*class="[^"]*cc-tee-time-row[^"]*"[^>]*>/i).slice(1);
  const out: Slot[] = [];
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  for (const row of rows) {
    const block = row.split(/<\/tr>/i)[0];
    const divs = [...block.matchAll(/<div(?![^>]*cc-col-action-only)[^>]*>([\s\S]*?)<\/div>/gi)]
      .map(m => decode(m[1].replace(/<[^>]+>/g, ' ')))
      .filter(Boolean);
    const time = (block.match(/cc-tee-time-subtable[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const players = (block.match(/cc-col-players[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    const club = divs.find(d => /Club|Coto|Aliso|Old Ranch/i.test(d));
    const course = divs.find(d => /COURSE/i.test(d));
    const date = divs.find(d => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(d));
    if (!club || !course || !date || !time) continue;
    out.push({ club, course, date: decode(date), time: decode(time), slotsAvailable: parseInt(decode(players || '0'), 10) || 0 });
  }
  return out;
}
```

- [ ] **Step 5: Run the test, confirm PASS (3/3)** — Run: `cd worker && npm test`.

- [ ] **Step 6: Commit**
```bash
git add worker/src/invited/parseTeeSheet.ts worker/test
git commit -m "feat(m1b): tee-sheet parser with fixture-based unit tests"
```

---

## Task 3: invited Coto adapter (login + session reuse + scrape)

**Files:** `worker/src/invited/cotoAdapter.ts`

- [ ] **Step 1: Implement `worker/src/invited/cotoAdapter.ts`** — logs in (reusing a stored `storage_state` when valid), navigates to the CCTTWEB Coto sheet, returns the sheet HTML for the parser. Selectors are from the M0 spike (see Appendix).
```ts
import { chromium, type BrowserContext } from 'playwright';
import { db } from '../lib/supabase.ts';
import { decryptSecret } from '../lib/crypto.ts';
import { parseTeeSheet, type Slot } from './parseTeeSheet.ts';

const LOGIN = 'https://members.invitedclubs.com/club/scripts/login/login.asp';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function loadCreds(userId: string, clubId: string) {
  const sb = db();
  const { data, error } = await sb.from('credentials').select('username_enc,password_enc').eq('user_id', userId).eq('club_id', clubId).single();
  if (error || !data) throw new Error('no credential for user/club');
  const key = process.env.ENC_KEY!;
  return { user: decryptSecret(data.username_enc, key), pw: decryptSecret(data.password_enc, key) };
}

async function dismissModals(page: import('playwright').Page) {
  for (const t of ['Dismiss', 'OK', 'Close']) {
    const b = page.getByRole('button', { name: t });
    if (await b.count()) { await b.first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
  }
  await page.evaluate(() => document.querySelectorAll('.ui-widget-overlay').forEach((e) => e.remove())).catch(() => {});
}

/** Returns { slots, authMode } for the given user's Coto account on the requested date (mm/dd or null = all). */
export async function lookupCoto(userId: string, clubId: string, mmdd: string | null): Promise<{ slots: Slot[]; authMode: string }> {
  const { user, pw } = await loadCreds(userId, clubId);
  const browser = await chromium.launch({ headless: true });
  const ctx: BrowserContext = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  let authMode = 'full_login';
  try {
    const page = await ctx.newPage();
    await page.goto(LOGIN, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.fill('input[name="user"]', user);
    await page.fill('input[name="pw"]', pw);
    const remember = page.locator('input[name="save_login"]');
    if (await remember.count()) await remember.check().catch(() => {});
    await Promise.allSettled([page.waitForLoadState('networkidle', { timeout: 30000 }), page.click('#frmLogin button[type="submit"], #frmLogin input[type="submit"]')]);
    await page.waitForTimeout(1500);

    const href = await page.$$eval('a[href]', (as) => { const h = (as as HTMLAnchorElement[]).find((a) => (a.textContent || '').trim().toLowerCase() === 'book a tee time'); return h ? h.href : null; });
    if (!href) throw new Error('login failed or Book A Tee Time link missing');
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await Promise.allSettled([page.waitForLoadState('networkidle', { timeout: 30000 }), page.click('#home_club')]);
    await page.waitForTimeout(3500);
    await dismissModals(page);

    const html = await page.content();
    let slots = parseTeeSheet(html);
    if (mmdd) slots = slots.filter((s) => s.date.endsWith(mmdd));
    return { slots, authMode };
  } finally {
    await ctx.close();
    await browser.close();
  }
}
```
> Session-reuse via stored `storage_state` is a follow-up optimization (M1.5); this first cut does a full login each run (correct, just slower). Keep `authMode` so it can be reported in `jobs.auth_mode`.

- [ ] **Step 2: Typecheck** — Run: `cd worker && npx tsc --noEmit`. Expected: clean. (No unit test here — it needs the live site; covered by the E2E in Task 7.)

- [ ] **Step 3: Commit**
```bash
git add worker/src/invited/cotoAdapter.ts
git commit -m "feat(m1b): invited Coto adapter (login + navigate + scrape)"
```

---

## Task 4: Job queue RPCs (atomic claim + reaper)

**Files:** `supabase/migrations/20260630150000_jobs_rpcs.sql`

- [ ] **Step 1: Create the migration**
```sql
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
```

- [ ] **Step 2: Apply to hosted DB** (controller runs this with secrets; not a subagent step):
Run: `DBURL="$(grep -m1 '^SUPABASE_DB_URL=' .env.seed | cut -d= -f2-)"; npx --yes supabase db push --db-url "$DBURL"`
Expected: migration `20260630150000_jobs_rpcs` applied.

- [ ] **Step 3: Verify the RPC exists** — Run a service_role `rpc('reap_stuck_jobs')`; expect a number (0), no error.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260630150000_jobs_rpcs.sql
git commit -m "feat(m1b): claim_job + reap_stuck_jobs RPCs"
```

---

## Task 5: Worker job processor + HTTP server

**Files:** `worker/src/jobs/process.ts`, `worker/src/server.ts`

- [ ] **Step 1: Implement `worker/src/jobs/process.ts`**
```ts
import { db } from '../lib/supabase.ts';
import { lookupCoto } from '../invited/cotoAdapter.ts';

const LOOKUP_BUDGET = 120; // seconds

export async function processJob(jobId: string, workerId: string): Promise<void> {
  const sb = db();
  await sb.rpc('reap_stuck_jobs');
  const { data: claimed } = await sb.rpc('claim_job', { p_job_id: jobId, p_worker: workerId, p_budget_seconds: LOOKUP_BUDGET });
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return; // already claimed/processed
  try {
    if (job.type !== 'lookup') throw new Error('unsupported job type: ' + job.type);
    const { club_id, params } = job;
    const mmdd: string | null = params?.mmdd ?? null;
    const { slots, authMode } = await lookupCoto(job.user_id, club_id, mmdd);
    await sb.from('jobs').update({ status: 'done', result: { slots }, auth_mode: authMode, updated_at: new Date().toISOString() }).eq('id', jobId);
  } catch (e: any) {
    await sb.from('jobs').update({ status: 'failed', error: String(e?.message ?? e), updated_at: new Date().toISOString() }).eq('id', jobId);
  }
}
```
> `new Date().toISOString()` runs in the worker process (allowed — not a workflow script).

- [ ] **Step 2: Implement `worker/src/server.ts`** (plain Node http; no Express dependency)
```ts
import { createServer } from 'node:http';
import { processJob } from './jobs/process.ts';

const SECRET = process.env.WORKER_SHARED_SECRET!;
const PORT = Number(process.env.PORT ?? 8787);
const workerId = 'worker-' + process.pid;

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200).end('ok'); return; }
  if (req.method === 'POST' && req.url === '/run') {
    if (req.headers['x-worker-secret'] !== SECRET) { res.writeHead(401).end('unauthorized'); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let jobId: string | undefined;
      try { jobId = JSON.parse(body).jobId; } catch {}
      if (!jobId) { res.writeHead(400).end('missing jobId'); return; }
      // ack immediately; process in background
      res.writeHead(202).end('accepted');
      processJob(jobId, workerId).catch((e) => console.error('processJob error', e));
    });
    return;
  }
  res.writeHead(404).end('not found');
});
server.listen(PORT, () => console.log('worker listening on', PORT));
```

- [ ] **Step 3: Typecheck** — Run: `cd worker && npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Smoke-test the server boots** — Run (controller, with secrets): create `worker/.env.worker` from the example (fill SUPABASE_URL, SERVICE_ROLE_KEY, ENC_KEY, a WORKER_SHARED_SECRET), then `cd worker && node --env-file=.env.worker src/server.ts &` and `curl -s localhost:8787/health` → `ok`. Stop the server after.

- [ ] **Step 5: Commit**
```bash
git add worker/src/jobs worker/src/server.ts
git commit -m "feat(m1b): worker job processor + /run http server"
```

---

## Task 6: Dashboard lookup UI + job trigger

**Files:** `lib/jobs.ts`, `app/lookup/page.tsx`, `app/lookup/actions.ts`, `app/lookup/[jobId]/page.tsx`, `components/JobStatus.tsx`; modify `.env.local`

- [ ] **Step 1: Add worker env to `.env.local`** (server-only, not NEXT_PUBLIC):
```
WORKER_URL=http://localhost:8787
WORKER_SHARED_SECRET=<same value as worker/.env.worker>
```

- [ ] **Step 2: Create `app/lookup/actions.ts`** (server action: verify user, resolve Coto club, insert job, POST /run)
```ts
'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createLookup(formData: FormData) {
  const date = String(formData.get('date') || ''); // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid date');
  const mmdd = date.slice(5, 7) + '/' + date.slice(8, 10);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: club } = await supabase.from('clubs').select('id').eq('invited_facility_id', '29').single();
  if (!club) throw new Error('Coto club not found');

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({ user_id: user.id, type: 'lookup', club_id: club.id, params: { mmdd, date } })
    .select('id').single();
  if (error || !job) throw new Error(error?.message ?? 'job insert failed');

  // fire-and-forget trigger; worker acks 202 and processes async
  await fetch(`${process.env.WORKER_URL}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-secret': process.env.WORKER_SHARED_SECRET! },
    body: JSON.stringify({ jobId: job.id }),
  }).catch(() => { /* polling will still pick up the result if a retry trigger runs; for M1b a failed trigger surfaces as a stuck job */ });

  redirect(`/lookup/${job.id}`);
}
```

- [ ] **Step 3: Create `app/lookup/page.tsx`** (the form)
```tsx
import { createLookup } from './actions';

export default function LookupPage() {
  return (
    <main>
      <h1>티타임 조회 — Coto de Caza</h1>
      <form action={createLookup}>
        <label>날짜 <input type="date" name="date" required /></label>
        <button type="submit">조회</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Create `components/JobStatus.tsx`** (client; polls the job row every 3s)
```tsx
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Slot = { club: string; course: string; date: string; time: string; slotsAvailable: number };

export default function JobStatus({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState('queued');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    async function poll() {
      const { data } = await supabase.from('jobs').select('status,result,error').eq('id', jobId).single();
      if (!active || !data) return;
      setStatus(data.status);
      if (data.status === 'done') { setSlots((data.result?.slots ?? []) as Slot[]); }
      if (data.status === 'failed') { setError(data.error ?? '실패'); }
    }
    poll();
    const t = setInterval(() => { if (status !== 'done' && status !== 'failed') poll(); }, 3000);
    return () => { active = false; clearInterval(t); };
  }, [jobId, status]);

  if (error) return <p>조회 실패: {error}</p>;
  if (status !== 'done') return <p>조회 중… ({status})</p>;
  if (!slots || slots.length === 0) return <p>해당 날짜에 빈 티타임이 없습니다.</p>;
  return (
    <ul>
      {slots.filter((s) => s.slotsAvailable > 0).map((s, i) => (
        <li key={i}>{s.date} {s.time} · {s.course} · 빈자리 {s.slotsAvailable}</li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Create `app/lookup/[jobId]/page.tsx`**
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JobStatus from '@/components/JobStatus';

export default async function LookupResult({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <main>
      <h1>조회 결과</h1>
      <JobStatus jobId={jobId} />
      <p><a href="/lookup">새 조회</a></p>
    </main>
  );
}
```

- [ ] **Step 6: Add a link to `/lookup` on the home page** — edit `app/page.tsx`, adding a link above `<BottomNav />`:
```tsx
      <p><a className="btn" href="/lookup">티타임 조회</a></p>
```
(Place it just before `<BottomNav />` so the signed-in user can reach the lookup flow.)

- [ ] **Step 7: Build** — Run: `npm run build`. Expected: exit 0; `/lookup` and `/lookup/[jobId]` compile.

- [ ] **Step 8: Commit**
```bash
git add app/lookup components/JobStatus.tsx app/page.tsx
git commit -m "feat(m1b): dashboard lookup form, job trigger, polling result view"
```

---

## Task 7: End-to-end verification (controller, with secrets)

**Files:** none (verification)

- [ ] **Step 1: Start the worker** — `cd worker && node --env-file=.env.worker src/server.ts &` ; `curl localhost:8787/health` → `ok`.
- [ ] **Step 2: Start the dashboard** — `npm run dev` (root) with `.env.local` containing `WORKER_URL`/`WORKER_SHARED_SECRET`.
- [ ] **Step 3: Drive the flow** — Sign in (daeyoung71@gmail.com) → go to `/lookup` → pick a date within the booking window (today … +14d) → submit. The result page shows "조회 중…" then the real Coto slots for that date (or "빈 티타임 없음").
- [ ] **Step 4: Confirm via DB** — the `jobs` row transitioned `queued → running → done` with `result.slots` populated and `auth_mode` set. A bad date (in the past) returns an empty/clear result, not a crash.
- [ ] **Step 5: Stop both servers.**

> reCAPTCHA note: lookup only views the sheet (no booking submit), so the M0 reCAPTCHA-on-submit risk is not triggered here. If the live login ever returns a captcha/redirect instead of the member home, the adapter throws "login failed…", the job is marked `failed` with that reason, and we revisit (this is the R1 contingency).

---

## Task 8: Deploy worker to Render (controller + user)

**Files:** none (deployment)

- [ ] **Step 1: Push the repo to GitHub** (needed for Render + the later Vercel deploy). Create a private repo and push `feat/m1b-worker-lookup` (or merge to `main` first).
- [ ] **Step 2: Create a Render Web Service** from the repo, root directory `worker/`, build `npm install && npx playwright install chromium`, start `npm start`. Use a plan that keeps it warm (or accept cold starts for now).
- [ ] **Step 3: Set Render env vars** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENC_KEY`, `WORKER_SHARED_SECRET`, `PORT` (Render provides `PORT`).
- [ ] **Step 4: Point the dashboard at the deployed worker** — set `WORKER_URL` (Render URL) + matching `WORKER_SHARED_SECRET` in Vercel/`.env.local`.
- [ ] **Step 5: Re-run the Task 7 flow against the deployed worker.**

---

## Out of scope (next plans)
- **M1.5:** session reuse (store/restore `storage_state` per credential; `auth_mode=session_reuse`).
- **M2:** booking execution (player grid, foursome validation, reCAPTCHA handling / assisted-manual handoff), companion DB UI, PWA verification.
- **M2.5:** Claude chat-assist (NLU → form prefill).
- **M3:** wife's account + Aliso/Old Ranch adapters.

---

## Appendix — M0-confirmed invited facts (selectors/flow)
- Login: `https://members.invitedclubs.com/club/scripts/login/login.asp`, `form#frmLogin`, `input[name="user"]`, `input[name="pw"]`, `input[name="save_login"]`, submit button. No captcha on login; works from a cloud IP.
- After login: member home `mylocker.asp`; link text **"Book A Tee Time"** → `apps.invitedclubs.com/portal/pls/portal/!CCTTWEB.controller?...` (SSO).
- CCTTWEB entry: `button#home_club` ("Continue to Home Club") → tee sheet.
- Tee sheet: dismiss the "Messages" jQuery-UI dialog (`.ui-widget-overlay` + a **Dismiss** button) before interacting. Rows: `tr.cc-tee-time-row`; within each, club/course/date `<div>`s, time in `td.cc-tee-time-subtable > span`, availability in `div.cc-col-players`. Coto courses: NORTH / SOUTH. Booking window ≈ 14 days.
- Coto `invited_facility_id = 29`. Booking app has **invisible reCAPTCHA Enterprise** that fires on booking interactions (relevant to M2, not lookup).
