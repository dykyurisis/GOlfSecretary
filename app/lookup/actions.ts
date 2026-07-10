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

  await fetch(`${process.env.WORKER_URL}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-secret': process.env.WORKER_SHARED_SECRET! },
    body: JSON.stringify({ jobId: job.id }),
  }).catch(() => { /* trigger failure surfaces as a stuck job; polling still reflects state */ });

  redirect(`/lookup/${job.id}`);
}
