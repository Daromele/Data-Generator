#!/usr/bin/env python3
"""Enforce the binder house style, so every product in the family is identical
where it should be.

references/design-system.md is the prose; this is the part a machine can hold
you to. It checks the things that drift silently between one build and the
next: the five fixed themes, the fixed semantic palette, the three typefaces,
dark-mode pairs on surfaces, and the accessibility attributes that only get
noticed when they are missing.

Usage:  python3 check_house_style.py path/to/App.html [--quiet]
Exit:   1 if there is any BLOCKER, else 0.
"""

import re
import sys

# The five themes are FIXED. A product does not get its own palette; it gets
# one of these, and the buyer switches between them.
THEMES = {
    "indigo": "#6366f1",
    "teal": "#14b8a6",
    "emerald": "#10b981",
    "rose": "#f43f5e",
    "amber": "#f59e0b",
}

# The semantic palette is also fixed, and separate from the theme accent.
# Anything outside this set is off-system: it will not follow a theme switch
# and it will not match the other products.
SEMANTIC = {"rose", "amber", "emerald", "blue", "slate", "white", "black", "primary"}

FONTS = ("Inter", "JetBrains Mono", "Merriweather")


def check(html):
    out = []

    # Class checks run on the markup and script only. The compiled Tailwind
    # stylesheet DEFINES every utility that exists, so scanning it reports
    # every colour in the framework as if the app used it.
    markup = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.S)

    def add(sev, name, what, fix):
        out.append((sev, name, what, fix))

    # 1. the five themes, with the exact accents
    block = re.search(r"const THEMES\s*=\s*\{(.*?)\n\s*\};", html, re.S)
    if not block:
        add("BLOCKER", "Themes missing",
            "No THEMES object, so the buyer cannot switch theme.",
            "Copy THEMES from assets/config-example.js.")
    else:
        body = block.group(1)
        found = re.findall(r"(\w+)\s*:\s*\{", body)
        missing = [t for t in THEMES if t not in found]
        extra = [t for t in found if t not in THEMES]
        if missing or extra:
            add("BLOCKER", "Theme set changed",
                "Themes are %s; the family's fixed set is %s."
                % (", ".join(found) or "none", ", ".join(THEMES)),
                "Use exactly the five. A product does not get its own palette.")
        for name, accent in THEMES.items():
            m = re.search(r"%s\s*:\s*\{[^}]*?\b500\s*:\s*'([^']+)'" % name, body)
            if m and m.group(1).lower() != accent:
                add("BLOCKER", "Theme accent changed",
                    "%s 500 is %s, not %s." % (name, m.group(1), accent),
                    "Restore the shared ramp so screenshots match across products.")

    # 2. the theme accent must never be hard-coded
    leaks = set(re.findall(r"\b(?:bg|text|border|ring)-(indigo|teal)-\d{2,3}", markup))
    if leaks:
        add("BLOCKER", "Hard-coded theme colour",
            "Uses %s-* as a Tailwind class, so that element ignores the theme "
            "switcher." % "/".join(sorted(leaks)),
            "Write primary-600 (wired to var(--theme-600)), never a palette name.")

    # 3. off-system colours
    off = {}
    for m in re.finditer(r"\b(?:bg|text|border|ring|from|to)-([a-z]+)-\d{2,3}", markup):
        c = m.group(1)
        if c not in SEMANTIC and c not in THEMES:
            off[c] = off.get(c, 0) + 1
    if off:
        add("MAJOR", "Off-system colour",
            "Colours outside the fixed palette: %s."
            % ", ".join("%s (%d)" % (k, v) for k, v in sorted(off.items())),
            "Use rose for bad, amber for warning, emerald for good, blue for "
            "informational, slate for structure, primary-* for the accent.")

    # 4. typefaces
    for f in FONTS:
        if f not in html:
            add("MAJOR", "Typeface missing",
                "%s is not loaded, so this product does not match the others." % f,
                "Load Inter, JetBrains Mono and Merriweather.")
    if not re.search(r"\.number-font\s*\{[^}]*tabular-nums", html):
        add("MAJOR", "Numbers not tabular",
            "`.number-font` has no tabular-nums, so columns of figures do not "
            "line up -- and a binder is mostly columns of figures.",
            "font-variant-numeric: tabular-nums on .number-font.")

    # 5. dark pairs on surfaces. A surface is a white background on a slate
    #    border; the toggle knob and bg-white/10 are not surfaces.
    bare = [c for c in re.findall(r'class="([^"]{0,500})"', markup)
            if re.search(r"(?<![-:/])\bbg-white\b(?!/)", c)
            and "border-slate-200" in c and "dark:bg-" not in c]
    if bare:
        add("MAJOR", "Surface without a dark pair",
            "%d white surface(s) have no dark: background, so they stay white "
            "in dark mode." % len(bare),
            "Add dark:bg-darkCard (and the matching dark: border).")

    # 6. the canvas and the rail
    if "#eef1f7" not in html:
        add("minor", "Canvas tint missing",
            "The app canvas is not the house #eef1f7, so cards stop reading as "
            "raised.",
            "Copy .app-canvas from design-system.md.")
    if not re.search(r'id="sidebar"[^>]*bg-slate-900', markup):
        add("minor", "Rail not dark",
            "The sidebar is not slate-900. It is dark in light mode too; that "
            "is what anchors the page.",
            "bg-slate-900 on #sidebar.")

    # 7. motion and accessibility
    if "prefers-reduced-motion" not in html:
        add("MAJOR", "Motion not reducible",
            "No prefers-reduced-motion rule.",
            "Copy the reduce block from design-system.md.")
    dialogs = len(re.findall(r'role="dialog"', markup))
    modal = len(re.findall(r'aria-modal="true"', markup))
    if dialogs and modal < dialogs:
        add("MAJOR", "Dialog not announced",
            "%d dialog(s), %d with aria-modal." % (dialogs, modal),
            "Every dialog needs role, aria-modal and aria-labelledby.")
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
    findings = check(html)
    rank = {"BLOCKER": 0, "MAJOR": 1, "minor": 2}
    counts = {k: 0 for k in rank}
    for sev, name, what, fix in sorted(findings, key=lambda f: rank[f[0]]):
        counts[sev] += 1
        if "--quiet" not in sys.argv:
            print("[%-8s] %s\n    %s\n    Fix: %s\n" % (sev, name, what, fix))
    print("%d blockers, %d major, %d minor"
          % (counts["BLOCKER"], counts["MAJOR"], counts["minor"]))
    return 1 if counts["BLOCKER"] else 0


if __name__ == "__main__":
    sys.exit(main())
