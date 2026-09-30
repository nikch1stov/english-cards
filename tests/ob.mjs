import { webkit, devices } from 'playwright';
import fs from 'fs';
const fake = fs.readFileSync(new URL('./fake-supabase.js', import.meta.url), 'utf8');
const b = await webkit.launch();
async function ctxFor(scheme = 'light') {
  const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', colorScheme: scheme });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: fake }));
  const p = await ctx.newPage();
{ const tap = p.tap.bind(p); p.tap = async (sel, o) => { await p.locator(sel).first().evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(160); return tap(sel, o); }; }
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (/Content Security|Refused/i.test(m.text())) p.errs.push('CSP: ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/');
  await p.tap('#splash'); await p.waitForTimeout(400);
  return p;
}
// --- new user
let p = await ctxFor();
await p.tap('[data-action="signin"]'); await p.waitForTimeout(1500);
console.log('new user screen:', await p.evaluate(() => document.body.dataset.screen), '| tabs hidden', await p.evaluate(() => tabs.hidden));
await p.screenshot({ path: 'ob0.png' });
await p.tap('[data-ob="next"]'); await p.waitForTimeout(200);
console.log('toast without goal:', (await p.textContent('#toast')).trim().slice(-30));
await p.tap('[data-ob="goal:travel"]'); await p.tap('[data-ob="goal:movies"]');
await p.tap('[data-ob="next"]'); await p.waitForTimeout(400);
await p.screenshot({ path: 'ob1.png' });
await p.tap('[data-ob="level:basic"]'); await p.waitForTimeout(700);
console.log('step:', await p.getAttribute('.ob', 'data-step'), '|', await p.textContent('#ob-count'));
await p.screenshot({ path: 'ob2.png', fullPage: true });
await p.tap('[data-ob="topic:Животные"]'); await p.waitForTimeout(100);
console.log('after removing Животные:', await p.textContent('#ob-count'));
await p.tap('[data-ob="next"]'); await p.waitForTimeout(400);
await p.screenshot({ path: 'ob3.png' });
await p.tap('[data-ob="pace:20"]'); await p.tap('[data-ob="next"]'); await p.waitForTimeout(900);
const st = await p.evaluate(() => JSON.parse(localStorage.getItem('english-cards:v1')).settings);
console.log('settings:', JSON.stringify(st));
console.log('home topics:', await p.$$eval('#app .list .list-title', els => els.map(e => e.textContent)));
console.log('goal list:', (await p.textContent('.goal-list')).replace(/\s+/g, ' '));
await p.screenshot({ path: 'ob-home.png' });
// tabs
console.log('tabs:', await p.$$eval('#tabs [data-go]', els => els.map(e => e.textContent.trim())));
// flip
await p.tap('#app [data-study="*"]'); await p.waitForTimeout(700);
console.log('lesson topic of first card:', await p.textContent('.flash-meta .ellipsis'));
await p.tap('.flash'); await p.waitForTimeout(90);
console.log('mid-flip classes:', await p.getAttribute('.flash', 'class'));
await p.screenshot({ path: 'flip-mid.png' });
await p.waitForTimeout(250);
console.log('after flip classes:', await p.getAttribute('.flash', 'class'), '| buttons', await p.$$eval('.actions .btn', e => e.map(x => x.textContent.trim())));
await p.waitForTimeout(500);
await p.tap('[data-grade="1"]'); await p.waitForTimeout(500);
await p.tap('.study-top [data-go="home"]'); await p.waitForTimeout(400);
// Добавить tab
await p.tap('#app [data-go="word"]'); await p.waitForTimeout(500);
console.log('add tab opens:', await p.evaluate(() => document.body.dataset.screen), '| close goes to', await p.getAttribute('.sheet-bar [data-go]', 'data-go'));
await p.tap('.sheet-bar [data-go]'); await p.waitForTimeout(400);
// settings restart
await p.tap('#tabs [data-go="settings"]'); await p.waitForTimeout(400);
console.log('settings row:', (await p.textContent('[data-ob="restart"]')).replace(/\s+/g, ' '));
await p.tap('[data-ob="restart"]'); await p.waitForTimeout(400);
console.log('restart preselected goals:', await p.$$eval('.ob-tile.on', e => e.length), '| close button', await p.isVisible('[data-ob="close"]'));
await p.tap('[data-ob="close"]'); await p.waitForTimeout(400);
console.log('errors:', p.errs);
// --- existing user with progress in cloud, new phone: should NOT get onboarding
const db = await p.evaluate(() => localStorage.getItem('fake-db'));
await p.context().close();
p = await ctxFor('dark');
await p.evaluate(db => { localStorage.setItem('fake-db', db); }, db);
await p.tap('[data-action="signin"]'); await p.waitForTimeout(1800);
console.log('returning user on new phone screen:', await p.evaluate(() => document.body.dataset.screen), JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('english-cards:v1')).settings.topics?.length)));
// --- legacy user (local progress, no onboarded flag)
await p.context().close();
p = await ctxFor();
await p.evaluate(() => localStorage.setItem('english-cards:v1', JSON.stringify({ settings: { dir: 'en-ru', newPerDay: 10 }, progress: { 'en-ru': { i: { ivl: 1, reps: 1, lapses: 0, due: '2026-09-30' } }, 'ru-en': {} }, days: {} })));
await p.reload(); await p.waitForTimeout(800);
await p.tap('[data-action="signin"]'); await p.waitForTimeout(1500);
console.log('legacy user screen:', await p.evaluate(() => document.body.dataset.screen), '| onboarded', await p.evaluate(() => JSON.parse(localStorage.getItem('english-cards:v1')).settings.onboarded));
console.log('errors:', p.errs);
await b.close();
