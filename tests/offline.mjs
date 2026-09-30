import { webkit, devices } from 'playwright';
const b = await webkit.launch();
for (const saved of [true, false]) {
  const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' });
  await ctx.route('**/supabase-js@*/+esm', r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/Content Security|Refused/i.test(m.text())) errs.push('CSP: ' + m.text()); });
  await p.goto('http://localhost:8765/');
  if (saved) await p.evaluate(() => localStorage.setItem('sb-pcvlpnqgkwyzuhsjnszk-auth-token', JSON.stringify({ user: { id: 'u1', email: 'nik@example.com', user_metadata: { full_name: 'Nik' } } })));
  await p.reload(); await p.waitForTimeout(1500);
  console.log(`library unavailable, saved session=${saved}: app=${!!(await p.$('.hero'))} login=${!!(await p.$('.login'))} screen=${await p.evaluate(() => document.body.dataset.screen)} errors=${JSON.stringify(errs)}`);
  await ctx.close();
}
await b.close();
