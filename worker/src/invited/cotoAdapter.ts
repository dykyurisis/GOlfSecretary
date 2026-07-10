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
  // --no-sandbox: Chromium refuses to run as root inside a container without it.
  // --disable-dev-shm-usage: Render/containers give a tiny /dev/shm; avoids Chromium OOM crashes.
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx: BrowserContext = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const authMode = 'full_login';
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
