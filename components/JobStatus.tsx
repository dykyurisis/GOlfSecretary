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
