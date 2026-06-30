// M0 spike (part 2) — log in, then follow "Book A Tee Time" into the CCTTWEB app and map it.
// READ-ONLY: maps structure only; never submits a booking.
// Run: npm run m0tt
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const USER = process.env.INVITED_USER || '';
const PW = process.env.INVITED_PW || '';
if (!USER || !PW) { console.error('Missing INVITED_USER / INVITED_PW'); process.exit(1); }

const OUT = '.m0-out';
mkdirSync(OUT, { recursive: true });
const redact = (s) => (s || '').split(PW).join('[REDACTED_PW]').split(USER).join('[REDACTED_USER]');
const LOGIN = 'https://members.invitedclubs.com/club/scripts/login/login.asp';

async function dumpPage(page, tag) {
  const html = await page.content();
  const title = await page.title().catch(() => '');
  const forms = await page.$$eval('form', fs => fs.map(f => ({ name: f.name, id: f.id, action: f.action, method: f.method })));
  const inputs = await page.$$eval('input,select,button', els => els.slice(0, 60).map(el => ({
    tag: el.tagName.toLowerCase(), type: el.type || null, name: el.name || null, id: el.id || null,
    text: (el.value || el.textContent || '').trim().slice(0, 30),
  })));
  const selects = await page.$$eval('select', ss => ss.map(s => ({
    name: s.name, id: s.id, options: Array.from(s.options).slice(0, 12).map(o => o.text.trim()),
  })));
  const frames = page.frames().map(f => ({ name: f.name(), url: f.url() }));
  const bodyText = (await page.locator('body').innerText().catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 1500);
  writeFileSync(`${OUT}/${tag}.html`, redact(html), 'utf8');
  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true }).catch(() => {});
  return { url: page.url(), title, forms, inputs, selects, frames, htmlLen: html.length, bodyTextSample: redact(bodyText) };
}

const out = {};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 }, locale: 'en-US',
});
const page = await ctx.newPage();

try {
  // login
  await page.goto(LOGIN, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="pw"]', PW);
  const remember = page.locator('input[name="save_login"]');
  if (await remember.count() > 0) { try { await remember.check(); } catch {} }
  await Promise.allSettled([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.click('#frmLogin button[type="submit"], #frmLogin input[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);
  out.afterLogin = { url: page.url(), title: await page.title() };

  // find exact "Book A Tee Time" link (exclude Troon)
  const href = await page.$$eval('a[href]', as => {
    const hit = as.find(a => (a.textContent || '').trim().toLowerCase() === 'book a tee time');
    return hit ? hit.href : null;
  });
  out.teeTimeHref = href;
  if (!href) throw new Error('Book A Tee Time link not found');

  // navigate into the tee-time app (may open same tab or popup)
  let ttPage = page;
  const popupP = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(async () => {
    // if goto failed, try clicking
    await page.getByRole('link', { name: 'Book A Tee Time', exact: true }).click({ timeout: 8000 }).catch(() => {});
  });
  const popup = await popupP;
  if (popup) { ttPage = popup; await ttPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {}); }
  await ttPage.waitForTimeout(3000);

  out.teeTimeApp = await dumpPage(ttPage, 'teetime-app');

  // if the app uses a content frame, dump the largest non-blank frame too
  const frames = ttPage.frames().filter(f => f.url() && !/about:blank/.test(f.url()));
  out.frameCount = frames.length;

  writeFileSync(`${OUT}/teetime-summary.json`, redact(JSON.stringify(out, null, 2)), 'utf8');
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('TEETIME SPIKE ERROR:', redact(String(e && e.message ? e.message : e)));
  try { writeFileSync(`${OUT}/teetime-error.txt`, redact(String(e && e.stack ? e.stack : e)), 'utf8'); } catch {}
} finally {
  await browser.close();
}
