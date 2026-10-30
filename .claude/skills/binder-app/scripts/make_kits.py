#!/usr/bin/env python3
"""Builds the two zips a product ships with, from kit.json and the generated parts.

    python3 make_kits.py kit.json App.html SHOTS_DIR PHOTOS_DIR VIDEO.mp4 DEMO.html OUT_DIR --codes hosting/ACCESS_CODES.txt

OUT_DIR/
  <Product>_Buyer_Kit.zip          what the buyer downloads from Etsy (uploaded on its own)
      <file>.html  START_HERE.pdf (with the phone link and ACCESS CODE)  LICENSE.txt
      <Product>_Quick_Start_Guide.html
  <Product>_Listing_Kit/           what the seller uploads
      1_Photos/  2_Video/  4_Extras/  Listing_Text.txt
  <Product>_Listing_Kit.zip

Listing_Text.txt opens with the Etsy title and the 13 tags, then the
description (copy everything below the line), then the rest in the order Etsy
asks for it. It refuses tags over 20 characters, a title over 140, more or
fewer than 13 tags, and phone/PWA claims (references/packaging.md §7).
Placeholders like [ADD YOUR DEMO LINK] are kept and listed at the end.
"""
import base64, html, io, json, pathlib, re, shutil, sys, zipfile

argv = sys.argv[1:]
codes_file = None
if '--codes' in argv:
    i = argv.index('--codes'); codes_file = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
if len(argv) != 7:
    sys.exit(__doc__)
kit_p, app_p, shots, photos, video, demo, out = map(pathlib.Path, argv)
kit = json.loads(kit_p.read_text(encoding='utf-8'))
L = kit['listing']
name = kit['product']
safe = re.sub(r'[^A-Za-z0-9]+', '_', name).strip('_')
app_name = kit.get('file') or safe + '.html'
email, shop = kit['support_email'], kit['shop_link']
app_html = app_p.read_text(encoding='utf-8')
has_sync = 'BinderSync.create' in app_html or 'JPSSync.create' in app_html

# ---- honesty checks -------------------------------------------------------
problems = []
if len(L['title']) > 140: problems.append(f"title is {len(L['title'])} chars (max 140)")
if len(L['tags']) != 13: problems.append(f"{len(L['tags'])} tags (need 13)")
problems += [f'tag "{t}" is over 20 chars' for t in L['tags'] if len(t) > 20]
blob = json.dumps(kit).lower()
hosted = bool(kit.get('hosted_url'))
for bad in ('pwa', 'app store', 'iphone app', 'android app') + (() if hosted else ('works on phones', 'phone', 'tablet')):
    if bad in blob: problems.append(f'claim "{bad}": ' + ('not an app-store app' if hosted else 'a downloaded file does not run on phones; add a hosted copy (build_hosted.py) first'))
codes = dict(l.strip().split(': ', 1) for l in open(codes_file) if ': ' in l) if codes_file else {}
if hosted and kit['slug'] not in codes:
    problems.append(f'no access code for {kit["slug"]}: pass --codes hosting/ACCESS_CODES.txt (ask the user for it; it is not in git)')
if 'sync' in blob and not has_sync: problems.append('the listing mentions sync but the app has none')
if problems:
    sys.exit('Refusing to build:\n  ' + '\n  '.join(problems))

# ---- buyer files ------------------------------------------------------------
# START_HERE is a one-page PDF now (start_here.py), built into the zip below.

LICENSE = f"""{name} -- LICENSE

You may use this file for your own household or your own homeschool.

You may not resell, share, give away or redistribute it, in whole or in part,
or list it on any website or marketplace.

{name} keeps track of the information you enter. It does not give legal,
tax, medical, educational or financial advice, and it does not check that
your records meet any rule that applies to you.

The file is provided as is, without warranty. Keep your own backups.

© {kit.get('brand', {}).get('name', 'Designs by Darowan')}. All rights reserved.
"""

