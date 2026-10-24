#!/usr/bin/env node
/* Runtime checks in a real browser -- the three defects that only appear
 * when the file actually runs.
 *
 *   NODE_PATH=$(npm root -g) node verify_binder.js path/to/App.html [--shots DIR]
 *
 * 1. offline  : loads with every network request blocked, styled, no errors
 * 2. escaping : a name with punctuation survives a save/render round trip
 * 3. print    : a document is produced and paginates to real PDF pages
 */
const path = require('path');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('playwright not found. Try: NODE_PATH=$(npm root -g) node verify_binder.js ...'); process.exit(2); }

const file = process.argv[2];
if (!file) { console.error('usage: verify_binder.js path/to/App.html [--shots DIR]'); process.exit(2); }
const shotsIdx = process.argv.indexOf('--shots');
const shots = shotsIdx > -1 ? process.argv[shotsIdx + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const results = [];
const pass = (n, d) => results.push(['PASS', n, d]);
const fail = (n, d) => results.push(['FAIL', n, d]);
const skip = (n, d) => results.push(['SKIP', n, d]);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const external = new Set();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    external.add(u.split('/')[2]);
    return r.abort();                      // the whole point: no network
  });

  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(3000);

  // 1. offline
  const boot = await page.evaluate(() => ({
    app: typeof window.app === 'object' && window.app !== null,
    styled: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)',
    iconFont: (() => { const i = document.querySelector('i[class*="ph-"]');
      return i ? getComputedStyle(i).fontFamily : 'n/a'; })(),
  }));
  boot.app ? pass('offline: app initialises') : fail('offline: app initialises', 'window.app is not set');
  boot.styled ? pass('offline: styling is present')
              : fail('offline: styling is present', 'body has no background -- the stylesheet did not load');
  errors.length ? fail('offline: no script errors', errors.slice(0, 3).join(' | '))
                : pass('offline: no script errors');
  if (external.size) results.push(['note', '', '(external hosts requested: ' + [...external].join(', ') + ')']);
  if (shots) await page.screenshot({ path: path.join(shots, 'offline.png') });

  // 2. escaping -- a real name that breaks naive innerHTML
  const NASTY = 'Smith & Sons <Reception> "A" \'B\'';
  const esc = await page.evaluate((nasty) => {
    const a = window.app;
    if (!a || typeof a.getDemoData !== 'function') return { ok: null };
    a.data = a.getDemoData();
    const key = Object.keys(a.data).find(k => Array.isArray(a.data[k]) && a.data[k].length);
    if (!key) return { ok: null };
    const rec = a.data[key][0];
    const field = Object.keys(rec).find(f => f !== 'id' && typeof rec[f] === 'string');
    rec[field] = nasty;
    try { a.saveData && a.saveData(); } catch (e) {}
    // the list view always shows every record; a calendar view hides undated ones
    try { storage.set(SETTINGS_PREFIX + 'ViewMode_' + key, 'table'); } catch (e) {}
    try { a.navigateTo && a.navigateTo(key); } catch (e) {}
    const text = document.body.innerText;
    return { ok: text.includes('Smith & Sons <Reception>'), key, field, sample: text.slice(0, 0) };
  }, NASTY);
  if (esc.ok === null) skip('escaping: name with punctuation survives', 'no demo data to test with');
  else if (esc.ok) pass('escaping: name with punctuation survives');
  else fail('escaping: name with punctuation survives',
            'the punctuation was swallowed -- user text is reaching innerHTML unescaped');

  // 3. print
  const doc = await page.evaluate(() => {
    const a = window.app;
    if (!a) return null;
    let captured = null;
    const original = a.printDocument;
    a.printDocument = html => { captured = html; };
    a.showToast = () => {};
    const candidates = Object.getOwnPropertyNames(Object.getPrototypeOf(a))
      .filter(n => /^print[A-Z]|^generate(FullBinder|SectionPrint)/.test(n));
    for (const name of candidates) {
      try { a[name](); } catch (e) {}
      if (captured) break;
    }
    a.printDocument = original;
    return captured;
  });
  if (!doc) { fail('print: a document is produced', 'no print method produced a document'); }
  else {
    pass('print: a document is produced');
    const docPage = await browser.newPage();
    await docPage.route('**/*', r => r.request().url().startsWith('http') ? r.abort() : r.continue());
    await docPage.setContent(doc, { waitUntil: 'load' });
    const pdfPath = path.join(shots || require('os').tmpdir(), 'print-probe.pdf');
    await docPage.pdf({ path: pdfPath, printBackground: true });
    const bytes = fs.readFileSync(pdfPath);
    const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    pages > 0 ? pass('print: PDF renders with pages') : fail('print: PDF renders with pages', '0 pages');
    const blocks = await docPage.evaluate(() => document.querySelectorAll('.print-page').length);
    if (!blocks) skip('print: pagination', 'no .print-page blocks in this document');
    else {
      const trailing = await docPage.evaluate(() => {
        const last = [...document.querySelectorAll('.print-page')].pop();
        return getComputedStyle(last).pageBreakAfter || getComputedStyle(last).breakAfter;
      });
      trailing === 'always' ? fail('print: pagination',
          'the last page block still forces a break, pushing the footer onto a blank page')
        : pass('print: pagination');
    }
    results.push(['note', '', `(print document: ${pages} pages -> ${pdfPath})`]);
    await docPage.close();
  }

  await browser.close();

  let failed = 0;
  for (const [status, name, detail] of results) {
    if (status === 'note') { console.log('        ' + detail); continue; }
    if (status === 'FAIL') failed++;
    console.log(`${status}  ${name}${detail && status !== 'PASS' ? '\n        ' + detail : ''}`);
  }
  const passed = results.filter(r => r[0] === 'PASS').length;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
