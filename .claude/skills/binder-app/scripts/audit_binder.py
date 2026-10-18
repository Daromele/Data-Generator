#!/usr/bin/env python3
"""Static audit of a built binder against the standard. Seconds, no browser.

    python3 audit_binder.py path/to/App.html

Exits 1 if any blocker is found. Catches most defects; the three that only
appear when the file actually runs are covered by verify_binder.js.
"""
import pathlib
import re
import sys

ALLOWED_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com")


def audit(html):
    findings = []
    def add(sev, name, what, fix):
        findings.append((sev, name, what, fix))

    # 1. offline
    remote = set()
    for m in re.finditer(r'<(?:script|link|img)[^>]*(?:src|href)="(https?://[^"]+)"', html):
        host = m.group(1).split("/")[2]
        if host not in ALLOWED_HOSTS:
            remote.add(host)
    if remote:
        add("BLOCKER", "Offline", 
            "Loads %s at runtime. With no network the app renders unstyled or "
            "half-dead -- breaking the core promise of the product." % ", ".join(sorted(remote)),
            "Vendor each asset and inline it at build time.")
    fonts = sorted({m.group(1).split("/")[2] for m in
                    re.finditer(r'(https://fonts\.(?:googleapis|gstatic)\.com[^"]*)', html)})
    if fonts:
        add("MAJOR", "Offline typography",
            "Web fonts come from %s. The app still works offline but falls back to "
            "system fonts, so a printed binder does not match the listing photos." % ", ".join(fonts),
            "Vendor the woff2 faces and inline them as data URIs.")

    # 2. escaping
    inner = len(re.findall(r'\.innerHTML\s*=', html))
    # look for a DEFINITION, not just the name: a renamed-out helper
    # (escapeHtml_DISABLED) would satisfy a plain substring test.
    defined = re.search(r'(?:const|let|var|function)\s+escapeHtml\s*[=(]', html)
    used = len(re.findall(r'escapeHtml\s*\(', html))
    if inner and (not defined or used < 3):
        add("BLOCKER", "Output escaping",
            "%d innerHTML assignments and no working escaping helper. A name like "
            "'Smith & Sons <Reception>' is silently mangled." % inner,
            "Add escapeHtml() and route every user value through it.")

    # 3. durable storage
    if "indexedDB" not in html and "localStorage" in html:
        add("MAJOR", "Durable storage",
            "Records live in localStorage only, which every browser caps near 5 MB.",
            "Move records to IndexedDB with a localStorage fallback.")

    # 4. save honesty
    if not re.search(r'QuotaExceeded|isQuotaError', html):
        add("MAJOR", "Save-failure honesty",
            "No quota handling. A full store fails silently while the UI says saved.",
            "Detect quota errors and tell the owner, with a backup offer.")

    # 5. snapshots
    if not re.search(r'[Ss]napshot', html):
        add("MAJOR", "Undo safety net",
            "No rolling snapshots. A bad import or accidental wipe is unrecoverable.",
            "Keep three generations before every destructive action.")

    # 6. import validation
    if "JSON.parse" in html and not re.search(r'validateImport|looksLikeBackup', html):
        add("MAJOR", "Import validation",
            "Import accepts any JSON. The wrong file silently overwrites real records.",
            "Validate shape before replacing anything, and snapshot first.")

    # 7. print engine
    if "window.print" in html and "getPrintHTML" not in html:
        add("MAJOR", "Print engine",
            "Prints by re-styling the screen rather than building a document.",
            "Build a separate document with a cover page and a picker.")
    if re.search(r'@page[^}]*\bsize\s*:', html):
        add("MAJOR", "Print orientation locked",
            "@page declares size:, which pins Chrome's Layout control so the "
            "buyer cannot choose landscape for a wide table.",
            "Drop `size:` and pick one orientation per document in code.")
    if "@page :first" in html and "coverHtml" not in html:
        add("MAJOR", "Print margins",
            "@page :first { margin: 0 } is emitted unconditionally, so a "
            "cover-less document prints its first page edge to edge.",
            "Emit that rule only when the document has a cover page.")

    # 8. restore quality
    if not re.search(r'mergeRecords|recordFingerprint', html):
        add("minor", "Merge-aware restore",
            "Restore can only replace. Two backups cannot be combined.",
            "Add content-fingerprint merge.")
    if not re.search(r'settingsPayload|applySettings', html):
        add("minor", "Settings in backup",
            "Backups carry records but not the setup, so a restore rebuilds half the binder.",
            "Include a settings block; exclude PIN hashes.")
    if not re.search(r'showSaveFilePicker', html):
        add("minor", "Automatic backup",
            "No linked backup file, so the owner must remember to download by hand.",
            "Offer File System Access API auto-backup where supported.")
    return findings


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    path = pathlib.Path(sys.argv[1])
    html = path.read_text(encoding="utf-8", errors="replace")
    if not html.lstrip().lower().startswith("<!doctype html"):
        print("%s does not start with <!DOCTYPE html>. If this is JSX saved with an "
              ".html extension it cannot open in a browser at all; fix that first." % path.name)
        return 1

    findings = audit(html)
    order = {"BLOCKER": 0, "MAJOR": 1, "minor": 2}
    findings.sort(key=lambda f: order[f[0]])
    counts = {k: sum(1 for f in findings if f[0] == k) for k in order}

    print("\n" + "=" * 70)
    print("%s  (%.1f KB)" % (path.name, len(html.encode()) / 1024))
    print("%d blockers, %d major, %d minor"
          % (counts["BLOCKER"], counts["MAJOR"], counts["minor"]))
    print("=" * 70 + "\n")
    for sev, name, what, fix in findings:
        print("[%-8s] %s" % (sev, name))
        print("    %s" % what)
        print("    Fix: %s\n" % fix)
    return 1 if counts["BLOCKER"] else 0


if __name__ == "__main__":
    sys.exit(main())
