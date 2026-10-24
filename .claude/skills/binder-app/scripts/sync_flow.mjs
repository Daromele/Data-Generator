// Two computers syncing a binder through the real sync server code, in memory (no network).
//   NODE_PATH=$(npm root -g) node sync_flow.mjs App.html      (after python3 add_sync.py App.html --app <key>)
// Covers references/sync.md › Testing: both directions, offline edits on both sides,
// edit vs delete, settings travel but the PIN/theme/hidden modules do not, attachment
// files never reach the server, a reload keeps sync on, nothing re-sent when equal,
// delete-synced-copy keeps local records.
import http from 'node:http'; import { readFileSync } from 'node:fs'; import { createRequire } from 'node:module';
import worker from '../assets/sync/worker/index.mjs';
import { Room } from '../assets/sync/worker/index.mjs';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const html = readFileSync(process.argv[2]);
const PREFIX = (String(html).match(/SETTINGS_PREFIX = '(\w+)'/) || [, 'dw'])[1];   // whichever binder this is
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(0);
const BASE = `http://localhost:${srv.address().port}/`;
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) failed++; };
const rooms = new Map(), bodies = [];
const env = { ROOMS: { idFromName: n => n, get: id => { if (!rooms.has(id)) { const m = new Map(); rooms.set(id, new Room({ storage: {
  get: async k => Array.isArray(k) ? new Map(k.map(x => [x, m.get(x)])) : structuredClone(m.get(k)),
  put: async (o, v) => { if (typeof o === 'string') return void m.set(o, structuredClone(v)); for (const [k, x] of Object.entries(o)) m.set(k, structuredClone(x)); },
  delete: async ks => ks.forEach(k => m.delete(k)), deleteAll: async () => m.clear() } })); } return rooms.get(id); } } };
const cloud = async route => { const r = route.request(), body = r.postData(); if (body) bodies.push(body);
  const res = await worker.fetch(new Request(r.url(), { method: r.method(), headers: r.headers(), body: ['GET', 'HEAD', 'OPTIONS'].includes(r.method()) ? undefined : body }), env);
  route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() }); };
