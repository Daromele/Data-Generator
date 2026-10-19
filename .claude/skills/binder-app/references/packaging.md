# Packaging: from working app to Etsy listing

Everything a product needs besides the app itself. Build it in this order; each
step feeds the next. Per product the kit is:

```
<Product>/listing-kit/
  1_Photos/          the exported mockup slides, numbered in upload order
  2_Video/           the walkthrough
  4_Extras/          demo link, callout PNG/SVGs, source deck
  Listing_Text.txt   in the order Etsy asks for it
```

### The pipeline

Every piece below is generated from the real built app and one config file,
`apps/<product>/kit.json` (copy `apps/homeschool-hub/kit.json`):

```bash
S=.claude/skills/binder-app/scripts; K=apps/<product>/kit.json; A=apps/<Product>.html
NODE_PATH=$(npm root -g) node $S/capture_screens.js $A shots          # every screen, themes, doc pages + PDFs
NODE_PATH=$(npm root -g) node $S/make_photos.js $K $A shots photos    # 1500x1200 JPGs, hero checked for the square crop
NODE_PATH=$(npm root -g) node $S/make_video.js  $K $A shots video.mp4 # 3 steps, ~22 s, H.264
python3 $S/make_demo.py $A $K demo.html                               # nothing saves, exports upsell, print watermarked
NODE_PATH=$(npm root -g) node $S/demo_check.js demo.html              # proves the demo is safe to publish
python3 $S/build_hosted.py .                                          # phone copy + access code (first time)
python3 $S/make_kits.py $K $A shots photos video.mp4 demo.html kits --codes hosting/ACCESS_CODES.txt
```

`make_kits.py` writes `<Product>_Buyer_Kit.zip` (the app, START_HERE,
LICENSE, the quick-start guide) and `<Product>_Listing_Kit.zip` (the folder
below). It refuses a title over 140 characters, a tag over 20, anything but 13
tags, phone/PWA claims, and a sync claim for an app without sync; it lists
every `[ADD ...]` placeholder still open. The listing text opens with the
title and tags, then the description to paste, then the rest in Etsy's order
— the seller copies the whole listing from one file.

Run `novice_check.js` and look at the screenshots **before** this: the photos
show whatever the app shows.

The buyer zip (app, START_HERE.pdf, guide, LICENSE) ships **separately**, never
inside the listing packet — the user's rule, so it is never uploaded twice.

Name every file for its product — `etsy-mockup-home-management.html`, not
`etsy-mockup.html`. A shop with six binders accumulates identical filenames
within a week.

## 1. Demo data

Synthetic, realistic, anchored to today (offsets, never literal dates), and
exercising every feature *visibly*. See `calculations.md` for why a demo that
shows a £0 saving or a flat chart reads as broken even when it works.

Three entities minimum — one person, one place, one account, whatever the
product's entity is. One entity makes the picker look pointless, and the
picker is the product's main idea.

Include awkward values on purpose: an apostrophe and an ampersand in a name, a
long note, an empty optional field, a zero. They are the screenshots that
prove escaping works.

## 2. The free demo

A copy of the built app with demo data forced on, backup prompts suppressed,
and a bar at the top: *Free demo · nothing is saved* · *Get the full version*.
Hosted on Netlify. Buyers click before they pay, and the demo link belongs in
the listing's first three lines.

Generate it from the real built file with a patch script that asserts its
anchors — never hand-edit a copy, because the copy then drifts from the
product and the demo starts showing features the buyer will not get.

Nothing saves: stub the storage layer so a refresh starts fresh. Lock the
exports (backup, CSV, print) to an upsell rather than hiding them, so the
visitor sees what they are buying.

What a binder demo must *not* do is cap the thing it is selling. The print
document is the product; let them print it, watermarked. A buyer who sees the
transcript is a buyer.

## 3. Mockup images

Built with the `html-mockup-decks` skill, as a self-contained HTML deck of
fixed-size slides that gets screenshotted. **1500×1200** for this family.

Two constraints decide the hero slide:

- **Etsy centre-crops search thumbnails to a square** — at 1500×1200 that is
  the centre 1200 px. Everything that must be read in search lives inside that
  band. Verify by measuring the rendered bounding box, not by eye.
- **Mobile legibility.** Most browsing is on a phone: one line of title, one
  short subtitle, large type, icons instead of sentences.

House rules for the deck, all of them from corrections already made once:

- centred titles and subtitles on every slide
- pills in a single row, light grey background rather than white
- drop shadows on callout circles
- callouts exported as **separate PNG/SVG files** so they can be layered over
  a real screenshot in Canva
