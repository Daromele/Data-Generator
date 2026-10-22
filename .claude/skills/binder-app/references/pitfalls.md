# Known pitfalls

Read this **before diagnosing a bug**. Nearly every defect found in this family
so far is below, with its remedy. Each one shipped at least once.

## JavaScript

**`null >= 0` is `true`.** An undated record matched every due bucket, so
"Overdue" listed everything. Remedy: `matchesDueBucket()` rejects null
explicitly before comparing. Any comparison against an optional date needs a
null branch.

**A renamed helper still satisfies a substring check.** An audit testing
`"escapeHtml" not in html` passed against a file where it had been renamed to
`escapeHtml_DISABLED`. Remedy: test for a *definition*
(`(?:const|let|var|function)\s+escapeHtml\s*[=(]`) plus a call-site count.

**Braces in parameter defaults break naive brace matching.**
`saveData(options = {})` and `writeBackupFile({ announce = false })` defeated a
body extractor that searched for the first `{`. Remedy: walk the parameter list
with paren counting first, then find the body brace.

**Apostrophes in single-quoted JS strings.** `'Couldn\\'t'` truncated a whole
script block silently. Remedy: double-quoted strings for copy, and
`node --check` every emitted script.

## CSS and print

**`@page :first { margin: 0 }` emitted unconditionally** printed cover-less
documents edge to edge. Remedy: emit it only when `coverHtml` exists.

**A named `@page wide`** for landscape forced a break at every orientation
switch: 8 pages became 18. Remedy: one orientation per document; decide with
`needsLandscape()` for the whole thing.

**Omitting `size:` from `@page`** leaves Chrome's Layout control free and the
document reflows. Remedy: always name the size; it pins the control.

**Inline styles beat `auto` margins.** `style="margin-top:26px"` overrode
`.note{margin-top:auto}`, so footnotes stopped pinning to the page bottom. This
recurred several times across decks and guides. Remedy: when something refuses
to sit where the class says, grep for an inline style on that element first.

**`object-fit:cover` on a wrong-orientation box** crops a landscape page into a
sliver. Remedy: size containers to the real aspect ratio; default to `contain`.

**Paired card+label grids drift** if built as two separate grids. Remedy: one
flex-column item per pair, then grid the items.

**Grid item counts that don't divide by the column count** leave an orphan cell
that looks broken. 6 items → 3×2 or 6×1.

## Icons and assets

**Phosphor icon names that don't exist render as blank boxes, silently.**
`ph-room` and `ph-plus-bold` both shipped as empty squares. Remedy: check every
name against the font's glyph list.

**`cdn.tailwindcss.com`** is a runtime compiler and needs the network. Remedy:
precompile; the build guard refuses the file otherwise.

## Storage

**localStorage throws in private mode.** An unwrapped call killed startup for
anyone in a private window. Remedy: the non-throwing `storage` wrapper with an
in-memory mirror.

**localStorage's 5 MB ceiling** is reached within weeks once attachments
appear. Remedy: records in IndexedDB.

**Quota failures that only log to the console** lose hours of work silently.
Remedy: `onStoreFailure()` opens a modal with a backup offer.

**Replace-on-import destroys the other device's half.** Remedy: merge by
fingerprint, and `remapReferences()` so entity pointers follow the new ids —
without it a merge quietly reassigns records to the wrong person.

**A backup without settings** restores the data and loses the setup. Remedy:
`settingsPayload()`, minus the PIN hash, backup bookkeeping and snapshots.

## Testing

**A fixture that compares a list with itself** passes forever and measures
nothing (the snowball/avalanche sort). Remedy: run every new test against the
unfixed code and confirm it fails.

**A hand-guessed expected value** wastes a debugging session when it is the
expectation that is wrong, not the code ($54.99 vs the correct $58.98). Remedy:
compute expectations by an independent method.

**Validating ten edits and writing once** loses all ten when the seventh
assertion fails. Remedy: persist after each replacement.

## Sync (only in apps that have it)

**Forgetting `units.track` in `syncIn()`** makes two devices undo each other's
validation tidying forever — the screen re-renders every 1.5 s. Remedy: after
validation, track the difference so the tidy-up counts as this device's change.

**Re-iding a record during a sync merge** makes it appear twice permanently and
breaks every entity pointer at it. `freshId()` and `remapReferences()` belong to
the file-import path only; sync merges by id.

**Syncing attachments** blows the 5 MB room with a single scan. Remedy: sync
metadata, keep files per device, and say so in the UI, the guide and the listing.

