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
