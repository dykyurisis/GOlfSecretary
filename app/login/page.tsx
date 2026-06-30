'use client';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }
  return (
    <main>
      <h1>골프 티타임 비서</h1>
      <p>허용된 Google 계정으로만 로그인할 수 있습니다.</p>
      <button onClick={signIn}>Google로 로그인</button>
    </main>
  );
}
