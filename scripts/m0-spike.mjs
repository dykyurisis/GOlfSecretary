// M0 spike — invited login + post-login structure mapping.
// Reads credentials from .env via `node --env-file=.env` so they never appear in tool args.
// Run: npm run m0
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const USER = process.env.INVITED_USER || '';
const PW = process.env.INVITED_PW || '';
if (!USER || !PW) { console.error('Missing INVITED_USER / INVITED_PW'); process.exit(1); }

const OUT = '.m0-out';
mkdirSync(OUT, { recursive: true });

// Redact secrets from anything we persist.
const redact = (s) => (s || '')
  .split(PW).join('[REDACTED_PW]')
  .split(USER).join('[REDACTED_USER]');

const LOGIN = 'https://members.invitedclubs.com/club/scripts/login/login.asp';
const KEYWORDS = /tee|golf|reserv|book|time|calendar|schedule/i;

const summary = {};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
});
const page = await ctx.newPage();

function detectChallenge(html, title) {
  return /just a moment|attention required|cf-chl|challenge-platform|verifying you are human|cf-browser-verification/i.test(html)
    || /just a moment|attention required/i.test(title || '');
}

try {
  // --- Step 1: login page ---
  await page.goto(LOGIN, { waitUntil: 'domcontentloaded', timeout: 45000 });
  let html = await page.content();
  summary.loginPage = {
    url: page.url(), title: await page.title(),
    challenge: detectChallenge(html, await page.title()),
    hasUserField: await page.locator('input[name="user"]').count() > 0,
    hasPwField: await page.locator('input[name="pw"]').count() > 0,
  };

  // --- Step 2: fill + submit ---
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="pw"]', PW);
  // check "remember me" to probe persistent-session behavior
  const remember = page.locator('input[name="save_login"]');
  if (await remember.count() > 0) { try { await remember.check(); } catch {} }

  await Promise.allSettled([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.click('#frmLogin button[type="submit"], #frmLogin input[type="submit"]'),
  ]);
  await page.waitForTimeout(2500);

  // --- Step 3: post-login assessment ---
  html = await page.content();
  const title = await page.title();
  const postUrl = page.url();
  const stillOnLogin = /login\.asp|Login_Validate/i.test(postUrl);
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';

  // collect links
  const links = await page.$$eval('a[href]', (as) => as.map(a => ({
    text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
    href: a.href,
  })));
  const dedup = [];
  const seen = new Set();
  for (const l of links) { if (l.href && !seen.has(l.href)) { seen.add(l.href); dedup.push(l); } }
  const teeLinks = dedup.filter(l => KEYWORDS.test(l.text + ' ' + l.href)).slice(0, 40);

  // login success heuristics
  const logoutLink = dedup.find(l => /log\s?out|sign\s?out|logoff/i.test(l.text + ' ' + l.href));
  const errorText = /invalid|incorrect|not recognized|try again|error|locked|verify/i.test(bodyText.slice(0, 4000));

  // cookies: metadata only, NOT values
  const cookies = (await ctx.cookies()).map(c => ({
    name: c.name, domain: c.domain, path: c.path,
    expires: c.expires === -1 ? 'session' : new Date(c.expires * 1000).toISOString(),
    httpOnly: c.httpOnly, secure: c.secure,
  }));

  summary.postLogin = {
    url: postUrl, title, stillOnLogin,
    challenge: detectChallenge(html, title),
    looksLoggedIn: !!logoutLink && !stillOnLogin,
    logoutLinkFound: !!logoutLink,
    errorTextDetected: errorText,
    totalLinks: dedup.length,
    teeRelatedLinks: teeLinks,
    cookieCount: cookies.length,
    cookies,
  };

  // persist redacted artifacts for inspection
  writeFileSync(`${OUT}/post-login.html`, redact(html), 'utf8');
  writeFileSync(`${OUT}/all-links.json`, redact(JSON.stringify(dedup, null, 2)), 'utf8');
  await page.screenshot({ path: `${OUT}/post-login.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${OUT}/summary.json`, redact(JSON.stringify(summary, null, 2)), 'utf8');

  // safe stdout (no secrets)
  console.log(JSON.stringify(summary, null, 2));
} catch (e) {
  console.error('SPIKE ERROR:', redact(String(e && e.message ? e.message : e)));
  try { writeFileSync(`${OUT}/error.txt`, redact(String(e && e.stack ? e.stack : e)), 'utf8'); } catch {}
} finally {
  await browser.close();
}
