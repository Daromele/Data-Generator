#!/usr/bin/env python3
"""Re-dresses a binder in the JPS Digital Pages house style, for a binder sold in the JPS shop.

    python3 jps_skin.py App.html --fonts path/to/sellable-html-app/assets/fonts.css [--default fjord] [--out App.html]

The binder engine (storage, sync, print, tests) is untouched; only the look changes:
  - type: DM Sans for text, Manrope for headings and numbers (tabular), from the JPS fonts.css,
    replacing Inter / Merriweather / JetBrains Mono everywhere, print documents included
  - THEMES: the 8 JPS light themes (kiln, ledger, sage, linen, fjord, slate, lavender, blush), each
    a 50..900 accent ramp (so every primary-* class follows) plus its paper/card/sunk/ink/rule/bold/pop
    tokens; dark mode uses the JPS "night" tokens
  - surfaces: paper page, cards on --card, recessed --sunk, warm hairlines, the sidebar on --bold-2
    with a --pop marker, the dashboard's first KPI tile as the one dark --bold hero
  - Settings: the round colour dots become JPS palette cards (three bars: bold, accent, pop on paper)
  - a stored theme the new list does not have (e.g. an old 'indigo') falls back to the default

Storage keys and the sync key do not change, so an existing buyer's records are untouched.
check_house_style.py (the binder family's rules) will flag this file by design: it is JPS now.
"""
import argparse, json, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('html'); ap.add_argument('--fonts', required=True)
ap.add_argument('--default', default='fjord'); ap.add_argument('--out')
a = ap.parse_args()
s = open(a.html, encoding='utf-8').read()
if 'JPS house style skin' in s:
    sys.exit('Already skinned.')

T = {  # paper card sunk ink ink2 ink3 rule rule2 accent bold bold2 onbold onbolddim pop popink
 'kiln':     '#FBF8F5 #FFFFFF #F4EEE8 #221A15 #5E5048 #8C7E75 #EEE5DD #DFD2C6 #A4471F #3A2419 #2D1B12 #FBF3EE #CBB3A5 #F2B441 #2A1F06',
 'ledger':   '#F6F7F5 #FFFFFF #EEF1EE #141A1F #4B5660 #7B858D #E4E8E5 #D2D8D4 #1F7A5C #182635 #111C28 #EEF3F7 #A6B6C4 #E3A73B #2B1C04',
 'sage':     '#FAFAF8 #FFFFFF #F2F4F1 #191B18 #525A50 #7E857C #E8EAE5 #D6DAD2 #2F5D50 #1F4A3E #183B31 #F1F6F2 #AFC9BC #F2B441 #2A1F06',
 'linen':    '#F7F4ED #FFFDF8 #F0EBE0 #241F17 #5D554A #8A8174 #E9E3D6 #D9D1C1 #6B5B45 #45392A #362D21 #F8F4EC #C6B9A3 #E8A24A #2B1707',
 'fjord':    '#F6F8FA #FFFFFF #EDF1F5 #151E26 #4C5A66 #7C8994 #E4E9EE #D0D8E0 #2C5470 #1C3C52 #153042 #EFF5F9 #A8C1D2 #F0A93C #2A1B04',
 'slate':    '#F8F9FA #FFFFFF #EFF1F3 #171A1D #4E555C #7D848B #E6E9EC #D3D8DD #3F4A55 #2E3841 #242C34 #F1F3F5 #AFB9C2 #EFA93F #2A1B04',
 'lavender': '#FAF9FC #FFFFFF #F5F2F9 #1B1524 #574E66 #8B8298 #ECE7F2 #DCD4E7 #5C3F8F #2E2040 #241932 #F5F1FA #B6A9C7 #F0B98F #3A2214',
 'blush':    '#FBF6F8 #FFFFFF #F5ECF1 #241820 #5F4F58 #8C7A84 #F0E4EA #E0CCD8 #7C3560 #63304A #4F2639 #FBF0F5 #D3AEC1 #E9A85C #2B1707',
}
KEYS = 'paper card sunk ink ink2 ink3 rule rule2 accent bold bold2 onbold onbolddim pop popink'.split()
NIGHT = dict(zip(KEYS, '#141218 #1C1A21 #232028 #EDEAF2 #B4AEBF #8B8498 #2A2731 #3A3644 #C3A9E8 #221C2C #1A1522 #EDE7F5 #A79BBA #F0B98F #2A1708'.split()))


