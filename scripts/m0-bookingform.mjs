// M0 spike (part 4) — open ONE available tee-time row, MAP the booking form, then cancel/close.
// STRICTLY READ-ONLY: never clicks reserve/confirm/book/submit. Releases any hold by cancel/close.
// Run: node --env-file=.env scripts/m0-bookingform.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const USER = process.env.INVITED_USER || '';
const PW = process.env.INVITED_PW || '';
if (!USER || !PW) { console.error('Missing creds'); process.exit(1); }
const OUT = '.m0-out';
mkdirSync(OUT, { recursive: true });
const redact = (s) => (s || '').split(PW).join('[REDACTED_PW]').split(USER).join('[REDACTED_USER]');
const LOGIN = 'https://members.invitedclubs.com/club/scripts/login/login.asp';
const FORBID = /reserve|confirm|^book|submit|finish|complete|pay/i; // never click these

async function dismissModals(page) {
  // Close the informational "Messages" (aeration) dialog via its button, then clear any leftover
  // blocking overlay. IMPORTANT: do NOT remove .ui-dialog containers — the app reuses one to render
  // the booking popup.
  for (const t of ['Dismiss', 'OK', 'Close', 'Got it', 'Continue']) {
    const b = page.getByRole('button', { name: t });
    if (await b.count() > 0) { await b.first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
  }
  await page.evaluate(() => document.querySelectorAll('.ui-widget-overlay').forEach(e => e.remove())).catch(() => {});
  await page.waitForTimeout(300);
}

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
  await Promise.allSettled([page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.click('#frmLogin button[type="submit"], #frmLogin input[type="submit"]')]);
  await page.waitForTimeout(1500);
  const href = await page.$$eval('a[href]', as => { const h = as.find(a => (a.textContent || '').trim().toLowerCase() === 'book a tee time'); return h ? h.href : null; });
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  await Promise.allSettled([page.waitForLoadState('networkidle', { timeout: 30000 }), page.click('#home_club')]);
  await page.waitForTimeout(3500);
  await dismissModals(page); // close greens/aeration "Messages" popup that overlays the sheet

  // pick first row with >=1 available slot (slots live in .cc-col-players, not a <td>)
  const pick = await page.$$eval('tr.cc-tee-time-row', rows => {
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i].querySelector('.cc-col-players');
      const n = parseInt((p && p.textContent || '').trim(), 10);
      if (Number.isFinite(n) && n >= 1) return { index: i, slots: n, rowText: rows[i].innerText.replace(/\s+/g, ' ').trim().slice(0, 80) };
    }
    return null;
  });
  out.chosenRow = pick;
  if (!pick) throw new Error('no available row found');

  const before = page.url();
  await dismissModals(page);
  // the clickable action is the .cc-col-action-only.cc-selectable div inside the row
  const action = page.locator('tr.cc-tee-time-row').nth(pick.index).locator('.cc-col-action-only, .cc-selectable').first();
  await action.click({ timeout: 8000 }).catch(async () => {
    await dismissModals(page);
    await action.click({ timeout: 8000, force: true });
  });
  await page.waitForTimeout(5000); // allow booking dialog + invisible reCAPTCHA to resolve

  // map whatever booking UI appeared (dialog or new view)
  const recaptchaExecuted = page.frames().some(f => /recaptcha/i.test(f.url()) && /execute|bframe/i.test(f.url()));
  const dialogTitles = await page.$$eval('.ui-dialog .ui-dialog-title, .ui-dialog-titlebar', els => els.map(e => e.textContent.trim()).filter(Boolean));
  const fields = await page.$$eval('input,select,textarea', els => els
    .filter(el => el.offsetParent !== null) // visible only
    .slice(0, 80).map(el => ({ tag: el.tagName.toLowerCase(), type: el.type || null, name: el.name || null, id: el.id || null,
      placeholder: el.placeholder || null, value: (el.value || '').slice(0, 25),
      optionsSample: el.tagName.toLowerCase() === 'select' ? Array.from(el.options).slice(0, 8).map(o => o.text.trim()) : undefined })));
  const buttons = await page.$$eval('button,a,input[type=submit],input[type=button],.cc-button,[role=button]', els => els
    .filter(el => el.offsetParent !== null)
    .map(el => (el.value || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30))
    .filter(Boolean).slice(0, 60));
  const bodyText = (await page.locator('body').innerText().catch(() => '') || '').replace(/\s+/g, ' ');
  const labelHints = (bodyText.match(/\b(member|guest|player|hole|9|18|cart|wal(k|king)|rider?|number|name|select)\b/gi) || []);
  const labelHintCounts = labelHints.reduce((m, w) => { const k = w.toLowerCase(); m[k] = (m[k] || 0) + 1; return m; }, {});

  out.bookingForm = {
    urlChanged: page.url() !== before, url: page.url(),
    recaptchaExecuted, dialogTitles,
    visibleFieldCount: fields.length, fields,
    buttons, labelHintCounts,
    bodyTextSample: redact(bodyText.slice(0, 2000)),
  };
  writeFileSync(`${OUT}/bookingform.html`, redact(await page.content()), 'utf8');
  await page.screenshot({ path: `${OUT}/bookingform.png`, fullPage: true }).catch(() => {});

  // RELEASE: try to cancel/close (never confirm). Click a safe cancel/close if present.
  const safeClose = page.locator('button, a, .cc-button, [role=button]').filter({ hasText: /cancel|close|back|dismiss|exit/i });
  if (await safeClose.count() > 0) { await safeClose.first().click({ timeout: 5000 }).catch(() => {}); out.released = 'clicked cancel/close'; }
  else { out.released = 'no cancel button found; closing browser to drop hold'; }

  writeFileSync(`${OUT}/bookingform-summary.json`, redact(JSON.stringify(out, null, 2)), 'utf8');
  console.log(JSON.stringify(out, null, 2));
  console.log('\nNOTE: forbidden submit-like buttons were NEVER clicked. FORBID =', String(FORBID));
} catch (e) {
  console.error('BOOKINGFORM ERROR:', redact(String(e && e.message ? e.message : e)));
  try { writeFileSync(`${OUT}/bookingform-error.txt`, redact(String(e && e.stack ? e.stack : e)), 'utf8'); } catch {}
} finally { await browser.close(); }
