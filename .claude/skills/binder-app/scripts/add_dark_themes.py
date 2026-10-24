#!/usr/bin/env python3
"""Adds the two JPS dark themes, Night and Midnight, to a JPS-skinned binder (run after jps_skin.py).

    python3 add_dark_themes.py App.html [App2.html ...]

Same as the JPS apps: the Settings picker shows the 8 light palette cards, then
Night and Midnight. Picking a dark card switches dark mode on with that palette
(surfaces AND accent); picking a light card switches it off. The moon button
toggles dark mode using the last dark theme chosen (Night until one is picked).

Storage: <prefix>DarkTheme ('night' | 'midnight'), a look setting, so it never
syncs (added to syncSkipList next to DarkMode/ColorTheme). Records untouched.
"""
import re, sys

KEYS = 'paper card sunk ink ink2 ink3 rule rule2 accent bold bold2 onbold onbolddim pop popink'.split()
DARK = {  # tokens from the JPS apps (Study Plan :root[data-theme=night|midnight])
    'night':    '#141218 #1C1A21 #232028 #EDEAF2 #B4AEBF #8B8498 #2A2731 #3A3644 #C3A9E8 #221C2C #1A1522 #EDE7F5 #A79BBA #F0B98F #2A1708',
    'midnight': '#0C1720 #14232D #1B2D38 #F0F7F7 #BDCDD1 #97AEB6 #29414D #3B5864 #9DB8F5 #0B303D #092632 #EFF9F7 #ACCDCC #F5C382 #2B1A07',
}
# accent ramp for a dark surface: 600 carries white button text (>= 4.5:1),
# 300/400 are the light accent for text on dark, 50-200 are dark tints.
RAMP = {
    'night':    dict(zip([50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
                         '#292234 #352C44 #4A3D63 #D6C6EE #C3A9E8 #9A7DD0 #7656AE #634894 #4F3A77 #221C2C'.split())),
    'midnight': dict(zip([50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
                         '#1E2D46 #2A3D5E #3A5078 #BCD0F8 #9DB8F5 #5F86D6 #3A63B4 #30549A #27457F #0B303D'.split())),
}


def css(name):
    t = dict(zip(KEYS, DARK[name].split()))
    j = ''.join(f'--j-{k}:{v}!important;' for k, v in t.items())
    r = ''.join(f'--theme-{k}:{v}!important;' for k, v in RAMP[name].items())
    return f'html.dark[data-dark="{name}"]{{{j}{r}}}'


def patch(path):
    s = open(path, encoding='utf-8').read()
    if 'DARK_THEMES' in s:
        print(path, 'already has the dark themes'); return
    assert 'JPS house style skin' in s, path + ': run jps_skin.py first'
    m = re.search(r"storage\.get\('(\w+)DarkMode'\)", s); assert m, path + ': no DarkMode setting'
    P = m.group(1)

    def rep(a, b, n=1):
        nonlocal s
        c = s.count(a); assert c == n, (path, c, a[:70]); s = s.replace(a, b)

    # 1. tokens: the dark palettes, chosen by html[data-dark]
    i = s.index('<style id="jps-skin">'); j = s.index('</style>', i)
    s = s[:j] + '\n/* JPS dark themes (add_dark_themes.py) */\n' + '\n'.join(css(k) for k in DARK) + '\n.jps-pal.dark span{color:#ddd}\n' + s[j:]

    # 2. data the picker draws from
    swatch = {k: dict(zip(KEYS, v.split())) for k, v in DARK.items()}
    rep('        const DEFAULT_THEME = ', '        const DARK_THEMES = ' + repr({k: {'paper': v['paper'], 'bold': v['bold'], 'accent': v['accent'], 'pop': v['pop']} for k, v in swatch.items()}).replace("'", '"') + ';\n        const DEFAULT_THEME = ')

    # 3. the dark palette follows the stored choice
    dark_of = f"(DARK_THEMES[storage.get('{P}DarkTheme')] ? storage.get('{P}DarkTheme') : 'night')"
    rep(f"            initTheme() {{\n                const isDark = storage.get('{P}DarkMode');",
        f"            initTheme() {{\n                document.documentElement.dataset.dark = {dark_of};\n                const isDark = storage.get('{P}DarkMode');")
    rep("            toggleDarkMode() {\n                const isDark = document.documentElement.classList.contains('dark');",
        f"""            // Settings picker: a light card switches dark mode off, a dark card (Night,
            // Midnight) switches it on with that palette. Same as the JPS apps.
            pickTheme(t) {{
                const isDark = document.documentElement.classList.contains('dark');
                if (DARK_THEMES[t]) {{
                    storage.set('{P}DarkTheme', t);
                    document.documentElement.dataset.dark = t;
                    if (!isDark) return this.toggleDarkMode();
                    return this.reRenderCurrentSection();
                }}
                this.setColorTheme(t, false);
                if (isDark) return this.toggleDarkMode();
                this.reRenderCurrentSection();
            }}

            toggleDarkMode() {{
                document.documentElement.dataset.dark = {dark_of};
                const isDark = document.documentElement.classList.contains('dark');""")

    # 4. picker: light cards are 'on' only in light mode; then the two dark cards
    i = s.index('${Object.keys(THEMES).map(t => {'); j = s.index("}).join('')}", i) + len("}).join('')}")
    old = s[i:j]
    new = old.replace("const isActive = (", "const isActive = !document.documentElement.classList.contains('dark') && (") \
             .replace("onclick=\"window.app.setColorTheme('${t}')\"", "onclick=\"window.app.pickTheme('${t}')\"")
    assert new != old and 'pickTheme' in new, path + ': picker anchors'
    new += """${Object.keys(DARK_THEMES).map(t => {
                                            const c = DARK_THEMES[t], isActive = document.documentElement.classList.contains('dark') && document.documentElement.dataset.dark === t;
                                            return `<button onclick="window.app.pickTheme('${t}')" title="${t[0].toUpperCase() + t.slice(1)} (dark)" aria-label="${t} dark theme" class="jps-pal dark ${isActive ? 'on' : ''}" style="background:${c.paper}"><i style="background:${c.bold}"></i><i style="background:${c.accent}"></i><i style="background:${c.pop}"></i><span>${t}</span></button>`;
                                        }).join('')}"""
    s = s[:i] + new + s[j:]

    # 5. a look setting: never syncs
    if "...['DarkMode', 'ColorTheme'," in s:
        rep("...['DarkMode', 'ColorTheme',", "...['DarkMode', 'DarkTheme', 'ColorTheme',")
    else:   # older binders list the keys with the prefix
        rep(f"'{P}DarkMode', '{P}ColorTheme',", f"'{P}DarkMode', '{P}DarkTheme', '{P}ColorTheme',")
    open(path, 'w', encoding='utf-8').write(s)
    print(path, 'Night and Midnight added (prefix', P + ')')


for p in sys.argv[1:]:
    patch(p)