def mix(c1, c2, t):
    a_, b_ = [int(c1[i:i + 2], 16) for i in (1, 3, 5)], [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * t):02x}' for x, y in zip(a_, b_))


themes = {}
for name, vals in T.items():
    v = dict(zip(KEYS, vals.split()))
    acc = v['accent']
    ramp = {50: mix(acc, '#ffffff', .92), 100: mix(acc, '#ffffff', .84), 200: mix(acc, '#ffffff', .68),
            300: mix(acc, '#ffffff', .48), 400: mix(acc, '#ffffff', .28), 500: mix(acc, '#ffffff', .12),
            600: acc, 700: mix(acc, '#000000', .14), 800: mix(acc, '#000000', .28), 900: v['bold']}
    themes[name] = {**{str(k): c for k, c in ramp.items()}, **v}


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit(f'Anchor found {n}x, expected {count}: {old[:80]!r}')
    s = s.replace(old, new)


# 1. fonts: swap the inlined faces, then the family names
fonts = open(a.fonts, encoding='utf-8').read()
m = re.search(r'(<style id="binder-fonts">)([\s\S]*?)(</style>)', s)
if not m:
    sys.exit('no <style id="binder-fonts"> block (inline the fonts first)')
s = s[:m.start(2)] + fonts + s[m.end(2):]
# keep the quote style: a quoted name inside JS stays a valid string ('Inter' -> 'DM Sans')
def fam(old, new):
    global s
    s = re.sub(r"""(['"]?)""" + old + r"""\1(?=\s*,|\s*;|\s*\)|\s*})""", lambda m: (m.group(1) or '"') + new + (m.group(1) or '"'), s)
fam('Inter', 'DM Sans'); fam('Merriweather', 'Manrope'); fam('JetBrains Mono', 'Manrope')

# 2. THEMES -> the JPS palettes; unknown stored theme falls back to the default
t0 = s.index('        const THEMES = {')
t1 = s.index('        };', t0) + len('        };')
s = s[:t0] + '        // JPS Digital Pages palettes (jps_skin.py): accent ramp 50..900 + house tokens\n        const THEMES = ' + json.dumps(themes) + ';\n        const DEFAULT_THEME = ' + json.dumps(a.default) + ';' + s[t1:]
rep("const colorTheme = storage.get('dwColorTheme') || 'indigo';",
    "const colorTheme = THEMES[storage.get('dwColorTheme')] ? storage.get('dwColorTheme') : DEFAULT_THEME;")
rep("const isActive = (storage.get('dwColorTheme') || 'indigo') === t;",
    "const isActive = (THEMES[storage.get('dwColorTheme')] ? storage.get('dwColorTheme') : DEFAULT_THEME) === t;")
# Settings picker: palette cards (three bars on the theme's paper) instead of round dots
rep("""return `<button onclick="window.app.setColorTheme('${t}')" class="w-8 h-8 rounded-full shadow-sm transition-all ${ring}" style="background-color: ${hexColor};"></button>`;""",
    """const c = THEMES[t]; return `<button onclick="window.app.setColorTheme('${t}')" title="${t[0].toUpperCase() + t.slice(1)}" aria-label="${t} theme" class="jps-pal ${isActive ? 'on' : ''}" style="background:${c.paper}"><i style="background:${c.bold}"></i><i style="background:${c.accent}"></i><i style="background:${c.pop}"></i><span>${t}</span></button>`;""")

