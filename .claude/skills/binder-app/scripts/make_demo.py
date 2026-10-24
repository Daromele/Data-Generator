#!/usr/bin/env python3
"""The free web demo, generated from the real built binder -- never hand-edited.

    python3 make_demo.py App.html kit.json OUT.html

What the visitor gets (references/packaging.md §2):
  - the full app with its demo data, every screen working
  - NOTHING saves: localStorage is replaced by memory and IndexedDB is off
    before any app code runs, so a refresh starts fresh and a bought copy's
    records in the same browser are never read
  - printing WORKS, with a "FREE DEMO" watermark on every page: the printed
    document is what the buyer pays for, so the demo must not cap it
  - backup, restore, CSV export, automatic backup and sync open an upsell
    naming the feature, with "Get the full version" -> kit.listing_link
    (or kit.shop_link until the listing exists)
  - a small floating bar: "Free demo · nothing is saved · Get the full version"

Every anchor is asserted; a moved anchor fails loudly instead of shipping a
demo that quietly saves or exports.
"""
import json, pathlib, sys

if len(sys.argv) != 4:
    sys.exit(__doc__)
src, kit_path, out = map(pathlib.Path, sys.argv[1:])
kit = json.loads(kit_path.read_text(encoding='utf-8'))
s = src.read_text(encoding='utf-8')
link = kit.get('listing_link') or kit.get('shop_link') or '#'


def rep(old, new):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit(f'Anchor found {n}x, expected 1: {old[:80]!r}')
    s = s.replace(old, new)


# 1. before ANY script: memory storage, no IndexedDB. The page's own <head> is
#    the first one; printed documents carry more inside template strings.
head = s.find('<head>')
if head < 0 or head > s.find('<script'):
    sys.exit('Anchor not found: <head> before the first <script>')
s = s[:head] + '''<head>
    <script>/* FREE DEMO: nothing this page does is saved */
    (function () {
        var m = new Map();
        var mem = { getItem: function (k) { return m.has(k) ? m.get(k) : null; }, setItem: function (k, v) { m.set(String(k), String(v)); },
            removeItem: function (k) { m.delete(String(k)); }, clear: function () { m.clear(); },
            key: function (i) { return Array.from(m.keys())[i] || null; }, get length() { return m.size; } };
        try { Object.defineProperty(window, 'localStorage', { value: mem, configurable: true }); } catch (e) {}
        try { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } catch (e) {}
        try { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; } catch (e) {}
    })();
    </script>''' + s[head + len('<head>'):]

# 2. after the app exists: locks, watermark, bar
DEMO = r'''
            (function () {
                const app = window.app, LINK = %s;
                const upsell = what => app.openConfirm(what + ' is in the full version',
                    'This free demo keeps nothing and exports nothing. The full version saves on your computer, backs itself up, and lets you ' + what.toLowerCase() + '.',
                    'Get the Full Version', 'bg-primary-600 hover:bg-primary-700 text-white', () => window.open(LINK, '_blank', 'noopener'));
                const lock = (name, what) => { if (typeof app[name] === 'function') app[name] = () => upsell(what); };
                lock('exportData', 'Download a backup');
                lock('importData', 'Restore a backup');
                lock('exportCSV', 'Export to a spreadsheet');
                lock('exportWorkbook', 'Export an Excel workbook');
                lock('chooseBackupFile', 'Automatic backup');
                lock('writeBackupFile', 'Automatic backup');
                lock('reconnectBackupFile', 'Automatic backup');
                lock('downloadFile', 'Save files');
                if (typeof app.syncCardHtml === 'function') app.syncCardHtml = () => '';
                app.sync = null;
                app.daysSinceBackup = () => 0;
                // Print works, watermarked on every page.
                const getPrintHTML = app.getPrintHTML.bind(app);
                app.getPrintHTML = (...a) => getPrintHTML(...a).replace('</head>',
                    '<style>.demo-wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9999}' +
                    '.demo-wm span{transform:rotate(-30deg);font:800 110px/1 Inter,sans-serif;color:rgba(79,70,229,.10);letter-spacing:.08em;white-space:nowrap}</style></head>')
                    .replace(/<body([^>]*)>/, '<body$1><div class="demo-wm"><span>FREE DEMO</span></div>');
                const bar = document.createElement('div');
                bar.setAttribute('role', 'note');
                bar.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:140;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:14px;background:#0f172a;color:#fff;font:600 13px Inter,sans-serif;box-shadow:0 10px 30px rgba(15,23,42,.35)';
                bar.innerHTML = '<span>Free demo &middot; nothing is saved</span><a href="' + LINK + '" target="_blank" rel="noopener" style="background:var(--theme-500,#6366f1);color:#fff;text-decoration:none;padding:8px 12px;border-radius:10px">Get the full version</a>';
                document.body.appendChild(bar);
            })();'''
rep('            window.app = new ProductivityApp();',
    '            window.app = new ProductivityApp();' + DEMO % json.dumps(link))

s = s.replace('<title>', '<title>Free Demo · ', 1)
out.write_text(s, encoding='utf-8')
print(f'wrote {out} ({len(s) // 1024} KB): nothing saves, exports locked, print watermarked -> {link}')
