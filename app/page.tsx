import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Allowlist is enforced in the DB; is_allowed_user() reflects the allowed_users table.
  // Fail closed: only render when explicitly allowed (RPC error/null -> redirect).
  const { data: allow } = await supabase.rpc('is_allowed_user');
  if (allow !== true) redirect('/not-allowed');

  return (
    <main>
      <h1>홈</h1>
      <p>{user.email} 님 환영합니다.</p>
      <p style={{ color: '#888' }}>티타임 조회/예약은 다음 단계(M1b)에서 추가됩니다.</p>
      <form action="/auth/signout" method="post"><button type="submit">로그아웃</button></form>
      <p><a className="btn" href="/lookup">티타임 조회</a></p>
      <BottomNav />
    </main>
  );
}
