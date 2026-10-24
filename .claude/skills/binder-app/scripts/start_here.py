#!/usr/bin/env python3
"""START_HERE.pdf: the one page a buyer reads first -- how to open it, the phone
link with their ACCESS CODE, a routine, how to keep records safe, and help.

    python3 start_here.py kit.json App.html OUT.pdf [--codes hosting/ACCESS_CODES.txt]

Same layout as the JPS START_HERE (Dashboard-Creator monthly-plan/build/start_here.py),
in binder type and colours: coloured header, step cards, a phone card with the
link and the code in a dashed box beside a routine card, a table of ways to keep
records safe, the help row. Without a code file the box shows XXXX-XXXX-XXXX-XXXX
(fine for previews, never for a buyer kit -- make_kits.py refuses that).
Fails if the page does not fit on one Letter page.
"""
import html, json, os, re, subprocess, sys

argv = sys.argv[1:]
if '--codes' in argv:
    i = argv.index('--codes'); argv = argv[:i] + argv[i + 2:]
args = [a for a in argv if not a.startswith('--')]
if len(args) != 3:
    sys.exit(__doc__)
kit_p, app_p, out = args
kit = json.load(open(kit_p, encoding='utf-8'))
app = open(app_p, encoding='utf-8').read()
codes = {}
if '--codes' in sys.argv:
    cf = sys.argv[sys.argv.index('--codes') + 1]
    codes = dict(l.strip().split(': ', 1) for l in open(cf) if ': ' in l)
code = codes.get(kit['slug'], 'XXXX-XXXX-XXXX-XXXX')
e = html.escape
fonts = (re.search(r'<style id="binder-fonts">([\s\S]*?)</style>', app) or [None, ''])[1]
T = dict(re.findall(r"(\d+):\s*'(#[0-9a-fA-F]{6})'", (re.search(kit['theme'] + r":\s*\{([^}]*)\}", app) or [None, ''])[1]))
t, t50, t200 = T.get('600', '#4f46e5'), T.get('50', '#eef2ff'), T.get('200', '#c7d2fe')
sh = kit['start_here']
url = kit.get('hosted_url', '')
has_sync = 'BinderSync.create' in app
file_name = kit.get('file', 'App.html')
guide = re.sub(r'[^A-Za-z0-9]+', '_', kit['product']).strip('_') + '_Quick_Start_Guide.html'
email, shop = kit['support_email'], kit['shop_link']
brand = kit.get('brand') or {'name': 'Designs by Darowan', 'more_apps': shop, 'more_label': 'more binders'}

ICON = {
    'file': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    'phone': '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    'key': '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>',
    'cal': '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    'swap': '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    'help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01"/>',
    'shield': '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/>',
    'wifi': '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>',
    'tag': '<path d="M3 12V4h8l9.5 9.5-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>',
    'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    'book': '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    'save': '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
    'sync': '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M20 20v-5h-5"/>',
    'print': '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
}
svg = lambda k: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICON[k]}</svg>'
step = lambda n, h, p: f'<div class="st"><b class="n">{n}</b><div><h3>{h}</h3><p>{p}</p></div></div>'
row = lambda i, how, what, where: f'<tr><td><div class="hw"><span class="ti">{svg(i)}</span>{how}</div></td><td>{what}</td><td><span class="pill">{where}</span></td></tr>'
steps = [step(1, 'Open the planner', f'Unzip, then double-click <b>{e(file_name)}</b>. It opens in Chrome, Edge, Safari or Firefox.')]
steps += [step(i + 2, e(h), e(p)) for i, (h, p) in enumerate(sh['steps'][:2])]
rows = [row('save', 'Download backup', 'One file you keep safe; restore it on any device', 'Everywhere'),
        row('file', 'Automatic backup', 'Saves itself to a file you choose', 'Chrome, Edge')]
if has_sync:
    rows.append(row('sync', 'Sync', 'Computer, phone and tablet stay the same, encrypted', 'Optional'))

