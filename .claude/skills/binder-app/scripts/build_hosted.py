#!/usr/bin/env python3
"""The hosted copy of each binder, for phones and tablets, behind its access code.

    python3 build_hosted.py [REPO_ROOT]            build hosting/site/ (+ codes, icons, gate list)
    python3 build_hosted.py [REPO_ROOT] --deploy   CI: build, but never make a new code
    python3 build_hosted.py [REPO_ROOT] --check    exit 1 when hosting/site/ is stale

Same pattern as the JPS apps (references/hosted-and-activation.md): Cloudflare
Pages project from hosting/apps.json (dbd-apps -> https://dbd-apps.pages.dev/<slug>/).
Each binder gets the built HTML plus a home-screen manifest, an offline service
worker, the phone "Add to Home Screen" tip and icons in its theme colour. The
gate (functions/_middleware.js, from assets/hosting/) asks for the product's
access code once per device and remembers it in a cookie.

Codes: one per PRODUCT, given to every buyer of it in START_HERE.pdf.
  hosting/codes.json         SHA-256 hashes, committed
  hosting/ACCESS_CODES.txt   plain codes, git-ignored -- the user keeps the
                             master copy; ask for it before building buyer kits
A product without a hash gets a new code on the next local build. Delete its
hash to issue a new code (old buyers then need the new one).
"""
import hashlib, io, json, os, re, secrets, shutil, subprocess, sys

ROOT = os.path.abspath(next((a for a in sys.argv[1:] if not a.startswith('--')), '.'))
H = os.path.join(ROOT, 'hosting')
SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK, DEPLOY = '--check' in sys.argv, '--deploy' in sys.argv
ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
sha = lambda c: hashlib.sha256(c.encode()).hexdigest()
real = lambda v: v if v and not v.startswith('[') else ''
cfg = json.load(open(os.path.join(H, 'apps.json')))


def install_js(name, slug):
    return f"""<script>/* hosted copy: offline once visited, and a phone tip to add it to the home screen */
if('serviceWorker' in navigator&&location.protocol==='https:')addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{{}}));
(()=>{{const NUDGE='dbd-{slug}-install-later',standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),phone=ios||/Android/i.test(navigator.userAgent);
 let prompt=null;const later=()=>{{try{{return Date.now()-(+localStorage.getItem(NUDGE)||0)<30*864e5;}}catch(e){{return false;}}}};
 const bar=document.createElement('div');bar.hidden=true;bar.setAttribute('role','note');
 bar.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:160;padding:12px 14px;border-radius:14px;background:#fff;color:#0f172a;border:1px solid #e2e8f0;box-shadow:0 8px 30px rgba(15,23,42,.18);display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;font:14px/1.4 Inter,system-ui,sans-serif';
 const b='border:0;border-radius:10px;padding:8px 12px;font:700 13px Inter,system-ui,sans-serif;cursor:pointer';
 const busy=()=>[...document.querySelectorAll('#onboarding-backdrop,#modal-backdrop,#lock-screen')].some(el=>!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none');
 const show=()=>{{if(standalone()||later()||!phone)return;if(busy())return void setTimeout(show,4000);bar.innerHTML=`<span><b>Add {name} to your home screen.</b> ${{prompt?'It opens like an app and works offline.':ios?'Tap the Share button, then <b>Add to Home Screen</b>.':'Open your browser menu, then <b>Add to Home screen</b>.'}}</span><span style="display:flex;gap:8px">${{prompt?`<button data-install="go" style="${{b}};background:var(--theme-600,#4f46e5);color:#fff">Install</button>`:''}}<button data-install="later" style="${{b}};background:#f1f5f9;color:#334155">Not now</button></span>`;bar.hidden=false;}};
 bar.addEventListener('click',async e=>{{const a=e.target.closest('[data-install]');if(!a)return;if(a.dataset.install==='go'&&prompt){{prompt.prompt();try{{await prompt.userChoice;}}catch(e){{}}prompt=null;}}else{{try{{localStorage.setItem(NUDGE,String(Date.now()));}}catch(e){{}}}}bar.hidden=true;}});
 addEventListener('beforeinstallprompt',e=>{{e.preventDefault();prompt=e;show();}});addEventListener('appinstalled',()=>{{bar.hidden=true;}});
 document.body.appendChild(bar);setTimeout(show,4000);}})();
</script>"""


def sw_js(slug, html):
    tag = slug[:12] + '-' + hashlib.sha256(html.encode()).hexdigest()[:12]
    return f"""// {slug} service worker: opens offline once visited. The page: network first, then the saved copy.
const CACHE = '{tag}', PRE = '{slug[:12]}-';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => {{ e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', e => {{ e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PRE) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', e => {{
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {{
    e.respondWith(fetch(req).then(res => {{ if (res.ok) {{ const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }} return res; }}).catch(() => caches.match('./', {{ ignoreSearch: true }})));
    return;
  }}
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {{ if (res.ok) {{ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }} return res; }})));
}});
"""