const launch = () => pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => pw.chromium.launch());
const browser = await launch();
try {
  const device = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/workers\.dev/, cloud);
    await ctx.addInitScript(() => {
      window.__ent = () => ['students', 'members', 'people', 'household'].find(k => typeof SECTIONS !== 'undefined' && SECTIONS[k]) || Object.keys(SECTIONS).find(k => k !== 'dashboard' && !SECTIONS[k].custom);
      window.__att = () => Object.keys(SECTIONS).find(k => (SECTIONS[k].fields || []).some(f => f.type === 'attachments'));
      window.__P = () => (typeof SETTINGS_PREFIX !== 'undefined' ? SETTINGS_PREFIX : 'dw');
    });
    await ctx.addInitScript(P => { try { localStorage.setItem(P + 'WelcomeSeen', 'true'); } catch (e) {} }, PREFIX);
    const p = await ctx.newPage(); p.on('pageerror', e => ok(false, 'pageerror: ' + e.message));
    p.on('dialog', d => d.accept());
    await p.goto(BASE); await p.waitForFunction(() => window.app && window.app.sync);
    await p.evaluate(() => { window.app.closeOnboarding && window.app.closeOnboarding(); window.app.clearAllData(true); });
    await p.waitForTimeout(300); return p;
  };
  const names = p => p.evaluate(() => (window.app.data[__ent()] || []).map(s => s.name).sort().join(','));
  const add = (p, id, name) => p.evaluate(([id, name]) => { (window.app.data[__ent()] = window.app.data[__ent()] || []).push({ id, name }); window.app.saveData(); }, [id, name]);
  const settings = p => p.evaluate(() => window.app.navigateTo('settings'));
  const now = p => p.evaluate(() => window.app.sync.syncNow());
  const confirmYes = p => p.evaluate(() => { document.getElementById('confirm-action-btn').click(); });

  const a = await device(), b = await device();
  await add(a, 'st_a', 'Alpha'); await add(b, 'st_b', 'Beta & O’Neil <B>');
  await a.evaluate(() => { storage.set(__P() + 'PINHash', 'secret-hash-a'); storage.set(__P() + 'DarkMode', 'true'); });
  await settings(a); ok(await a.isVisible('[data-sync="on"]'), 'Settings offers sync');
  await a.click('[data-sync="on"]'); await a.waitForFunction(() => window.app.sync.on && window.app.sync.status.state === 'synced');
  const code = await a.evaluate(() => window.app.sync.code);
  ok(/^[2-9A-Z]{4}(-[2-9A-Z]{4}){3}$/.test(code), 'a code is shown');
  ok(!bodies.join('').includes('Alpha'), 'only encrypted data reaches the server');

  await settings(b); await b.fill('#sync-join-form [name="code"]', code); await b.click('#sync-join-form button');
  await b.waitForFunction(() => window.app.sync.on && window.app.sync.status.state === 'synced');
  ok(await names(b) === 'Alpha,Beta & O’Neil <B>', 'second computer gets both records');
  await now(a); ok(await names(a) === 'Alpha,Beta & O’Neil <B>', 'first computer gets the second one’s record');
  ok(await a.evaluate(() => { const o = JSON.stringify(window.app.syncOut()); return !o.includes('secret-hash-a') && !o.includes(__P() + 'DarkMode') && !o.includes(__P() + 'Snapshot'); }), 'what is sent holds no PIN hash, theme or snapshots');
  ok(await b.evaluate(() => storage.get(__P() + 'PINHash') !== 'secret-hash-a' && storage.get(__P() + 'DarkMode') !== 'true'), 'PIN hash and theme stay on their computer');

  await a.evaluate(() => { window.app.data[__ent()].find(s => s.id === 'st_a').name = 'Alpha2'; window.app.saveData(); });
  await b.evaluate(() => { window.app.data[__ent()] = window.app.data[__ent()].filter(s => s.id !== 'st_b'); window.app.saveData(); });
  await now(a); await now(b); await now(a);
  ok(await names(a) === 'Alpha2' && await names(b) === 'Alpha2', 'an edit and a delete on different computers combine');

  await b.evaluate(() => { storage.set(__P() + 'UserName', 'Sam Educator'); });
  await b.waitForTimeout(1200); await now(b); await now(a);
  ok(await a.evaluate(() => storage.get(__P() + 'UserName') === 'Sam Educator' && window.app.profile.userName === 'Sam Educator'), 'educator name (a setting) syncs');

  await a.evaluate(() => { const k = __att(); if (!k) return; const f = SECTIONS[k].fields.find(x => x.type === 'attachments').name; (window.app.data[k] = window.app.data[k] || []).push({ id: 'att1', [f]: [{ id: 'smp1', name: 'scan.jpg', size: 120000 }] }); window.app.saveData(); });
  await now(a); await now(b);
  ok(await b.evaluate(() => !__att() || (window.app.data[__att()] || []).some(l => l.id === 'att1')), 'a record with an attachment syncs its metadata');
  ok(!bodies.some(x => /data:image|dataUrl/.test(x)), 'no attachment payload reaches the server');

  await a.evaluate(() => storage.remove(__P() + 'PINHash'));   // else the lock screen covers the reload
  await a.reload(); await a.waitForFunction(() => window.app && window.app.sync && window.app.sync.status.state === 'synced', null, { timeout: 15000 });
  ok(await names(a) === 'Alpha2' && await a.evaluate(() => window.app.sync.on), 'after a reload: records and sync still there');
  const before = bodies.length; await now(a); await now(b); ok(bodies.length === before, 'nothing re-sent when computers match');

  await settings(a); await a.waitForFunction(() => document.querySelectorAll('#sync-devices > div').length === 2, null, { timeout: 8000 }).then(() => ok(true, 'device list shows both computers'), () => ok(false, 'device list shows both computers'));
  await a.click('[data-sync="delete"]'); await a.waitForTimeout(200); await confirmYes(a);
  await a.waitForSelector('[data-sync="on"]', { timeout: 8000 }).catch(() => {});
  ok(await a.evaluate(() => !window.app.sync.on), 'delete synced copy turns sync off');
  ok(await names(a) === 'Alpha2', 'deleting the synced copy keeps the records here');
} finally { await browser.close(); srv.close(); }
console.log(failed ? `${failed} failed` : 'all sync checks passed'); process.exit(failed ? 1 : 0);
