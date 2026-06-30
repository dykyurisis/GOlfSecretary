// RLS verification (hosted, no Docker): proves the DB-enforced Gmail allowlist works.
// An allow-listed signed-in user sees the shared clubs; a non-allow-listed signed-in user sees zero rows.
// Run: node --env-file=.env.seed scripts/rls-check.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Need SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const ALLOWED = 'rls-allowed@example.com';
const INTRUDER = 'rls-intruder@example.com';
const PW = 'rls-test-pw-12345';

async function deleteTestUser(email) {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find((x) => x.email === email);
  if (u) { await admin.from('users').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
}
async function makeUser(email) {
  await deleteTestUser(email);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').upsert({ id: data.user.id, email }, { onConflict: 'id' });
  return data.user.id;
}
async function signedInClubsCount(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await c.auth.signInWithPassword({ email, password: PW });
  if (sErr) throw new Error('sign-in failed for ' + email + ': ' + sErr.message);
  const { count } = await c.from('clubs').select('*', { count: 'exact', head: true });
  const { data: allowed } = await c.rpc('is_allowed_user');
  await c.auth.signOut();
  return { count: count ?? 0, allowed: allowed === true };
}

let pass = true;
try {
  // setup: allowlist only the ALLOWED email; both users exist in auth
  await admin.from('allowed_users').upsert({ email: ALLOWED }, { onConflict: 'email' });
  await makeUser(ALLOWED);
  await makeUser(INTRUDER);

  const a = await signedInClubsCount(ALLOWED);
  const i = await signedInClubsCount(INTRUDER);

  const checks = [
    ['allow-listed user is_allowed_user() == true', a.allowed === true],
    ['allow-listed user sees clubs (>=3)', a.count >= 3],
    ['intruder is_allowed_user() == false', i.allowed === false],
    ['intruder sees ZERO clubs (RLS blocks)', i.count === 0],
  ];
  for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) pass = false; }
  console.log(`\nallowed: clubs=${a.count} allowed=${a.allowed} | intruder: clubs=${i.count} allowed=${i.allowed}`);
} catch (e) {
  console.error('ERROR:', e.message); pass = false;
} finally {
  // cleanup
  await deleteTestUser(ALLOWED);
  await deleteTestUser(INTRUDER);
  await admin.from('allowed_users').delete().eq('email', ALLOWED);
}
console.log(pass ? '\n✅ RLS allowlist verified' : '\n❌ RLS check failed');
process.exit(pass ? 0 : 1);
