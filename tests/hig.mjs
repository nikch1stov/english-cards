import { webkit, devices } from 'playwright';
import fs from 'fs';
const fake = fs.readFileSync(new URL('./fake-supabase.js', import.meta.url), 'utf8');
const b = await webkit.launch();
async function page(scheme, fontPx) {
  const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', colorScheme: scheme });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: fake }));
  await ctx.addInitScript(fontPx => {
    if (fontPx) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `html { font-size: ${fontPx}px !important; }`; document.head.append(st); });
    if (localStorage.getItem('fake-session')) return;
    localStorage.setItem('fake-session', JSON.stringify({ user: { id: 'u1', email: 'nik@example.com', user_metadata: { full_name: 'Nik Chistov' } } }));
    const prog = {}; ['i', 'you', 'he', 'she', 'it', 'we', 'they'].forEach((w, i) => prog[w] = { ivl: i < 4 ? 8 : 1, reps: 3, lapses: 0, due: '2026-09-30' });
    const d = new Date(); const k = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    const days = {}; for (let i = 12; i >= 1; i--) days[k(i)] = { reviewed: 10, new: { 'en-ru': 3 }, known: { 'en-ru': 7 }, wrong: { 'en-ru': 2 }, snap: { 'en-ru': { learned: 4, started: 7 } } };
    localStorage.setItem('english-cards:v1', JSON.stringify({ settings: { dir: 'en-ru', newPerDay: 10, onboarded: true }, progress: { 'en-ru': prog, 'ru-en': {} }, days }));
    sessionStorage.setItem('english-cards:letter', 'A'); sessionStorage.setItem('english-cards:greeted', '1');
  }, fontPx);
  const p = await ctx.newPage();
  { const tap = p.tap.bind(p); p.tap = async (sel, o) => { await p.locator(sel).first().evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(160); return tap(sel, o); }; }
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  return p;
}
const small = p => p.evaluate(() => [...document.querySelectorAll('button, [role="button"], a, .switch, .search')]
  .filter(e => e.offsetParent !== null && !e.closest('.speak-btn.small') && !e.matches('.speak-btn.small'))
  .map(e => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter(x => x.w < 44 || x.h < 44));
const shots = async (p, tag) => {
  await p.goto('http://localhost:8765/'); await p.waitForSelector('.hero'); await p.waitForTimeout(1100);
  await p.screenshot({ path: `h-home-${tag}.png` });
  const found = { home: await small(p) };
  await p.tap('#tabs [data-go="dict"]'); await p.waitForTimeout(700); await p.screenshot({ path: `h-dict-${tag}.png` }); found.dict = await small(p);
  await p.tap('#app [data-go="word"]'); await p.waitForTimeout(700); await p.screenshot({ path: `h-word-${tag}.png` }); found.word = await small(p);
  await p.tap('.sheet-bar [data-go]'); await p.waitForTimeout(500);
  await p.tap('#tabs [data-go="stats"]'); await p.waitForTimeout(900); await p.screenshot({ path: `h-stats-${tag}.png` }); found.stats = await small(p);
  await p.tap('#tabs [data-go="settings"]'); await p.waitForTimeout(700); await p.screenshot({ path: `h-settings-${tag}.png`, fullPage: true }); found.settings = await small(p);
  await p.tap('[data-action="reset"]'); await p.waitForTimeout(400); await p.screenshot({ path: `h-alert-${tag}.png` }); found.alert = await small(p);
  await p.tap('[data-alert="0"]'); await p.waitForTimeout(300);
  await p.tap('[data-ob="restart"]'); await p.waitForTimeout(600); await p.screenshot({ path: `h-ob-${tag}.png` }); found.ob = await small(p);
  await p.tap('[data-ob="close"]'); await p.waitForTimeout(500);
  await p.tap('#tabs [data-go="home"]'); await p.waitForTimeout(500);
  await p.tap('#app [data-study="*"]'); await p.waitForTimeout(700); found.study = await small(p);
  await p.tap('.flash', { position: { x: 60, y: 90 } }); await p.waitForTimeout(700); await p.screenshot({ path: `h-study-${tag}.png` });
  const out = Object.entries(found).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  console.log(tag, 'targets < 44pt:', out.length ? out.join(' | ') : 'none', '| errors:', p.errs);
};
await shots(await page('light'), 'light');
await shots(await page('dark'), 'dark');
await shots(await page('light', 24), 'bigtext');
await b.close();
