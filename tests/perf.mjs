import { webkit, devices } from 'playwright';
import fs from 'fs';
const fake = fs.readFileSync(new URL('./fake-supabase.js', import.meta.url), 'utf8');
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' });
await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: fake }));
await ctx.addInitScript(() => {
  if (!localStorage.getItem('fake-session')) {
    localStorage.setItem('fake-session', JSON.stringify({ user: { id: 'u1', email: 'n@x', user_metadata: { full_name: 'Nik' } } }));
    localStorage.setItem('english-cards:v1', JSON.stringify({ settings: { dir: 'en-ru', newPerDay: 10, onboarded: true }, progress: { 'en-ru': { i: { ivl: 1, reps: 1, lapses: 0, due: '2026-09-30' } }, 'ru-en': {} }, days: {} }));
    sessionStorage.setItem('english-cards:greeted', '1');
  }
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const t0 = Date.now();
await p.goto('http://localhost:8765/');
await p.waitForSelector('.hero');
console.log('home ready ms:', Date.now() - t0);
await p.tap('#tabs [data-go="dict"]'); await p.waitForTimeout(600);
const r = await p.evaluate(async () => {
  const q = document.getElementById('dict-q');
  const t = performance.now();
  for (const s of ['a', 'ap', 'app', 'ap', 'a', '']) { q.value = s; q.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => requestAnimationFrame(() => r())); }
  const typing = performance.now() - t;
  const t2 = performance.now();
  for (let i = 0; i < 5; i++) document.querySelector('[data-dict-filter="all"]').click();
  return { typing6: Math.round(typing), filter5: Math.round(performance.now() - t2), nodes: document.getElementsByTagName('*').length, html: document.getElementById('app').innerHTML.length };
});
console.log(r, 'errors', errs);
await b.close();