ICONS = {
    'open': '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18"/>',
    'people': '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
    'pencil': '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    'shield': '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
    'save': '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
    'print': '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    'sync': '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M20 20v-5h-5"/>',
    'update': '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
}
COLORS = ['#4f46e5', '#0d9488', '#059669', '#e11d48', '#d97706']


def thumb(img_name, width=900):
    """Screenshot as a JPEG data URI, small enough for a light guide."""
    f = shots / (img_name + '.png')
    if not f.exists():
        return ''
    try:
        from PIL import Image
        im = Image.open(f).convert('RGB')
        im.thumbnail((width, width * 2))
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=80)
        data = buf.getvalue()
    except ImportError:
        data = f.read_bytes()
    return 'data:image/jpeg;base64,' + base64.b64encode(data).decode()


fonts = (re.search(r'<style id="binder-fonts">([\s\S]*?)</style>', app_html) or [None, ''])[1]
steps = []
for i, g in enumerate(kit.get('guide', [])):
    c = COLORS[i % len(COLORS)]
    img = thumb(g['image']) if g.get('image') else ''
    if g['icon'] == 'sync' and not has_sync:
        continue
    steps.append(f'''<section class="step" style="--c:{c}">
  <div class="head"><div class="ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS.get(g["icon"], ICONS["open"])}</svg></div>
  <div><div class="n">Step {len(steps) + 1}</div><h2>{html.escape(g["title"])}</h2></div></div>
  <ul>{"".join(f"<li>{html.escape(x)}</li>" for x in g["lines"])}</ul>
  {f'<img src="{img}" alt="">' if img else ''}
</section>''')
GUIDE = f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(name)} · Quick Start</title><style>{fonts}
*{{box-sizing:border-box}}body{{margin:0;background:#f8fafc;color:#0f172a;font:16px/1.5 Inter,system-ui,sans-serif}}
header{{background:linear-gradient(135deg,#312e81,#4f46e5);color:#fff;text-align:center;padding:48px 16px}}
h1{{font:700 40px/1.15 Merriweather,Georgia,serif;margin:0}}header p{{margin:10px 0 0;color:#c7d2fe;font-size:18px}}
main{{max-width:860px;margin:0 auto;padding:28px 16px 48px;display:grid;gap:22px}}
.step{{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:22px;break-inside:avoid}}
.head{{display:flex;gap:14px;align-items:center}}.ic{{width:48px;height:48px;border-radius:13px;background:var(--c);display:flex;align-items:center;justify-content:center;flex:none}}
.n{{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c)}}h2{{margin:0;font:700 22px Merriweather,Georgia,serif}}
ul{{margin:14px 0 0;padding-left:20px}}li{{margin:4px 0}}img{{display:block;width:100%;margin-top:16px;border-radius:10px;border:1px solid #e2e8f0}}
footer{{text-align:center;color:#64748b;font-size:14px;padding:0 16px 40px}}
@media print{{header{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}body{{background:#fff}}}}
</style></head><body><header><h1>{html.escape(name)}</h1><p>Quick start · {len(steps)} short steps</p></header>
<main>{"".join(steps)}</main><footer>Questions? {html.escape(email)} · {html.escape(shop)}</footer></body></html>'''

# ---- the buyer kit ----------------------------------------------------------
out.mkdir(parents=True, exist_ok=True)
buyer_zip = out / f'{safe}_Buyer_Kit.zip'
with zipfile.ZipFile(buyer_zip, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(app_p, app_name)
    sh_pdf = out / 'START_HERE.pdf'
    r = __import__('subprocess').run([sys.executable, str(pathlib.Path(__file__).with_name('start_here.py')), str(kit_p), str(app_p), str(sh_pdf)]
                                     + (['--codes', codes_file] if codes_file else []), capture_output=True, text=True)
    if r.returncode:
        sys.exit('START_HERE.pdf: ' + r.stderr.strip())
    z.write(sh_pdf, 'START_HERE.pdf'); sh_pdf.unlink()
    z.writestr('LICENSE.txt', LICENSE)
    z.writestr(f'{safe}_Quick_Start_Guide.html', GUIDE)

# ---- the listing text -------------------------------------------------------
bullets = lambda xs: '\n'.join('• ' + x for x in xs)
photos_list = sorted(photos.glob('*.jpg'))
DESC = f"""{L['promise']}

▶ Try the free demo first: {kit['demo_link']}

{L['more_than']}

WHAT YOU GET
{L['what_you_get']}

TABS INCLUDED
{bullets(L['tabs'])}

HIGHLIGHTED FEATURES
{bullets(L['features'])}

PERFECT FOR
{L['perfect_for']}

BEFORE BUYING
{bullets(L['before_buying'])}

▶ Free demo: {kit['demo_link']}
▶ Walkthrough video: {kit['video_link']}"""

TEXT = f"""TITLE (copy into Etsy's Title box)
{L['title']}

TAGS (13, copy one at a time into Etsy's Tags box)
{', '.join(L['tags'])}

DESCRIPTION (copy everything below this line)
{'─' * 60}
{DESC}
{'─' * 60}

PHOTOS (1_Photos, upload in this order; Etsy allows 20)
{chr(10).join(f'  {i + 1:>2}. {p.name}' for i, p in enumerate(photos_list))}
  Fewer slots? Drop from the end of the list first, never the first two.

VIDEO (2_Video)
  {video.name if video.exists() else '[render with make_video.js]'}

ABOUT THIS LISTING
  Who made it: I did · What is it: A finished product · When was it made: 2020-2026
  Type: Digital

MATERIALS
  {', '.join(L.get('materials', ['HTML']))}

DIGITAL FILE (upload the separate buyer zip)
  {buyer_zip.name}

PRICE & QUANTITY
  {L.get('price_note', '[SET YOUR PRICE]')} · quantity 999

BEFORE YOU PUBLISH
  [ ] Every placeholder in square brackets is filled in
  [ ] The demo link opens and says "Free demo · nothing is saved"
  [ ] You opened the buyer zip on a computer and the app loads
  [ ] The first photo reads clearly as a small square thumbnail
"""
holes = sorted(set(re.findall(r'\[(?:ADD|SET)[^\]]*\]', TEXT + json.dumps(kit, ensure_ascii=False))))
if holes:
    TEXT += '\nSTILL TO FILL IN\n' + '\n'.join('  ' + h for h in holes) + '\n'

# ---- the listing kit ----------------------------------------------------------
kit_dir = out / f'{safe}_Listing_Kit'
if kit_dir.exists():
    shutil.rmtree(kit_dir)
for d in ('1_Photos', '2_Video', '4_Extras'):   # no 3_Digital_File: the buyer zip ships on its own (user's rule)
    (kit_dir / d).mkdir(parents=True)
for p in photos_list:
    shutil.copy(p, kit_dir / '1_Photos' / p.name)
if video.exists():
    shutil.copy(video, kit_dir / '2_Video' / f'{safe}_Walkthrough.mp4')
if demo.exists():
    shutil.copy(demo, kit_dir / '4_Extras' / f'{safe}_Free_Demo.html')
for p in sorted(shots.glob('doc-*.pdf')):
    shutil.copy(p, kit_dir / '4_Extras' / ('Sample_' + p.name[4:]))
(kit_dir / 'Listing_Text.txt').write_text(TEXT, encoding='utf-8')
listing_zip = out / f'{safe}_Listing_Kit.zip'
shutil.make_archive(str(listing_zip.with_suffix('')), 'zip', kit_dir.parent, kit_dir.name)

mb = lambda f: f'{f.stat().st_size / 1e6:.1f} MB'
print(f'buyer kit   {buyer_zip}  ({mb(buyer_zip)})')
print(f'listing kit {listing_zip}  ({mb(listing_zip)})')
if holes:
    print('still to fill in: ' + ', '.join(holes))
