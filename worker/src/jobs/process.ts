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
    const dateISO: string | null = params?.date ?? null; // "YYYY-MM-DD"
    if (!dateISO) throw new Error('missing date param');
    const { slots, authMode } = await lookupCoto(job.user_id, club_id, dateISO);
    await sb.from('jobs').update({ status: 'done', result: { slots }, auth_mode: authMode, updated_at: new Date().toISOString() }).eq('id', jobId);
  } catch (e: any) {
    await sb.from('jobs').update({ status: 'failed', error: String(e?.message ?? e), updated_at: new Date().toISOString() }).eq('id', jobId);
  }
}