def main():
    site = os.path.join(H, 'site')
    codes_path = os.path.join(H, 'codes.json')
    codes = json.load(open(codes_path)) if os.path.exists(codes_path) else {}
    files, new_codes, gate = {}, {}, {}
    for a in cfg['apps']:
        slug = a['slug']
        kit = json.load(open(os.path.join(ROOT, a['kit'])))
        html = io.open(os.path.join(ROOT, a['app']), encoding='utf-8').read()
        assert '<title>' in html and '</body>' in html, slug
        theme = re.search(kit['theme'] + r":\s*\{[^}]*600:\s*'(#[0-9a-fA-F]{6})'", html)
        tint = theme.group(1) if theme else '#4f46e5'
        short = a.get('short') or kit['product'][:12]
        html = html.replace('<title>', f'<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="{short}"><title>', 1)
        i = html.rindex('</body>'); html = html[:i] + install_js(kit['product'], slug) + html[i:]
        files[f'{slug}/index.html'] = html
        files[f'{slug}/sw.js'] = sw_js(slug, html)
        files[f'{slug}/manifest.webmanifest'] = json.dumps({
            'name': kit['product'], 'short_name': short, 'description': kit['listing']['promise'],
            'id': './', 'start_url': './', 'scope': './', 'display': 'standalone',
            'background_color': '#f8fafc', 'theme_color': tint, 'categories': a.get('categories', ['productivity']),
            'icons': [{'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
                      {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
                      {'src': 'icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]}, indent=2) + '\n'
        if slug not in codes:
            if CHECK or DEPLOY:
                sys.exit(f'{slug} has no access code yet. Run build_hosted.py locally and commit hosting/codes.json')
            c = '-'.join(''.join(secrets.choice(ALPHA) for _ in range(4)) for _ in range(4))
            codes[slug] = sha(c); new_codes[slug] = c
        gate[slug] = {'name': kit['product'], 'tint': tint, 'icon': a['icon'], 'hash': codes[slug],
                      'buy': real(kit.get('listing_link')) or real(kit.get('shop_link')) or '#',
                      'demo': real(kit.get('demo_link'))}
    gate_src = ('// generated by build_hosted.py: the binders the gate knows, with their access-code hashes\n'
                f'export const HOME = {json.dumps(real(cfg.get("home", "")))};\n'
                'export default ' + json.dumps(gate, ensure_ascii=False) + ';\n')
    gate_path = os.path.join(H, 'functions', '_apps.js')
    mw_src = io.open(os.path.join(SKILL, 'assets', 'hosting', '_middleware.js'), encoding='utf-8').read()
    mw_path = os.path.join(H, 'functions', '_middleware.js')
    if CHECK:
        stale = [f for f, v in files.items() if not os.path.exists(os.path.join(site, f)) or io.open(os.path.join(site, f), encoding='utf-8').read() != v]
        for p, v in ((gate_path, gate_src), (mw_path, mw_src)):
            if not os.path.exists(p) or io.open(p, encoding='utf-8').read() != v: stale.append(os.path.relpath(p, H))
        if stale: sys.exit('stale: ' + ', '.join(stale[:5]))
        print('hosting/site is current'); return
    os.makedirs(os.path.dirname(gate_path), exist_ok=True)
    for f, v in files.items():
        p = os.path.join(site, f); os.makedirs(os.path.dirname(p), exist_ok=True); io.open(p, 'w', encoding='utf-8').write(v)
    io.open(gate_path, 'w', encoding='utf-8').write(gate_src)
    io.open(mw_path, 'w', encoding='utf-8').write(mw_src)
    json.dump(codes, open(codes_path, 'w'), indent=1); open(codes_path, 'a').write('\n')
    if new_codes:
        with open(os.path.join(H, 'ACCESS_CODES.txt'), 'a') as f:
            for s_, c in new_codes.items(): f.write(f'{s_}: {c}\n')
        print('NEW access codes in hosting/ACCESS_CODES.txt (git-ignored; send it to the user):', ', '.join(new_codes))
    icons = os.path.join(H, 'icons')
    missing = {s: g for s, g in gate.items() if not os.path.exists(os.path.join(icons, s, 'maskable-512.png'))}
    if missing:
        r = subprocess.run(['node', os.path.join(SKILL, 'scripts', 'hosted_icons.js'), json.dumps(missing), icons], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
    for s in gate:
        shutil.copytree(os.path.join(icons, s), os.path.join(site, s, 'icons'), dirs_exist_ok=True)
    print(f'hosting/site: {len(gate)} binder(s) -> https://{cfg['project']}.pages.dev/<slug>/')


if __name__ == '__main__':
    main()
