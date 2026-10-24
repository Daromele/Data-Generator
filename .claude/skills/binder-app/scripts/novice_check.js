#!/usr/bin/env node
// Novice review: walks a binder the way a first-time buyer does, in a fresh
// browser profile with the network cut, and reports what would confuse them.
//
//   NODE_PATH=$(npm root -g) node novice_check.js App.html [--shots DIR] [--json]
//
// Two passes over every screen: an EMPTY planner (after "start clean") and the
// DEMO planner. Each screen is checked for leaked junk (NaN, undefined, null,
// Invalid Date, [object Object], Infinity), script errors, a blank screen with
// no empty-state message, zero-data tiles that print "0%" or "0.00" instead of
// "—", and horizontal overflow at 1280 px. Every "add" form is opened and
// submitted empty: it must refuse with a visible reason, not silently close.
//
// Then (Oct 2026, from the Legacy Planner and Emergency Vault review) it walks the welcome the way a
// buyer does and counts the clicks to the first saved record, adds one record through the real form and
// re-checks the dashboard (zero tiles, the backup nag, stacked toasts), checks that the demo never opens
// with something overdue, scans every screen for the donor binder's words (the other binders' names and
// section titles, found beside the app, or --forbid "a|b|c"), and prints the dashboard from dark mode.
//
// It cannot judge wording or taste. Pair it with references/novice-review.md,
// which holds the manual checklist and every rule earlier reviews produced.
// Exit code 1 when anything at BLOCKER level is found.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const file = process.argv[2];
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
if (!file) { console.error('usage: node novice_check.js App.html [--shots DIR] [--json]'); process.exit(2); }
const shots = arg('shots');
if (shots) fs.mkdirSync(shots, { recursive: true });
const url = 'file://' + path.resolve(file);

