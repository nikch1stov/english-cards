import { webkit, devices } from 'playwright';
import { readFileSync } from 'fs';
const S = '.';
const fake = readFileSync(new URL('./fake-supabase.js', import.meta.url), 'utf8');
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' });
await ctx.route('**/supabase-js@*/+esm', r => r.fulfill({ contentType: 'application/javascript', body: fake }));
const p = await ctx.newPage();
{ const tap = p.tap.bind(p); p.tap = async (sel, o) => { await p.locator(sel).first().evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(160); return tap(sel, o); }; }
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/Content Security|Refused/i.test(m.text())) errs.push('CSP: ' + m.text()); }); p.on('dialog', d => d.accept());
const st = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('english-cards:v1') || '{}'); return Object.keys(s.progress?.['en-ru'] || {}).length; });
const cloud = uid => p.evaluate(u => Object.keys(JSON.parse(localStorage.getItem('fake-db') || '{}')[u]?.progress?.['en-ru'] || {}).length, uid);
const skipSplash = async () => { const s = await p.$('#splash'); if (s) { await p.tap('#splash', { position: { x: 30, y: 520 } }); await p.waitForTimeout(500); } };

// legacy user: has local progress from before accounts existed
await p.goto('http://localhost:8765/');
await p.evaluate(() => localStorage.setItem('english-cards:v1', JSON.stringify({ settings: { dir: 'en-ru', newPerDay: 10 }, progress: { 'en-ru': { i: { ivl: 3, reps: 2, lapses: 0, due: '2026-10-02' }, you: { ivl: 1, reps: 1, lapses: 1, due: '2026-09-30' } }, 'ru-en': {} }, days: {} })));
await p.reload(); await skipSplash();
console.log('1. not signed in -> login screen:', !!(await p.$('.login')), '| tabs hidden:', await p.$eval('#tabs', t => t.hidden), '| lesson button present:', !!(await p.$('[data-study]')));
await p.screenshot({ path: `${S}/login.png` });
await p.tap('[data-action="signin"]'); await p.waitForSelector('.hero', { timeout: 5000 }); await p.waitForTimeout(2200);
console.log('2. after sign-in: app shown:', !!(await p.$('.hero')), '| local words kept:', await st(), '| pushed to cloud:', await cloud('u1'), '| greeting:', (await p.textContent('.eyebrow')).trim());
await p.tap('[data-study="*"]'); await p.tap('[data-reveal].btn'); await p.tap('[data-grade="1"]'); await p.waitForTimeout(3000);
console.log('   answered 1 card -> cloud words:', await cloud('u1'));
await p.tap('.study-top [data-go="home"]'); await p.tap('#tabs [data-go="settings"]'); await p.waitForTimeout(300);
await p.tap('[data-action="signout"]'); await p.tap('[data-alert="1"]'); await p.waitForSelector('.login', { timeout: 5000 });
console.log('3. after sign-out: login screen:', !!(await p.$('.login')), '| local words:', await st(), '| cloud words kept:', await cloud('u1'));
await p.tap('[data-action="signin"]'); await p.waitForSelector('.hero'); await p.waitForTimeout(1500);
console.log('4. sign in again: local words restored from cloud:', await st());
await p.tap('#tabs [data-go="settings"]'); await p.tap('[data-action="signout"]'); await p.tap('[data-alert="1"]'); await p.waitForSelector('.login');
// someone else signs in on the same phone
await p.evaluate(() => localStorage.setItem('fake-next-user', JSON.stringify({ id: 'u2', email: 'friend@example.com', user_metadata: { full_name: 'Friend' } })));
await p.tap('[data-action="signin"]'); await p.waitForSelector('.hero'); await p.waitForTimeout(1500);
console.log('5. friend signs in on same phone: local words:', await st(), '| friend cloud words:', await cloud('u2'), '| Nik cloud still:', await cloud('u1'));
// reload keeps the session
await p.reload(); await skipSplash(); await p.waitForTimeout(500);
console.log('6. reload while signed in -> app (not login):', !!(await p.$('.hero')), !(await p.$('.login')));
console.log('errors:', errs);
await b.close();