- screenshot slots left as light placeholder text, not awkward crops
- the deck's colours come from the app's own theme — the same five

Etsy allows 20 photos. Past ~15 slides the rest go to Pinterest.

Export the slides as ready-to-upload images and zip them. The seller should
not have to screenshot anything.

## 4. The walkthrough video

Three steps over real screenshots: *add your people · fill it in over time ·
print the document*. Self-contained HTML animation with a `seek(t)` function
so frames render exactly, captured with Playwright at 30 fps and encoded with
ffmpeg (`libx264`, `yuv420p`, `-crf 18 -movflags +faststart`). Export one
still for the deck.

## 5. Buyer files

Both ship in the download zip, as plain `.txt` — a buyer who cannot open the
app must still be able to read them.

**`START_HERE.pdf`** — this replaced the .txt. One Letter page from
`scripts/start_here.py`: header, three step cards, the phone card with the
hosted link and the **access code** in a dashed box beside a routine card, a
"keep your records safe" table, the help row. It must fit one page (checked).
The text below is the old .txt source, kept for wording only.

```
<PRODUCT NAME>
Thank you for your purchase.

OPENING IT
  Double-click the .html file. It opens in your web browser.
  Works on Windows and Mac computers, in Chrome, Edge, Firefox or Safari.
  Not designed for phones or tablets.
  Bookmark the tab so you can find it again.

WHERE YOUR DATA LIVES
  On this computer, in this browser. Nothing is uploaded. We never see it.
  That also means: if you clear your browser data, it is gone.

BACK UP -- PLEASE READ
  Click "Back up" and keep the file somewhere safe. Do it today.
  In Chrome and Edge on a computer you can link a backup file once and it
  saves itself from then on. Other browsers: use the Back up button.

GETTING A NEW VERSION
  Download the new file, open it, and restore your backup into it.
  Your records are not stored inside the app file, so replacing the file
  never loses them -- as long as you have a backup.

PRINTING
  Click "Print" and choose what to include. Save as PDF or print on paper.

HELP
  <support email>  ·  <shop link>
```

**`LICENSE.txt`** — personal or own-household use by the purchaser; no resale,
sharing or redistribution; the file may not be listed anywhere; not legal,
tax, medical or financial advice; no warranty. Keep it to a page.

**The buyer guide** — a separate offline HTML file, also printable. **Not
text-heavy**: short phrases, icons, numbered steps, one screen per task. This
is the most repeated piece of feedback on this product line. Cover opening the
file, where data lives, backing up, and printing the document.

## 6. Listing copy

Structure, in order:

- **Title** ≤ 140 characters: two search phrases then the product type.
- **Line one**: the promise. Then *▶ Try the free demo first: <link>*.
- **WHAT YOU GET** — one line: the HTML planner, the how-to guide, the
  walkthrough video. This is the delivery, not the features.
- **TABS INCLUDED** — a plain list of tab names, no descriptions under each.
- **HIGHLIGHTED FEATURES** — only what a spreadsheet or a static PDF cannot
  do: multiple entities, multiple years, generated PDF documents, filtering,
  search, optional encrypted sync.
- **PERFECT FOR** — one sentence.
- **BEFORE BUYING** — short phrases: Windows and Mac computers; not for phones
  or tablets; digital download, no physical item; no refunds on digital goods.
- The demo link and the video link.

13 tags, each ≤ 20 characters. Plain text with real • bullets — Etsy strips
markdown. American English.

Every revision of this listing has been an instruction to make it **shorter**.
Every section cut has improved it.

## 7. Honesty

Only claims that have been verified:

- "Works on Windows and Mac computers" for the **file**. iOS Safari will not
  open a downloaded `.html` file. Phones and tablets are true **only** through
  the hosted copy with its access code ("a private web link and access code
  come with your download"); `make_kits.py` refuses phone claims for a kit
  without `hosted_url`. Never "app store app".
- "Works offline" — true, and worth saying plainly.
- Auto-backup is Chrome and Edge on desktop; manual backup everywhere else.
- A PIN is a privacy screen, **not** encryption.
- Never "PWA", "installable" or "syncs across devices" unless the sync add-on
  is actually in that product — and then say "optional, encrypted with a
  private code", and that scans stay on each device.
- Never fabricate reviews, ratings, urgency or social proof.

Do not copy a competitor's claims. A listing promising multi-device use is not
a reason to promise it; it is a reason to be the listing that is still true
after the sale.

## 8. What justifies the price

Before building anything: **what does the buyer hand to someone else?** A
transcript for admissions. A net worth statement for a lender. A sitter sheet.
That artifact is the product. If there is not one, the ceiling is low and a PDF
template may serve the buyer better — say so.
