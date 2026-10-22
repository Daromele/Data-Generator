#!/usr/bin/env node
// Captures listing screenshots from the real built binder, with its own demo
// data, every module switched on, welcome dismissed and motion off.
//
//   NODE_PATH=$(npm root -g) node capture_screens.js App.html OUT_DIR [--docs transcript,compliance,binder]
//
// Writes OUT_DIR/screen-<section>.png for every section, screen-settings.png,
// screen-dark-dashboard.png, theme-<name>.png for each fixed theme, and
// doc-<name>.png (first page) + doc-<name>.pdf for each printed document.
// The printed document is the product: always capture at least one.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [file, out] = process.argv.slice(2);
if (!file || !out) { console.error('usage: node capture_screens.js App.html OUT_DIR [--docs a,b]'); process.exit(2); }
const di = process.argv.indexOf('--docs');
const docs = (di > 0 ? process.argv[di + 1] : 'transcript,compliance,binder').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });

const DOC_CALLS = {   // engine method per document; 'all' = every student, whole history
  transcript: app => app.generateTranscriptPrint('all', 'all'),
  compliance: app => app.printCompliance('all', 'all'),
  binder: app => app.generateFullBinder('all', 'all', false),
  reportcard: app => app.generateReportCards('all', 'all'),
  gobag: app => app.printGoBagSheet(),                         // Emergency Vault
  medical: app => app.printMedicalSummary('all', 'all'),
  where: app => app.printWhereThingsAre(),
  executor: app => app.printExecutorLetter(),                   // Legacy Planner
  wishes: app => app.printMyWishes(),
  property: app => app.printInventory(),                         // Divorce Planner
  affidavit: app => app.printAffidavitWorksheet(),
  attorney: app => app.printAttorneyChecklist(),
  inventory: app => app.printInventoryReport('all', 'all'),    // Home Management
  improvements: app => app.printImprovementsReport('all', 'all'),
  contacts: app => app.printEmergencySheet(),
  sitter: app => app.printSitterSheet(),                        // Ultimate Mom
  weekplan: app => app.printWeeklyPlan(),
  grocery: app => app.printGroceryList(),
  immunization: app => app.printImmunisationRecord('all', 'all'),
  progress: app => app.generateReportCards('all', 'all'),        // Teacher Hub
  sub: app => app.printSubPlans(),
  week: app => app.printWeekPlan(),
  seating: app => app.printSeatingChart(),
  handover: app => app.printHandoverSheet(),                     // Co-Parenting
  expense: app => app.printExpenseStatement(),
};

(async () => {
  const opts = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  const browser = await chromium.launch(opts);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce', offline: true });
  const PREFIX = (fs.readFileSync(file, 'utf8').match(/SETTINGS_PREFIX = '(\w+)'/) || [, 'dw'])[1];   // whichever binder this is
  await ctx.addInitScript(P => { try { localStorage.setItem(P + 'WelcomeSeen', 'true'); } catch (e) {} }, PREFIX);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + path.resolve(file));
  await page.waitForFunction(() => window.app && window.app.data);
  await page.evaluate(owner => {
    const app = window.app;
    app.closeOnboarding && app.closeOnboarding();
    app.hiddenSections = []; app.renderNav();
    // A document with a real owner name reads as finished (OWNER=... matches the demo family).
    if (app.profile && !app.profile.userName) { app.profile.userName = owner; }
    // Listing photos show a planner that is looked after: no backup nag.
    try { storage.set((typeof SETTINGS_PREFIX !== 'undefined' ? SETTINGS_PREFIX : 'dw') + 'LastBackup', String(Date.now())); } catch (e) {}
    app.printDocument = html => { window.__doc = html; };
  }, process.env.OWNER || 'Jane Doe');
  const shot = async name => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(out, name + '.png') }); console.log('  ' + name); };

  const keys = await page.evaluate(() => ['dashboard', ...Object.keys(SECTIONS).filter(k => k !== 'dashboard')]);
  for (const k of keys) { await page.evaluate(k => window.app.navigateTo(k), k); await shot('screen-' + k); }
  await page.evaluate(() => window.app.navigateTo('settings')); await shot('screen-settings');

  const themes = await page.evaluate(() => typeof THEMES !== 'undefined' ? Object.keys(THEMES) : ['indigo', 'teal', 'emerald', 'rose', 'amber']);
  await page.evaluate(() => window.app.navigateTo('dashboard'));
  for (const t of themes) { await page.evaluate(t => window.app.setColorTheme(t), t).catch(() => {}); await shot('theme-' + t); }
  await page.evaluate(t => window.app.setColorTheme(typeof DEFAULT_THEME !== 'undefined' ? DEFAULT_THEME : t), themes[0]).catch(() => {});   // documents print in the product's default theme
  await page.evaluate(() => { if (!document.documentElement.classList.contains('dark')) window.app.toggleDarkMode(); window.app.navigateTo('dashboard'); });
  await shot('screen-dark-dashboard');
  await page.evaluate(() => { if (document.documentElement.classList.contains('dark')) window.app.toggleDarkMode(); });

  for (const d of docs) {
    if (!DOC_CALLS[d]) { console.error('unknown document ' + d); continue; }
    const html = await page.evaluate(src => { window.__doc = null; (0, eval)('(' + src + ')')(window.app); return window.__doc; }, DOC_CALLS[d].toString()).catch(e => (console.error(d + ': ' + e.message), null));
    if (!html) continue;
    const p2 = await ctx.newPage();
    await p2.setContent(html, { waitUntil: 'load' });
    await p2.pdf({ path: path.join(out, `doc-${d}.pdf`), format: 'Letter', printBackground: true });
    // Each printed page as an image (pdftoppm), so photos show the real
    // document -- cover AND content pages -- exactly as it prints.
    const { execFileSync } = require('child_process');
    try { execFileSync('pdftoppm', ['-png', '-r', '110', path.join(out, `doc-${d}.pdf`), path.join(out, `doc-${d}-page`)]); }
    catch (e) { await p2.setViewportSize({ width: 816, height: 1056 }); await p2.screenshot({ path: path.join(out, `doc-${d}-page-1.png`) }); }
    await p2.close();
    console.log('  doc-' + d);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