page = f'''<!doctype html><html><head><meta charset="utf-8"><style>{fonts}
@page{{size:Letter;margin:0}}*{{box-sizing:border-box}}
:root{{--t:{t};--soft:{t50};--line:{t200};--ink:#0f172a;--ink2:#475569;--ink3:#94a3b8;--rule:#e2e8f0}}
body{{margin:0;width:8.5in;height:11in;padding:.5in .55in .45in;font:10.5pt/1.45 Inter,system-ui,sans-serif;color:var(--ink);background:#f8fafc;display:flex;flex-direction:column;gap:13px}}
h1,h3{{font-family:Merriweather,Georgia,serif}}h1{{margin:0;font-size:24pt;line-height:1.05}}
h2{{margin:0 0 8px;font-size:9.5pt;text-transform:uppercase;letter-spacing:.1em;color:var(--ink3);display:flex;align-items:center;gap:7px}}h2 svg{{width:16px;height:16px;color:var(--t)}}
h3{{margin:0;font-size:10.5pt}}p{{margin:2px 0 0;color:var(--ink2)}}a{{color:var(--t);text-decoration:none;font-weight:700}}
.hd{{display:flex;align-items:center;gap:16px;padding:18px 20px;border-radius:16px;background:linear-gradient(135deg,{T.get('900', '#312e81')},{t});color:#fff}}
.hd small{{display:block;font-size:8.5pt;letter-spacing:.14em;text-transform:uppercase;opacity:.8;margin-bottom:3px}}
.hd .bd{{margin-left:auto;display:flex;flex-direction:column;gap:5px;font-size:9pt}}.hd .bd span{{display:flex;align-items:center;gap:6px;white-space:nowrap}}.hd .bd svg{{width:14px;height:14px}}
.card{{background:#fff;border:1px solid var(--rule);border-radius:14px;padding:16px 18px}}
.steps{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}}.st{{display:flex;gap:10px;align-items:flex-start;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:14px}}
.n{{flex:none;width:26px;height:26px;border-radius:50%;background:var(--t);color:#fff;display:grid;place-items:center;font-size:10.5pt}}
.two{{display:grid;grid-template-columns:1.15fr 1fr;gap:12px}}
.code{{margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--soft);border:1.5px dashed var(--t)}}.code svg{{width:20px;height:20px;color:var(--t);flex:none}}
.code small{{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:.1em;color:var(--ink3)}}.code b{{font:700 15pt "JetBrains Mono",ui-monospace,Menlo,monospace;letter-spacing:.06em}}
ul{{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}}li{{display:flex;gap:8px;align-items:flex-start}}li:before{{content:"";flex:none;width:7px;height:7px;margin-top:6px;border-radius:2px;background:var(--t)}}
.tip{{margin-top:10px;font-size:9.2pt;color:var(--ink2);display:flex;gap:7px;align-items:flex-start}}.tip svg{{width:16px;height:16px;color:var(--t);flex:none}}
table{{width:100%;border-collapse:collapse;font-size:9.6pt}}th{{text-align:left;font-size:8.2pt;text-transform:uppercase;letter-spacing:.08em;color:var(--ink3);font-weight:600;padding:0 8px 6px}}
td{{padding:8px;border-top:1px solid var(--rule);vertical-align:middle}}td:first-child{{font-weight:700;width:30%}}td:last-child{{width:20%}}
.hw{{display:flex;align-items:center;gap:8px}}.ti{{width:24px;height:24px;border-radius:7px;background:var(--soft);display:grid;place-items:center;flex:none}}.ti svg{{width:15px;height:15px;color:var(--t)}}
.pill{{display:inline-block;padding:2px 9px;border-radius:999px;font-size:8.3pt;font-weight:700;background:var(--soft);color:var(--t);border:1px solid var(--line);white-space:nowrap}}
.help{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}}.help div{{display:flex;gap:8px;align-items:center;font-size:9.2pt}}.help svg{{width:18px;height:18px;color:var(--t);flex:none}}
.ft{{margin-top:auto;font-size:8.3pt;color:var(--ink3);display:flex;justify-content:space-between}}
</style></head><body>
<div class="hd"><div><small>Start here</small><h1>{e(kit['product'])}</h1></div>
<div class="bd"><span>{svg('wifi')}Works offline</span><span>{svg('shield')}Your records stay on your device</span><span>{svg('tag')}Yours to keep, no subscription</span></div></div>
<section><h2>{svg('file')}Get started</h2><div class="steps">{''.join(steps)}</div>
<div class="tip">{svg('print')}<span>When you're ready, <b>Print</b> builds the finished document ({e(kit.get('artifact', 'your document'))}). Save it as a PDF or print on paper.</span></div></section>
<div class="two"><section class="card"><h2>{svg('phone')}On your phone or tablet</h2>
<p>Open <a href="{e(url)}">{e(url.replace('https://', '').rstrip('/'))}</a>, enter your code once, then <b>Share › Add to Home Screen</b>.</p>
<div class="code">{svg('key')}<div><small>Your access code</small><b>{e(code)}</b></div></div>
{f'<div class="tip">{svg("sync")}<span>Turn on <b>Sync</b> in Settings to keep your phone and computer the same.</span></div>' if has_sync else ''}</section>
<section class="card"><h2>{svg('cal')}{e(sh['routine_title'])}</h2><ul>{''.join(f'<li>{e(x)}</li>' for x in sh['routine'])}</ul></section></div>
<section class="card"><h2>{svg('swap')}Keep your records safe</h2><table><tr><th>How</th><th>What it does</th><th>Where</th></tr>{''.join(rows)}</table>
<div class="tip">{svg('shield')}<span><b>Back up today.</b> Your records live in this browser only; clearing browser data removes them. A new version of the planner never loses them: open it, then Settings › Restore Backup.</span></div></section>
<section><h2>{svg('help')}Need help?</h2><div class="help"><div>{svg('book')}<span><b>{e(guide)}</b><br>step-by-step, in your download</span></div>
<div>{svg('mail')}<span><a href="mailto:{e(email)}">{e(email)}</a><br>or Etsy Messages</span></div><div>{svg('tag')}<span><a href="{e(brand.get('more_apps', shop))}">{e(brand['name'])}</a><br>{e(brand.get('more_label', 'more apps'))}</span></div></div></section>
<div class="ft"><span>© {e(brand['name'])} · for your own household, see LICENSE.txt</span><span>{e(sh.get('footer', ''))}</span></div>
</body></html>'''

tmp = out + '.html'
open(tmp, 'w', encoding='utf-8').write(page)
js = '''const fs=require('fs');const {chromium}=require('playwright');(async()=>{
const b=await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});const p=await b.newPage();
await p.goto('file://'+process.argv[1]);await p.evaluate(()=>document.fonts.ready);
if(await p.evaluate(()=>document.body.scrollHeight>document.body.clientHeight+2)){console.error('START_HERE does not fit on one page');process.exit(1);}
await p.pdf({path:process.argv[2],format:'Letter',printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});await b.close();})().catch(e=>{console.error(e.message);process.exit(1);});'''
r = subprocess.run(['node', '-e', js, os.path.abspath(tmp), os.path.abspath(out)], capture_output=True, text=True)
os.remove(tmp)
if r.returncode:
    sys.exit(r.stderr.strip())
print(f'wrote {out} (code {"set" if code[0] != "X" else "PLACEHOLDER"})')
