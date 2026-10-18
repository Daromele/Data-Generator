# Product and listing

The app is half the product. The other half is the buyer's first ten minutes
and what the Etsy page promises. Both have cost real money to get wrong.

## Onboarding

`ONBOARDING_SLIDES` — four or five, shown once, skippable, re-openable from
Settings. Cover: what the app is for, that the data stays on their computer,
how to back up, and the one artifact it prints. Not a feature tour.

Then **demo data**, loaded by default with a one-click **Clear demo data**
button. An empty app looks broken; a populated one sells itself. See the demo
data rules in `calculations.md` — anchored to today, and every feature visibly
exercised.

## The quick start guide

A separate HTML file, also offline, also printable. **Not text-heavy** — this
is the most consistent piece of feedback: short phrases, icons, numbered steps,
screenshots where they help. Cover opening the file, where data lives, backing
up, and printing the artifact. One screen per task.

## Listing copy

Structure that works:

- **WHAT YOU GET** — one line. The HTML planner, the how-to guide, the
  walkthrough video. This is the delivery, not the feature list.
- **TABS INCLUDED** — a plain list of tab names. No descriptions under each.
- **HIGHLIGHTED FEATURES** — the things a spreadsheet or a PDF cannot do:
  multiple entities, multiple years, generated PDF reports, filtering, search.
- **PERFECT FOR** — one sentence.
- **BEFORE BUYING** — short phrases, not paragraphs: Windows/Mac computers;
  not for phones or tablets; digital download, no physical item; no refunds on
  digital goods.
- Demo link and walkthrough video link.

Title: 140 characters max, front-load the search terms.

The repeated instruction across revisions has been **shorter**. Every section
that got cut improved the listing.

## Honesty in the listing

Only claims that have been verified:

- "Works on Windows and Mac computers" — **not** phones or tablets
  (iOS Safari will not open a downloaded .html)
- "Works offline" — true, and worth saying plainly
- auto-backup is Chrome and Edge on desktop; manual backup everywhere else
- a PIN is a privacy screen, not encryption
- never "PWA", "installable", "app", or "syncs across devices"

Never fabricate reviews, ratings, urgency or social proof.

Do not copy a competitor's claims. A competing listing promising multi-device
use is not a reason to promise it — it is a reason to be the listing that is
still true after the sale.

## Mockup images

Built with the `html-mockup-decks` skill — a self-contained HTML deck of
fixed-size slides that is screenshotted, never exported as images directly.
For these products it is 1500×1200.

Two constraints decide the hero slide:

- **Etsy centre-crops search thumbnails to a square.** At 1500×1200 that keeps
  the centre 1200 px. Everything that must be read in search lives inside that
  band. Verify by measuring the rendered bounding box, not by eye.
- **Mobile legibility.** Most browsing is on a phone. One line of title, one
  short subtitle, large type, icons instead of sentences.

Beyond that: centred titles and subtitles, pills in a single row, a light grey
background rather than white, drop shadows on callout circles, and callouts
exported as separate PNG/SVG files so they can be layered over a real
screenshot in Canva.

Etsy allows 20 photos per listing. Past ~15 slides, the rest go to Pinterest.

Leave screenshot slots as light placeholder text rather than awkward crops —
real screenshots get placed manually.

## The listing kit

Per product: the mockup deck, the quick start guide, the listing text, the
callout PNG/SVGs, and a Netlify demo copy. Name every file for its product
(`etsy-mockup-home-management.html`, not `etsy-mockup.html`) — a shop with five
binders accumulates identical filenames fast.

The demo copy is the same build with demo data forced on and backup prompts
suppressed. It converts: buyers want to click before they pay.

## What justifies the price

Before building anything, answer: **what does the buyer hand to someone else?**
A transcript for admissions. A net worth statement for a lender. A sitter
sheet. That artifact is the product. If there isn't one, the ceiling is low and
a PDF template may serve the buyer better — say so.