# 3. the skin: house tokens over the compiled Tailwind, appended last so it wins
night = ''.join(f'--j-{k}:{v};' for k, v in NIGHT.items())
light = ''.join(f'--j-{k}:var(--theme-{k});' for k in KEYS)
SKIN = f'''<style id="jps-skin">/* JPS house style skin (jps_skin.py) */
:root{{{light}--j-ok:#1F7A52;--j-over:#D23B2B}}
html.dark{{{night}--j-ok:#3E9E72;--j-over:#D6584A;color-scheme:dark}}
html body{{background:var(--j-paper)!important;color:var(--j-ink);font-family:"DM Sans",system-ui,sans-serif;font-size:15px}}
.app-canvas,main,#main-content{{background:var(--j-paper)!important}}
h1,h2,h3,.serif-font{{font-family:Manrope,"DM Sans",sans-serif!important;letter-spacing:-.02em}}
.number-font{{font-family:Manrope,sans-serif!important;font-variant-numeric:tabular-nums;letter-spacing:-.02em}}
html .bg-white,html.dark .dark\\:bg-darkCard,html.dark .dark\\:bg-slate-800,html.dark .dark\\:bg-slate-900{{background-color:var(--j-card)!important}}
html .bg-slate-50,html .bg-slate-100,html .bg-slate-50\\/50,html.dark .dark\\:bg-slate-900\\/50,html.dark .dark\\:bg-slate-900\\/40,html.dark .dark\\:bg-slate-800\\/50,html.dark .dark\\:bg-darkBg{{background-color:var(--j-sunk)!important}}
html .border-slate-100,html .border-slate-200,html.dark .dark\\:border-slate-800,html.dark .dark\\:border-slate-700{{border-color:var(--j-rule)!important}}
html .border-slate-300,html.dark .dark\\:border-slate-600{{border-color:var(--j-rule2)!important}}
html .text-slate-900,html .text-slate-800,html.dark .dark\\:text-white,html.dark .dark\\:text-slate-100,html.dark .dark\\:text-slate-200{{color:var(--j-ink)}}
html .text-slate-700,html .text-slate-600,html.dark .dark\\:text-slate-300{{color:var(--j-ink2)}}
html .text-slate-500,html .text-slate-400,html.dark .dark\\:text-slate-400{{color:var(--j-ink3)}}
.divide-slate-100>*+*,.divide-slate-200>*+*{{border-color:var(--j-rule)!important}}
input,select,textarea{{font-family:inherit}}
/* the rail: --bold-2, quiet labels, a --pop marker on the active item */
#sidebar{{background:var(--j-bold2)!important;border-color:transparent!important}}
#sidebar .text-slate-400,#sidebar .text-slate-500,#sidebar .text-slate-600{{color:var(--j-onbolddim)!important}}
#sidebar .text-white,#sidebar .text-slate-200,#sidebar .text-slate-300{{color:var(--j-onbold)!important}}
#sidebar .border-white\\/10,#sidebar .border-slate-800{{border-color:rgba(255,255,255,.08)!important}}
#sidebar .bg-primary-500\\/15{{background-color:rgba(255,255,255,.09)!important}}#sidebar .bg-primary-400{{background-color:var(--j-pop)!important;width:3px}}#sidebar .border-primary-500\\/20{{border-color:rgba(255,255,255,.14)!important}}
#sidebar .text-primary-300,#sidebar .text-primary-400{{color:var(--j-pop)!important}}
/* one dark hero per screen: the dashboard's first KPI tile */
.bg-gradient-to-br.from-primary-500{{background:var(--j-bold)!important;border-color:var(--j-bold)!important;color:var(--j-onbold)!important}}
.bg-gradient-to-br.from-primary-500 .text-primary-100,.bg-gradient-to-br.from-primary-500 .text-primary-200{{color:var(--j-onbolddim)!important}}
.bg-gradient-to-br.from-primary-500 i{{color:var(--j-pop)!important}}
/* cards: house radius and shadow */
.rounded-2xl{{border-radius:18px}}.shadow-sm{{box-shadow:0 1px 2px rgba(27,21,36,.05),0 1px 1px rgba(27,21,36,.03)!important}}
/* status stays green/red */
html .text-emerald-600,html .text-emerald-500{{color:var(--j-ok)}}html .text-rose-600,html .text-rose-500{{color:var(--j-over)}}
/* Settings palette cards */
.jps-pal{{position:relative;width:58px;height:46px;border-radius:10px;border:1px solid var(--j-rule2);padding:7px 7px 16px;display:flex;gap:3px;cursor:pointer;transition:transform .15s}}
.jps-pal i{{flex:1;border-radius:3px}}.jps-pal span{{position:absolute;left:0;right:0;bottom:2px;font:600 9px "DM Sans",sans-serif;text-transform:capitalize;color:#555}}
.jps-pal:hover{{transform:translateY(-1px)}}.jps-pal.on{{outline:2px solid var(--j-ink);outline-offset:2px}}
@media print{{html body{{background:#fff!important}}}}
</style>'''
i = s.index('</head>')   # the page's own head; print templates carry more
s = s[:i] + SKIN + '\n' + s[i:]
# the picker row wraps now that there are 8 cards
rep('<div class="flex gap-3">\n                                        ${Object.keys(THEMES).map(t => {',
    '<div class="flex flex-wrap gap-2 justify-end">\n                                        ${Object.keys(THEMES).map(t => {')

open(a.out or a.html, 'w', encoding='utf-8').write(s)
print(f'JPS skin applied ({len(themes)} themes, default {a.default}) -> {a.out or a.html}')
