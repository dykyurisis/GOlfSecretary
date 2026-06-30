import { createClient } from '@supabase/supabase-js';
import { encryptSecret } from '../lib/crypto.ts';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENC_KEY, ALLOWED_EMAILS,
        SEED_INVITED_USER, SEED_INVITED_PW } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ENC_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ENC_KEY');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1) allowlist
const emails = (ALLOWED_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
for (const email of emails) {
  const { error } = await db.from('allowed_users').upsert({ email }, { onConflict: 'email' });
  if (error) throw error;
}
console.log('allowed_users:', emails.length);

// 2) clubs (idempotent by name)
const clubs = [
  { name: 'Coto de Caza Golf & Racquet Club', invited_facility_id: '29', booking_window_days: 14 },
  { name: 'Aliso Viejo Country Club',         invited_facility_id: '149', booking_window_days: 14 },
  { name: 'Old Ranch Country Club',           invited_facility_id: '40295', booking_window_days: 14 },
];
for (const c of clubs) {
  const { error } = await db.from('clubs').upsert({ ...c, provider: 'invited' }, { onConflict: 'name' });
  if (error) throw error;
}
console.log('clubs:', clubs.length);

// 3) optional: seed one encrypted credential (Coto + the first allowed user)
if (SEED_INVITED_USER && SEED_INVITED_PW) {
  const { data: coto } = await db.from('clubs').select('id').eq('invited_facility_id', '29').single();
  const ownerEmail = emails[0];
  const { data: authUser } = await db.auth.admin.listUsers();
  const owner = authUser.users.find(u => u.email === ownerEmail);
  if (!owner) { console.warn('owner auth user not found; sign in once first, then re-run for credentials'); }
  else {
    await db.from('users').upsert({ id: owner.id, email: ownerEmail }, { onConflict: 'id' });
    const { error } = await db.from('credentials').upsert({
      user_id: owner.id, club_id: coto.id,
      username_enc: encryptSecret(SEED_INVITED_USER, ENC_KEY),
      password_enc: encryptSecret(SEED_INVITED_PW, ENC_KEY),
      status: 'active',
    }, { onConflict: 'user_id,club_id' });
    if (error) throw error;
    console.log('seeded Coto credential for', ownerEmail);
  }
}
console.log('seed done');
