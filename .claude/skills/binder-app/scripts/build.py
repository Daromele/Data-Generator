#!/usr/bin/env python3
"""Bundle src/app.html into one self-contained file in dist/.

Every asset is inlined, so the shipped file works with no network at all --
the offline promise the product makes to its buyer. The build REFUSES to
produce a file that still reaches the network, because that defect is
invisible until a buyer opens it on a train.

Usage:  python3 build.py              # build dist/<Product_Name>.html
        python3 build.py --css        # regenerate vendor/tailwind.css first
"""

import base64
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src" / "app.html"
VENDOR = ROOT / "vendor"
DIST = ROOT / "dist"
OUT = DIST / "Product_Name.html"          # <- rename per product

# Google Fonts is the one allowed exception: it degrades to system fonts and
# is never required for the app to work. Everything else must be inlined.
ALLOWED_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com")

# Sync is an add-on, and an add-on has to be DECLARED, not merely tolerated.
# Set this to the sync worker's host for a product that ships sync; leave it
# None and any sync host in the file fails the build -- which is exactly how an
# accidentally reintroduced CDN looks, and the same check catches both.
SYNC_HOST = None                          # "jps-sync.darowan-rph.workers.dev"


def build_tailwind():
    """Regenerate vendor/tailwind.css from the classes used in src/app.html."""
    subprocess.run(
        ["npx", "--yes", "tailwindcss@3.4.17", "-c", str(ROOT / "tailwind.config.js"),
         "-i", str(ROOT / "in.css"), "-o", str(VENDOR / "tailwind.css"), "--minify"],
        cwd=ROOT, check=True,
    )


def phosphor_css():
    """Phosphor icon CSS with the woff2 face inlined as a data URI."""
    css = (VENDOR / "phosphor.css").read_text(encoding="utf-8")
    woff2 = base64.b64encode((VENDOR / "Phosphor.woff2").read_bytes()).decode()
    return re.sub(
        r"src:.*?;",
        'src: url("data:font/woff2;base64,%s") format("woff2");' % woff2,
        css, count=1, flags=re.S,
    )


def guard(html):
    """Fail the build if anything still reaches the network.

    Two passes, because the tag scan alone misses the case that actually
    matters once an add-on exists: a URL sitting in a JavaScript string and
    handed to fetch().
    """
    allowed = set(ALLOWED_HOSTS)
    if SYNC_HOST:
        allowed.add(SYNC_HOST)

    offenders = []

    # 1. loaded by a tag
    for m in re.finditer(r'<(?:script|link|img)[^>]*(?:src|href)="(https?://[^"]+)"', html):
        if m.group(1).split("/")[2] not in allowed:
            offenders.append(m.group(1))

    # 2. a URL in CALL POSITION -- handed to something that performs a
    #    request. This is the pass that matters once add-ons exist: a tag scan
    #    never sees fetch("https://...").
    #
    #    It is deliberately narrow, because a binder stores URLs as DATA: the
    #    Homeschool demo content has khanadacemy.org in a url field, and the
    #    footer of every app links to the shop. Those are not network calls and
    #    must not fail a build. Comments are stripped first.
    code = re.sub(r"/\*.*?\*/", "", html, flags=re.S)
    code = re.sub(r"(?m)^\s*//.*$", "", code)

    callers = (r"fetch|importScripts|navigator\.sendBeacon|"
               r"new\s+(?:WebSocket|EventSource|Worker|SharedWorker)")
    for m in re.finditer(r"(?:%s)\s*\(\s*[\'\"`](https?://[^\'\"`\s]+)" % callers, code):
        if m.group(1).split("/")[2] not in allowed:
            offenders.append(m.group(1))

    # assigned to something that loads it
    for m in re.finditer(r"\.(?:src|href)\s*=\s*[\'\"`](https?://[^\'\"`\s]+)", code):
        if m.group(1).split("/")[2] not in allowed:
            offenders.append(m.group(1))

    # 3. a CDN host anywhere at all, in any position. A CDN never belongs in
    #    one of these files even as a string, and this is what catches a
    #    vendored library creeping back in through an indirection the passes
    #    above cannot follow (const U = "..."; fetch(U)).
    for m in re.finditer(r"[\'\"`](https?://([^\'\"`\s/]+))", code):
        host = m.group(2)
        if host in allowed:
            continue
        if host.startswith("cdn.") or any(
            k in host for k in ("unpkg.com", "jsdelivr.net", "cdnjs.", "cdn.jsdelivr")
        ):
            offenders.append(m.group(1))

    if offenders:
        raise SystemExit("build refused -- these would be fetched at runtime:\n  "
                         + "\n  ".join(sorted(set(offenders))))


def main():
    if "--css" in sys.argv:
        build_tailwind()

    html = SRC.read_text(encoding="utf-8")

    replacements = {
        "<!--INJECT:TAILWIND-->": "<style>\n%s\n</style>"
            % (VENDOR / "tailwind.css").read_text(encoding="utf-8"),
        "<!--INJECT:PHOSPHOR-->": "<style>\n%s\n</style>" % phosphor_css(),
        "<!--INJECT:CHART-->": "<script>\n%s\n</script>"
            % (VENDOR / "chart.umd.js").read_text(encoding="utf-8"),
    }
    for marker, payload in replacements.items():
        if marker not in html:
            raise SystemExit("build error: %s missing from src/app.html" % marker)
        html = html.replace(marker, payload)

    guard(html)

    DIST.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print("built %s (%.1f KB)" % (OUT, len(html.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
