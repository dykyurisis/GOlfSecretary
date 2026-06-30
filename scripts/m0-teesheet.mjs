// M0 spike (part 3) — reach the actual Coto tee sheet and map date range / slots / booking form.
// READ-ONLY: never clicks a final reserve/book submit.
// Run: node --env-file=.env scripts/m0-teesheet.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const USER = process.env.INVITED_USER || '';
const PW = process.env.INVITED_PW || '';
if (!USER || !PW) { console.error('Missing creds'); process.exit(1); }
const OUT = '.m0-out';
mkdirSync(OUT, { recursive: true });
const redact = (s) => (s || '').split(PW).join('[REDACTED_PW]').split(USER).join('[REDACTED_USER]');
const LOGIN = 'https://members.invitedclubs.com/club/scripts/login/login.asp';

const out = {};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 }, locale: 'en-US',
});
const page = await ctx.newPage();
try {
  await page.goto(LOGIN, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="pw"]', PW);
  const r = page.locator('input[name="save_login"]'); if (await r.count()) { try { await r.check(); } catch {} }
  await Promise.allSettled([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.click('#frmLogin button[type="submit"], #frmLogin input[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);

  const href = await page.$$eval('a[href]', as => {
    const h = as.find(a => (a.textContent || '').trim().toLowerCase() === 'book a tee time'); return h ? h.href : null;
  });
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  // click "Continue to Home Club"
  await Promise.allSettled([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.click('#home_club'),
  ]);
  await page.waitForTimeout(3500);

  const title = await page.title().catch(() => '');
  const url = page.url();
  const html = await page.content();

  // date controls (find booking window)
  const dateControls = await page.$$eval('input,select', els => els
    .filter(el => /date|cal|day|sched/i.test((el.name || '') + (el.id || '') + (el.className || '')) || el.type === 'date')
    .slice(0, 20)
    .map(el => ({ tag: el.tagName.toLowerCase(), type: el.type || null, name: el.name || null, id: el.id || null,
      value: (el.value || '').slice(0, 30), min: el.min || null, max: el.max || null })));

  const selects = await page.$$eval('select', ss => ss.map(s => ({ name: s.name, id: s.id,
    optionCount: s.options.length, sample: Array.from(s.options).slice(0, 10).map(o => o.text.trim()) })));

  const buttons = await page.$$eval('button,input[type=submit],a', els => els.slice(0, 80)
    .map(el => (el.value || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30))
    .filter(t => t && /book|reserve|time|date|next|prev|search|continue|select|am|pm|:\d\d/i.test(t)).slice(0, 40));

  const bodyText = (await page.locator('body').innerText().catch(() => '') || '').replace(/\s+/g, ' ');
  const windowHints = (bodyText.match(/[^.]*\b(\d+\s*days?|advance|opens?|booking window|days? in advance)\b[^.]*/gi) || []).slice(0, 8);
  const frames = page.frames().map(f => ({ name: f.name(), url: f.url() }));

  out.teeSheet = {
    url, title, dateControls, selects, buttons,
    windowHints: windowHints.map(redact),
    bodyTextSample: redact(bodyText.slice(0, 1800)),
    frames, htmlLen: html.length,
  };
  writeFileSync(`${OUT}/teesheet.html`, redact(html), 'utf8');
  await page.screenshot({ path: `${OUT}/teesheet.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${OUT}/teesheet-summary.json`, redact(JSON.stringify(out, null, 2)), 'utf8');
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('TEESHEET ERROR:', redact(String(e && e.message ? e.message : e)));
  try { writeFileSync(`${OUT}/teesheet-error.txt`, redact(String(e && e.stack ? e.stack : e)), 'utf8'); } catch {}
} finally { await browser.close(); }
