# Worker deployment — Render (M1b Task 8)

Deploys the Playwright worker (`worker/`) to Render as an always-on web service so the
Vercel dashboard can trigger tee-time lookups in production. The dashboard stays on Vercel;
this only deploys the worker.

Artifacts (already committed on `feat/m1b-worker-lookup`):
- `render.yaml` (repo root) — Render Blueprint (Docker web service, region ohio, `/health` check).
- `worker/Dockerfile` — Node 24 + Chromium (`playwright install --with-deps chromium`).
- `worker/.dockerignore` — keeps host `node_modules` and secrets out of the image.
- `worker/package.json` — `start` uses `--env-file-if-exists` so the same command works with
  Render-injected env (no `.env.worker` file in the container).

---

## Environment variables (set in the Render dashboard, `sync:false`)

| Var | Source (do NOT commit values) | Must match |
|---|---|---|
| `SUPABASE_URL` | `.env.seed` → `SUPABASE_URL` | — |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.seed` → `SUPABASE_SERVICE_ROLE_KEY` | — |
| `ENC_KEY` | `.env.seed` / `worker/.env.worker` → `ENC_KEY` | **the key the credentials were seeded with** (else decrypt fails) |
| `WORKER_SHARED_SECRET` | `worker/.env.worker` → `WORKER_SHARED_SECRET` | **Vercel's `WORKER_SHARED_SECRET`** (dashboard → worker auth) |
| `PORT` | provided by Render automatically | — (server reads `process.env.PORT`) |

---

## Recommended order — zero broken-prod window

Merging M1b to `main` deploys `/lookup` to Vercel prod, but `/lookup` is dead until the worker
is live and Vercel knows its URL. So deploy the worker **first**, then merge.

### 1. Push the branch to GitHub
```bash
git push -u origin feat/m1b-worker-lookup
```
(Repo: `dykyurisis/GOlfSecretary`. Skip if already pushed.)

### 2. Create the Render service from the Blueprint
1. Render Dashboard → **New → Blueprint**.
2. Select the `GOlfSecretary` repo and the **`feat/m1b-worker-lookup`** branch.
3. Render reads `render.yaml` and shows the `golf-teetime-worker` service. Apply.
4. When prompted, paste the four `sync:false` env vars from the table above.
5. Wait for the build (first build is slow — it downloads Chromium + apt deps).

> **Plan / cost:** `render.yaml` sets `plan: starter` (warm, ~always-on — matches the PRD).
> To avoid the charge, change it to `free`, but note: free instances spin down after ~15 min
> idle, and the dashboard's fire-and-forget `POST /run` will hit a cold start (the job stays
> `queued` and the reaper eventually fails it — M1b has no retry trigger). If you go free, add a
> cron job pinging `https://<worker>.onrender.com/health` every ~10 min to keep it warm.

### 3. Smoke-test the deployed worker
```bash
curl https://<your-worker>.onrender.com/health      # -> ok
```

### 4. Point the dashboard at the worker (Vercel)
Vercel → project → Settings → Environment Variables (Production), add **server-only** (NOT `NEXT_PUBLIC_`):
- `WORKER_URL` = `https://<your-worker>.onrender.com`
- `WORKER_SHARED_SECRET` = same value as the worker's `WORKER_SHARED_SECRET`

### 5. Merge and verify
```bash
git checkout main && git merge --no-ff feat/m1b-worker-lookup && git push
```
- Vercel auto-deploys the dashboard; `/lookup` now works end to end.
- (Optional) In Render, switch the service's tracked branch to `main` and set `autoDeploy: true`
  so future pushes redeploy the worker.
- Verify: sign in at `https://invitedclub.vercel.app` → `/lookup` → pick a date within ~14 days
  → the result page shows the scraped Coto slots (or "모두 만석 / 빈 티타임 없음").
- Confirm in Supabase: the `jobs` row went `queued → running → done` with `result.slots` and
  `auth_mode` set, `claimed_by` = the Render worker.

### Simpler alternative (accepts a few-minutes broken `/lookup`)
Merge to `main` first, create the Blueprint from `main`, then do steps 2–4. Only the 2 of you
use `/lookup`, so the gap is harmless.

---

## Troubleshooting
- **`login failed or Book A Tee Time link missing`** — invited returned a captcha/device-verify
  or changed markup (R1/R2). The job is marked `failed` with this reason; no booking is attempted.
- **Chromium won't launch / OOM** — the adapter already passes `--no-sandbox` and
  `--disable-dev-shm-usage`; ensure the image built via `worker/Dockerfile` (not the native Node
  runtime, which lacks Chromium's system libs).
- **`no credential for user/club` / decrypt errors** — `ENC_KEY` on Render must be the exact key
  the credentials were seeded with.
- **`401 unauthorized` on `/run`** — Render's `WORKER_SHARED_SECRET` ≠ Vercel's.

---

## Known limitation (carry into M2)
Lookup scrapes the **"My Tee Times"** sheet (`SheetDetails-MyTeeTimes`) that loads after
"Continue to Home Club", then filters by date. That is a digest of tee times you're part of —
**not** the full per-date availability grid for finding open times to book. Mapping the CCTTWEB
date-search → open-slots flow was deferred by the M0 spike and belongs with booking (M2).
