# Build and offline

The product is one file that works with the network cut. Not "mostly works" —
a buyer on a plane, in a hospital basement, or two years from now when a CDN
has moved on must get the same app.

## Source layout

```
src/
  app.html          the whole app, with INJECT markers
  vendor/
    tailwind.css    precompiled, not the CDN script
    phosphor.css    @font-face with base64 woff2
    chart.min.js
scripts/build.py
dist/
  Product_Name.html
```

**Never edit `dist/`.** The next build discards it. Every "my fix disappeared"
is this.

## Build

`scripts/build.py` replaces `<!--INJECT:TAILWIND-->`, `<!--INJECT:PHOSPHOR-->`
and `<!--INJECT:CHART-->` with the vendor contents and writes `dist/`.

Then it runs `guard()`, which scans the output for any `src=`/`href=` pointing
at a host outside `ALLOWED_HOSTS` and **raises `SystemExit`** if it finds one.
A build that would reach the network does not produce a file. This is the only
mechanism that reliably prevents an offline regression; a checklist does not.

`ALLOWED_HOSTS` is just Google Fonts. The `<link>` stays as a progressive
enhancement — online, the intended typeface; offline, the system stack. That is
the "1 major" every shipped binder scores, and it is accepted across the range.
If you want 0 major, base64 the woff2 and delete the link.

## Vendoring

**Tailwind**: compile the classes actually used. Do not ship `cdn.tailwindcss.com`
— it is a runtime compiler, needs the network, and is explicitly not for
production.

**Phosphor**: the font, base64'd inside `@font-face`. Verify every icon name you
use actually exists — a wrong name renders a blank box, silently. `ph-room` and
`ph-plus-bold` do not exist; they shipped as empty squares. Check against the
font's own glyph list, not from memory.

**Chart.js**: inline the minified build. It is large; it is also why the
dashboard looks like a product.

**Images**: base64 data URIs, no exceptions. One `<img src="https://...">` makes
the whole file online-only.

Attachments the buyer adds are downscaled on import —
`SAMPLE_MAX_EDGE = 1600`, `SAMPLE_MAX_BYTES = 4 * 1024 * 1024` — because a
phone photo of a passport is 8 MB and a binder full of them will not export.

## What `file://` cannot do

A file opened from disk is not a secure origin, so:

- **no service worker, so it can never be a PWA.** No install prompt, no
  "add to home screen" as an app. Do not claim it; this comes up every time
  someone compares the product to a web app.
- `fetch()` of neighbouring files is blocked by CORS — hence one file
- the File System Access API still works in Chrome/Edge desktop, which is what
  auto-backup relies on

## Device reality

Verified, and the only claims to make:

| Platform | Opens an .html download |
|---|---|
| Desktop Chrome / Edge / Firefox / Safari | yes |
| Android Chrome | usually, via a file manager |
| **iPhone / iPad Safari** | **no** — downloaded HTML does not open; needs Files → a third-party browser such as Edge, or a desktop |

So the honest listing line is **"Works on Windows and Mac computers. Not
designed for phones or tablets."** Saying "works on phones and tablets" is
false and generates refunds. This correction has had to be made across a whole
listing kit once already.

## Verifying offline

```bash
python3 ../scripts/audit_binder.py dist/Product.html
NODE_PATH=$(npm root -g) node ../scripts/verify_binder.js dist/Product.html --shots /tmp/shots
```

The verifier loads the file with **every request blocked** and checks that it
renders, styles and throws no errors. Screenshot it. A screenshot of a working
offline app is the proof; a sentence is not.

## Size

Shipped binders are 1.5–3 MB. Tailwind and Chart.js dominate. That is fine for
a download and the correct trade against any runtime fetch.
