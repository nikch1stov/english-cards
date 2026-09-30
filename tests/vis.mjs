import { webkit, devices } from 'playwright';
import fs from 'fs';
const fake = fs.readFileSync(new URL('./fake-supabase.js', import.meta.url), 'utf8');
const b = await webkit.launch();
async function page(scheme) {
  const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', colorScheme: scheme });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: fake }));
  await ctx.addInitScript(scheme => {
    if (localStorage.getItem('fake-session')) return;
    localStorage.setItem('fake-session', JSON.stringify({ user: { id: 'u1', email: 'n@x', user_metadata: { full_name: 'Nik' } } }));
    const d = new Date(); const k = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    const days = {}; for (let i = 20; i >= 0; i--) days[k(i)] = { reviewed: 10, new: { 'en-ru': 3 }, known: { 'en-ru': 7 + (i % 3) }, wrong: { 'en-ru': 2 }, snap: { 'en-ru': { learned: 40 - i * 2, started: 80 - i * 2 } } };
    const prog = {}; ['i', 'you', 'he', 'she', 'it', 'we', 'they'].forEach((w, i) => prog[w] = { ivl: i < 4 ? 8 : 1, reps: 3, lapses: 0, due: '2026-09-29' });
    localStorage.setItem('english-cards:v1', JSON.stringify({ settings: { dir: 'en-ru', newPerDay: 10, onboarded: true, theme: scheme, themeSet: true }, progress: { 'en-ru': prog, 'ru-en': {} }, days }));
    sessionStorage.setItem('english-cards:letter', 'A');
  }, scheme);
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (/Content Security|Refused/i.test(m.text())) p.errs.push(m.text()); });
  return p;
}
for (const scheme of ['light', 'dark']) {
  const p = await page(scheme);
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  await p.screenshot({ path: `v-splash-${scheme}.png` });
  await p.tap('#splash', { position: { x: 30, y: 600 } }); await p.waitForTimeout(1400);
  await p.screenshot({ path: `v-home-${scheme}.png` });
  if (scheme === 'light') {
    // scroll guard: a tap right after a scroll is ignored, a normal tap works
    await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(30);
    await p.evaluate(() => window.scrollTo(0, 420));
    await p.tap('[data-study="Семья"]'); await p.waitForTimeout(400);
    console.log('tap while gliding ignored:', await p.evaluate(() => document.body.dataset.screen) === 'home');
    await p.waitForTimeout(400);
    await p.tap('[data-study="Семья"]'); await p.waitForTimeout(600);
    console.log('normal tap works:', await p.evaluate(() => document.body.dataset.screen) === 'study');
    await p.tap('.study-top [data-go="home"]'); await p.waitForTimeout(600);
  }
  await p.tap('#app [data-study="*"]'); await p.waitForTimeout(700);
  console.log('after start:', await p.evaluate(() => [document.body.dataset.screen, scrollY]));
  await p.tap('.flash', { position: { x: 60, y: 90 } }); await p.waitForTimeout(700);
  console.log('after flip tap:', await p.evaluate(() => [document.body.dataset.screen, document.querySelector('.flash')?.className, scrollY]));
  await p.screenshot({ path: `v-back-${scheme}.png` });
  await p.tap('[data-grade="1"]'); await p.waitForTimeout(110);
  await p.screenshot({ path: `v-press-yes-${scheme}.png` });
  console.log(scheme, 'mid-press:', await p.getAttribute('.flash', 'class'), '| bloom:', await p.$$eval('.bloom', e => e.length));
  await p.waitForTimeout(700);
  console.log('next card after grade, progress:', await p.textContent('.study-top .num'), await p.$eval('.progress > span', e => e.style.width));
  await p.tap('.flash', { position: { x: 60, y: 90 } }); await p.waitForTimeout(700);
  await p.tap('[data-grade="0"]'); await p.waitForTimeout(110);
  await p.screenshot({ path: `v-press-no-${scheme}.png` });
  await p.waitForTimeout(700);
  // double tap protection
  await p.tap('.flash', { position: { x: 60, y: 90 } }); await p.waitForTimeout(700);
  const before = await p.textContent('.study-top .num');
  await p.tap('[data-grade="1"]'); await p.tap('[data-grade="1"]').catch(() => {}); await p.waitForTimeout(800);
  console.log('double tap counts once:', before, '->', await p.textContent('.study-top .num'));
  await p.tap('.study-top [data-go="home"]'); await p.waitForTimeout(500);
  await p.tap('#tabs [data-go="stats"]'); await p.waitForTimeout(900);
  await p.screenshot({ path: `v-stats-${scheme}.png` });
  await p.tap('#tabs [data-go="dict"]'); await p.waitForTimeout(700);
  await p.screenshot({ path: `v-dict-${scheme}.png` });
  await p.tap('#tabs [data-go="settings"]'); await p.waitForTimeout(700);
  await p.screenshot({ path: `v-settings-${scheme}.png`, fullPage: true });
  console.log(scheme, 'errors:', p.errs);
}
await b.close();