**Syncing the PIN hash** puts one person's lock screen on their spouse's laptop.
Remedy: build the skip list from `SETTINGS_EXCLUDE`, and assert the payload's
contents in a test — the audit treats a leak here as a blocker.

**A `SCHEMA_VERSION` bump with two devices linked** lets the stale device push an
old document over a new one. Remedy: refuse an incoming payload below the local
version and tell the buyer to update the other device.

**`BinderSync` is undefined.** The client file is byte-identical to the JPS one
and exports `window.JPSSync`. `add_sync.py` adds `window.BinderSync =
window.JPSSync` after it; hand wiring must do the same.

**A sync test that only checks the other device misses a leak.** The merge's
skip list keeps the PIN off the second device even when it is *sent*. Assert on
`syncOut()` itself — `sync_flow.mjs` does, and fails on a deliberately leaky
build.

## Novice findings (Homeschool Hub, first review)

**A KPI reading a legacy field.** "Credits Earned" summed `grades.credits`, a
field modern files leave at 0, so it read 0.00 beside a transcript full of
credits. Remedy: compute a tile from the same records and rule as the document
it mirrors, and say so under the number ("On the transcript").

**Zeros on a brand-new planner.** "0%" average and "0.00" credits read as
failing. Remedy: a dash until there is something to count, and "Nothing
scheduled yet" instead of "Out of 0 scheduled".

**A placeholder printed on an official document.** With no educator name the
transcript printed "Educator(s): Primary Educator". Remedy: omit the line.

**Unescaped values outside tables.** Settings inputs (`value="${name}"`) and two
cover pages (`Educator(s): ${edName}`) skipped `escapeHtml`. The runtime
escaping check types into record fields only; grep templates for
`${this.profile` and `${edName` too.

## Fork leftovers (Emergency Vault, second JPS conversion)

A binder forked from another keeps the donor's words and links long after its
own sections are written. Found in the Vault, all invisible to the audits:
"All Rooms" on every filter (Home binder), a Print & Share blurb and a What's
New list about sitters, meals and immunisations (Mom binder), "Tell at least
one room", a cover titled "Family Binder", "Rooms:" on covers, and two dashboard
tiles opening sections that do not exist (`chores`, `events`). `novice_check.js`
now fails on dead navigateTo/openModal targets; still read every screenshot and
every printed page for donor wording.

**Donor words survive two audits (Emergency Vault, third pass).** After the
conversion above, Settings › Document Export still offered Sitter Sheet,
Immunisation and Photo Record, the dashboard chart said "Chores, appointments,
school deadlines", and a demo note mentioned "Katie the sitter". Nothing read
the rendered text. `novice_check.js` now builds a donor-word list from the other
binders beside the app and fails on a hit in any state.

**A replay of the welcome offered to wipe real data.** The final slide's
"Wipe Demo Data & Start Clean" showed on every replay from Settings. Guard the
wipe and the two-button first slide with `this.firstRun`, set in `startApp()`.

**The demo opened overdue, with a backup nag on top.** `renews: at(-6)` made
the first screen a red "1 overdue" tile under "You have never backed up".
Demo due dates go in the future; the nudge checks `!this.isDemoData` and
`recordCount() >= 5`.

**A "last reviewed" date shown as overdue.** The Vault listed medical records
"200 days overdue" because it treated the date of the last review as a due
date. A past-tense field ("reviewed", "last serviced") needs a `due` that adds
the interval.

**British wording in a US listing.** The family binders were written in British
English with a British demo household (solicitor, GP surgery, stopcock, MOT, NHS
111, 999, UK phone numbers). Converting for JPS means the demo data and option
lists too, not just colour/color.

## Claims

**"Works on phones and tablets" is false.** iPhone and iPad Safari will not
open a downloaded HTML file. Remedy: "Works on Windows and Mac computers."
This had to be corrected across five files of an already-written listing kit.

**"PWA" / "installable" is impossible** from `file://` — no secure origin, no
service worker. Do not claim it.

**"Encrypted" is false** of a PIN screen. Say it stops a shoulder-surfer.

**Delivery and feature claims must match across every slide and the listing.**
Inconsistency between slide 2 and slide 8 is noticed.

## Process

**Unpushed commits die with the container.** About 60 commits across six
projects were lost when a container was reclaimed. Committing is not saving.
Remedy: push, and if pushing is blocked say so loudly and early rather than
accumulating work that cannot survive — and send the built files to the user as
they are produced.

**Editing `dist/`** is discarded by the next build. Work in `src/`.

**Retrofitting eight subsystems into an old hand-written app** can cost more
than porting its domain content onto the shipped engine. On the Emergency Vault
the port was faster and reached 0 blockers immediately.
