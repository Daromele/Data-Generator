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
      window.app.closeModal && window.app.closeModal();
      return { title: title.trim(), invalid, added, singular: SECTIONS[k].singular || '' };
    }, key).catch(e => ({ error: e.message }));
    if (res.error) { add('BLOCKER', `form › ${key}`, 'Opening or saving the add form throws: ' + res.error.split('\n')[0], 'Fix the form.'); continue; }
    if (res.added) add('BLOCKER', `form › ${key}`, 'An empty form saved a blank record.', 'Validate required fields before saving.');
    if (!res.invalid && !res.added) add('MAJOR', `form › ${key}`, 'Submitting an empty form does nothing visible.', 'Mark required fields and say what is missing.');
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

  // Demo pass first (what the buyer sees before choosing), then start clean.
  await page.evaluate(() => { window.app.closeOnboarding && window.app.closeOnboarding(); });
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