const JUNK = /\b(NaN|undefined|null|Invalid Date|Infinity)\b|\[object Object\]/;
const findings = [];
// Donor words: the other binders' product names and section titles (from the files beside this one), minus
// anything this app uses itself. A fork keeps the donor's words long after its own sections are written.
let FORBID = null;
function donorWords(thisSrc) {
  const own = new Set((thisSrc.match(/title:\s*"([^"]+)"/g) || []).map(m => m.replace(/title:\s*"|"/g, '').toLowerCase()));
  const words = new Set();
  const dir = path.dirname(path.resolve(file));
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html') || path.resolve(dir, f) === path.resolve(file)) continue;
    let src = ''; try { src = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const m = src.match(/const SECTIONS = \{[\s\S]*?\n\s{8}\};/); if (!m) continue;
    const low = thisSrc.toLowerCase();
    for (const t of m[0].match(/title:\s*"([^"]+)"/g) || []) { const w = t.replace(/title:\s*"|"/g, ''); if (w.length >= 6 && !own.has(w.toLowerCase()) && !low.includes(w.toLowerCase())) words.add(w); }
    const kit = path.join(dir, f.replace(/\.html$/, '').toLowerCase().replace(/_/g, '-'), 'kit.json');
    try { const k = JSON.parse(fs.readFileSync(kit, 'utf8')); if (k.product && !thisSrc.includes(k.product)) words.add(k.product); } catch {}
  }
  for (const w of ['chores', 'school deadlines', 'sitter', 'immunisation', 'immunization', 'lesson', 'transcript', 'tenant', 'rent roll']) if (!own.has(w)) words.add(w);
  return [...words];
}
const add = (level, where, what, fix) => findings.push({ level, where, what, fix });

async function launch() {
  const opts = {};
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  try { return await chromium.launch(opts); } catch (e) { return chromium.launch(); }
}

async function screens(page) {
  return page.evaluate(() => Object.keys(SECTIONS).filter(k => k !== 'dashboard').concat(['dashboard', 'settings']));
}

async function visibleText(page) {
  return page.evaluate(() => {
    const main = document.getElementById('main-content') || document.querySelector('main') || document.body;
    // Only what a person can see: skip <option>, hidden nodes and code blocks.
    const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const out = [];
    while (walk.nextNode()) {
      const n = walk.currentNode, el = n.parentElement;
      if (!el || el.closest('option,script,style,template,[hidden],.hidden')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const t = n.textContent.trim();
      if (t) out.push(t);
    }
    return out.join(' · ');
  });
}

async function go(page, key) {
  await page.evaluate(k => k === 'settings' ? window.app.showSettings ? window.app.showSettings() : window.app.navigateTo(k) : window.app.navigateTo(k), key);
  await page.waitForTimeout(250);
}

async function walk(page, pass, errors) {
  for (const key of await screens(page)) {
    const before = errors.length;
    try { await go(page, key); } catch (e) { add('BLOCKER', `${pass} › ${key}`, 'Opening the screen throws: ' + e.message.split('\n')[0], 'Fix the render for this state.'); continue; }
    const text = await visibleText(page);
    const m = text.match(JUNK);
    if (m) {
      const at = text.indexOf(m[0]);
      add('BLOCKER', `${pass} › ${key}`, `Shows "${m[0]}" near: …${text.slice(Math.max(0, at - 60), at + 40)}…`, 'Guard the value; show "—" when there is no data.');
    }
    if (pass === 'empty') {
      if (text.length < 40) add('MAJOR', `empty › ${key}`, 'Screen is nearly blank with no data.', 'Add an empty state that says what goes here and offers the Add button.');
      const zeros = (text.match(/(^|\s|·)(0%|0\.0+%?|\$0\.00|£0\.00)(?=\s|·|$)/g) || []).length;
      const zeroTiles = key === 'dashboard' ? await page.evaluate(() => [...document.querySelectorAll('#main-content .number-font')].filter(e => e.offsetParent && /^\s*0\s*$/.test(e.textContent)).length) : 0;
      if (zeroTiles > 1) add('MAJOR', 'empty › dashboard', `${zeroTiles} tiles show a bare 0 on a brand-new planner.`, 'Show "—" and a hint ("Nothing added yet") until there is data.');
      if (key === 'dashboard' && zeros > 0) add('MAJOR', 'empty › dashboard', `${zeros} tiles show a zero figure on a brand-new planner.`, 'Show "—" until there is something to count; a zero reads as "you are failing".');
    }
    if (FORBID && FORBID.length) {
      const re = new RegExp('\\b(' + FORBID.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
      const hit = text.match(re);
      if (hit) { const at = text.indexOf(hit[0]); add('MAJOR', `${pass} › ${key}`, `Donor wording "${hit[0]}" near: …${text.slice(Math.max(0, at - 50), at + 50)}…`, 'A fork left the donor binder\'s words behind; write this app\'s own.'); }
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 4) add('MINOR', `${pass} › ${key}`, `Page scrolls sideways by ${overflow}px at 1280px.`, 'Let wide tables scroll inside their card.');
    if (errors.length > before) add('BLOCKER', `${pass} › ${key}`, 'Script error: ' + errors.slice(before).join(' | ').slice(0, 200), 'Fix the error.');
    if (shots) await page.screenshot({ path: path.join(shots, `${pass}-${key}.png`) });
  }
}

async function emptyForms(page, errors) {
  const keys = await page.evaluate(() => Object.keys(SECTIONS).filter(k => k !== 'dashboard' && !SECTIONS[k].custom && (SECTIONS[k].fields || []).some(f => f.required)));
  for (const key of keys) {
    const before = errors.length;
    await go(page, key);
    const res = await page.evaluate(k => {
      const count = (window.app.data[k] || []).length;
      window.app.openModal(k);
      const form = window.app.dynamicForm;
      const title = (document.getElementById('modal-title') || {}).textContent || '';
      window.app.saveFormData();
      const invalid = form ? form.querySelectorAll(':invalid').length : 0;
      const added = (window.app.data[k] || []).length - count;
      const tc = document.getElementById('toast-container'); const hint = !!(tc && tc.children.length && /first|fill|required|select|missing/i.test(tc.innerText));
      window.app.closeModal && window.app.closeModal();
      return { title: title.trim(), invalid, added, hint, singular: SECTIONS[k].singular || '' };
    }, key).catch(e => ({ error: e.message }));
    if (res.error) { add('BLOCKER', `form › ${key}`, 'Opening or saving the add form throws: ' + res.error.split('\n')[0], 'Fix the form.'); continue; }
    if (res.added) add('BLOCKER', `form › ${key}`, 'An empty form saved a blank record.', 'Validate required fields before saving.');
    if (!res.invalid && !res.added) add('MAJOR', `form › ${key}`, 'Submitting an empty form does nothing visible.', 'Mark required fields and say what is missing.');
    if (res.invalid && !res.hint) add('MINOR', `form › ${key}`, 'An empty save relies on the browser\'s own bubble; the app says nothing itself.', 'Toast "Fill in <label> first." and focus the field (saveFormData).');
    if (res.singular && res.title && !res.title.toLowerCase().includes(res.singular.toLowerCase().split(' ')[0]))
      add('MINOR', `form › ${key}`, `Dialog title "${res.title}" does not name what is being added ("${res.singular}").`, 'Match the dialog title to the button that opened it.');
    if (errors.length > before) add('BLOCKER', `form › ${key}`, 'Script error: ' + errors.slice(before).join(' | ').slice(0, 200), 'Fix the error.');
  }
}

(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_INTERNET|net::/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.dismiss());
  await page.goto(url);
  await page.waitForFunction(() => window.app && window.app.data, null, { timeout: 15000 });
  await page.waitForTimeout(600);

  // Every navigateTo / openModal target must be a real section (forks leave old ones behind).
  const dead = await page.evaluate(() => {
    const src = document.documentElement.outerHTML + [...document.scripts].map(x => x.textContent).join('');
    const keys = new Set([...Object.keys(SECTIONS), 'settings', 'dashboard']);
    return [...new Set([...src.matchAll(/(?:navigateTo|openModal)\('(\w+)'/g)].map(m => m[1]))].filter(k => !keys.has(k));
  });
  if (dead.length) add('BLOCKER', 'dead links', `Buttons open screens that do not exist: ${dead.join(', ')}`, 'Point them at a real section or remove them (a fork left them behind).');

  // First open: the buyer must be greeted, not dropped into a full planner.
  const greeted = await page.evaluate(() => {
    const el = document.getElementById('onboarding-backdrop');
    return !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  });
  if (!greeted) add('MAJOR', 'first open', 'No welcome on first open.', 'Show the onboarding slides on a fresh profile.');
  if (shots) await page.screenshot({ path: path.join(shots, 'first-open.png') });
  { const first = await visibleText(page); if (/\b\d+ days? overdue\b/i.test(first)) add('MAJOR', 'first open', 'The demo behind the welcome already shows something overdue.', 'Anchor demo due dates in the future (due soon, never past) so the first screen is not a red tile.');
    if (/never backed up/i.test(first)) add('MAJOR', 'first open', 'The backup banner shows over the demo data on first open.', 'Never nag about backups while the data is the demo.'); }
  FORBID = arg('forbid') ? arg('forbid').split('|') : donorWords(fs.readFileSync(file, 'utf8'));

  // The first five minutes: walk the welcome as a buyer (clean start when offered), add one record through
  // the real form, look at the dashboard again. Counted in clicks: more than 4 to the first saved record is a finding.
  {
    let clicks = 0;
    const clickText = async (re) => page.evaluate(src => { const r = new RegExp(src, 'i'); const b = [...document.querySelectorAll('#onboarding-content button, #modal-backdrop button, #main-content button')].find(b => b.offsetParent !== null && r.test(b.innerText.trim())); if (!b) return false; b.click(); return true; }, re.source);
    if (greeted) {
      if (await clickText(/^start with my own/)) clicks++;
      else { for (let i = 0; i < 8; i++) { if (!(await clickText(/^next$/))) break; clicks++; await page.waitForTimeout(250); } if (await clickText(/wipe demo|start clean/)) clicks++; }
      await page.waitForTimeout(400);
      if (await clickText(/^finish later$|^skip$/)) clicks++;
      await page.waitForTimeout(500);
    } else await page.evaluate(() => window.app.clearAllData(true));
    // the first record is whatever the dashboard's own first-step button adds
    const E = await page.evaluate(() => { const b = [...document.querySelectorAll('#main-content button')].find(b => /openModal\('(\w+)'/.test(b.getAttribute('onclick') || '')); const m = b && b.getAttribute('onclick').match(/openModal\('(\w+)'/); return (m && m[1]) || ['members', 'students', 'people', 'household', 'contacts'].find(k => SECTIONS[k]) || Object.keys(SECTIONS).find(k => k !== 'dashboard' && !SECTIONS[k].custom); });
    const nameField = await page.evaluate(E => (SECTIONS[E].fields.find(f => f.required && f.type === 'text') || {}).name, E);
    const opened = await clickText(/add someone|add your first|^add\b|new /); if (opened) clicks++;
    await page.waitForTimeout(400);
    if (!(await page.evaluate(() => !document.getElementById('modal-backdrop').classList.contains('hidden')))) { await page.evaluate(E => window.app.openModal(E), E); clicks++; await page.waitForTimeout(300); }
    const form = await page.evaluate(() => {
      const f = window.app.dynamicForm; const req = [...f.querySelectorAll('select[required]')].filter(s => !s.value).map(s => s.name);
      return { requiredSelectsWithoutDefault: req };
    });
    for (const r of form.requiredSelectsWithoutDefault) add('MINOR', `form › ${E}`, `"${r}" is required and has no default, on the very first record.`, 'Give it the default the welcome already implied (Adult, Executor), via `default:` on the field.');
    await page.evaluate(([E, nameField]) => { const f = window.app.dynamicForm; if (nameField) f.querySelector(`[name="${nameField}"]`).value = 'Sam Rivera'; f.querySelectorAll('select[required]').forEach(s => { if (!s.value) { const o = [...s.options].find(o => o.value && o.value !== '__custom__'); if (o) s.value = o.value; } }); window.app.saveFormData(); }, [E, nameField]);
    clicks++; await page.waitForTimeout(600);
    const saved = await page.evaluate(([E, nf]) => (window.app.data[E] || []).some(x => x[nf || 'name'] === 'Sam Rivera'), [E, nameField]);
    if (!saved) { const bad = await page.evaluate(() => [...(window.app.dynamicForm || document).querySelectorAll(':invalid')].map(e => e.name || e.id)); add('BLOCKER', `form › ${E}`, `The first record could not be saved through the form with only the required fields (still invalid: ${bad.join(', ') || 'none reported'}).`, 'Fix the form.'); await page.evaluate(() => window.app.closeModal && window.app.closeModal()); }
    if (clicks > 4) add('MAJOR', 'first five minutes', `${clicks} clicks from first open to the first saved record.`, 'A two-button start on slide one and a one-click add; four slides before the first record is too many.');
    await go(page, 'dashboard');
    const text = await visibleText(page);
    if (/never backed up/i.test(text)) add('MAJOR', 'dashboard after one record', 'The backup banner appears after the first record.', 'Wait for something worth losing (~5 records) and never nag over demo data.');
    const zeroTiles = await page.evaluate(() => [...document.querySelectorAll('#main-content .number-font')].filter(e => e.offsetParent && /^\s*(0|\$0\.00|0%)\s*$/.test(e.textContent)).length);
    if (zeroTiles) add('MAJOR', 'dashboard after one record', `${zeroTiles} tile(s) show a bare zero after the first record.`, 'A tile shows "—" until its own section has something to count, not only on the empty dashboard.');
    const toasts = await page.evaluate(() => { const t = document.getElementById('toast-container'); return t ? t.children.length : 0; });
    if (toasts > 1) add('MINOR', 'toasts', `${toasts} toasts stacked on screen.`, 'One toast at a time: a new one replaces the last (unless it carries an Undo).');
    if (shots) await page.screenshot({ path: path.join(shots, 'after-first-record.png') });
    await page.evaluate(() => window.app.clearAllData(true));
  }

  // Print from dark mode: paper stays paper.
  {
    await page.evaluate(() => { if (!document.documentElement.classList.contains('dark')) window.app.toggleDarkMode(); });
    await go(page, 'dashboard'); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(300);
    const bg = await page.evaluate(() => { const lum = c => { const m = (c || '').match(/\d+(\.\d+)?/g); if (!m || m.length < 3 || (m[3] !== undefined && +m[3] === 0)) return null; return (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000; }; let n = document.getElementById('main-content'); while (n) { const l = lum(getComputedStyle(n).backgroundColor); if (l !== null) return l; n = n.parentElement; } return 255; });
    if (bg < 180) add('MAJOR', 'print › dark mode', `Printing the screen from dark mode gives a dark page (background luminance ${Math.round(bg)}).`, 'In @media print reset html.dark surfaces and ink to paper colours.');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => { if (document.documentElement.classList.contains('dark')) window.app.toggleDarkMode(); });
  }

  // Demo pass (what the buyer sees if they keep the sample), then start clean.
  await page.evaluate(() => { window.app.closeOnboarding && window.app.closeOnboarding(); window.app.data = window.app.getDemoData(); window.app.saveData(); });
  await walk(page, 'demo', errors);
  await page.evaluate(() => window.app.clearAllData(true));
  await walk(page, 'empty', errors);
  await emptyForms(page, errors);

  // The data must survive a reload: a buyer's first fear.
  await page.evaluate(() => { const E = ['students', 'members', 'people', 'household'].find(k => SECTIONS[k]) || Object.keys(SECTIONS).find(k => k !== 'dashboard' && !SECTIONS[k].custom); window.__E = E; window.app.data[E] = [{ id: 'nvx1', name: 'O’Neil & Sons <test>' }]; window.app.saveData(); });
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.data, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const kept = await page.evaluate(() => Object.values(window.app.data).some(v => Array.isArray(v) && v.some(s => s && s.id === 'nvx1')));
  if (!kept) add('BLOCKER', 'reload', 'A record added before a reload is gone after it.', 'Check the record store flushes before unload.');

  await browser.close();
  const order = { BLOCKER: 0, MAJOR: 1, MINOR: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(findings, null, 2));
  else {
    for (const f of findings) console.log(`[${f.level.padEnd(7)}] ${f.where}\n    ${f.what}\n    Fix: ${f.fix}\n`);
    const n = l => findings.filter(f => f.level === l).length;
    console.log(`${n('BLOCKER')} blockers, ${n('MAJOR')} major, ${n('MINOR')} minor`);
  }
  process.exit(findings.some(f => f.level === 'BLOCKER') ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
