# Hosted copy and the activation code (add-on)

**Only when asked.** The download is the product. A hosted copy is a second
delivery of the same app, for the buyer who wants it on a phone or installed,
and it brings a problem the download does not have: a public URL anyone can
open. The activation code is the answer to that.

## Why a binder would want it

A downloaded `.html` file cannot be opened on an iPhone or iPad at all, and
cannot be installed anywhere. For most binders that is fine — they are
desktop fill-and-print tools. It stops being fine when the buyer wants to
*read* the binder away from the desk: the sitter sheet at the school gate, the
emergency contacts at the hospital, the shopping list in a shop.

So decide by use, not by capability:

| The buyer needs to | Hosted copy? |
|---|---|
| Fill it in and print it | No. Ship the file. |
| Read it out of the house | Yes |
| Share it with a partner's phone | Yes, with sync |
| Install it like an app | Yes — only a hosted copy can be a PWA |

## What the buyer gets

A URL, and a code on their receipt. First visit asks for the code; after that
the device is remembered. The app is the same build, with demo data off.

Pair it with sync (`sync.md`) and the phone becomes a read-and-add view of the
same binder. Without sync a hosted copy is a *separate, empty* binder, which
confuses people — so if the hosted copy is offered, offer sync with it.

## The activation code, honestly

**A static page cannot keep a secret.** Anyone can read the page source, so a
code checked in JavaScript is a speed bump, not a lock. Say this to the user
plainly before building it, because the alternative design costs more and they
should choose knowingly.

Two designs:

**1. Client-side gate (cheap, weak).** The page holds a list of hashed codes;
an entered code is hashed and compared; a token goes in localStorage. Stops
casual link-sharing. Does not stop anyone who views source. Fine when the
hosted copy is a convenience for people who already bought.

**2. Server-checked (the right one, and the infrastructure already exists).**
The sync Worker gains an `/activate` endpoint. The page posts the code, the
Worker checks it against its stored list and returns a signed token with an
expiry; the page refuses to render without a valid token, and re-checks on
load. The code list is a KV namespace the shop writes to after a sale.

Because codes live on the server, one can be revoked, counted, or limited to a
number of devices — none of which the client-side design can do. The same
Worker is already deployed, so this is an endpoint, not a new service.

Either way:

- **One code per order**, long, unambiguous alphabet (no `0`/`O`, `1`/`I`),
  formatted in groups of four.
- **Device limit**, with a clear message rather than a silent failure.
- **Never share a gate-less address**, not even for a quick test — a URL that
  works once is indexed and lives forever.
- The code is not a password: it unlocks the app, never the data. The data is
  still local, or synced under the separate sync code.

## Hosting

Cloudflare Pages or Netlify, deployed from CI, never by dragging a folder.
Deploy only the built site, never the source.

An installable copy (`manifest.webmanifest`, icons at 192/512/maskable plus
apple-touch, a network-first service worker with a cached fallback) is only
possible here — `file://` is not a secure origin, so the download can never be
a PWA, however the listing phrases it.

Add an install nudge: iPhone (Share › Add to Home Screen) and Android
(`beforeinstallprompt`), with *Not now* hiding it for 30 days.

## What changes in the app

- demo data off by default on the hosted build
- the activation gate before first render
- the download-and-backup copy reworded: on a phone there is no file to
  double-click, and auto-backup does not exist there
- print still works, but say that a phone prints to PDF, not to paper
- the footer says *hosted copy* so support can tell which one a buyer has

## What to tell the buyer

In the listing: *Also includes a private web link so you can read your binder
on a phone, with an activation code from your order.* Not "mobile app" — it is
not in an app store, and that word sets an expectation the product will not
meet.

## Testing

1. The page refuses to render without a code.
2. A wrong code fails with a message, not a blank screen.
3. A correct code is remembered across a reload.
4. Revoking a code locks the device out on next load (server design only).
5. The device limit is enforced and explained.
6. Installed from the home screen, it opens standalone and still works offline
   after the first load.
