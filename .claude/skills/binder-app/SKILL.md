---
name: binder-app
description: Build, upgrade, audit or spin off the Designs by Darowan family of offline single-file HTML "binder" apps — planners, trackers, record keepers and dashboards sold as Etsy digital downloads, where the buyer fills the app in over months and prints a professional document. Use whenever the user mentions building or fixing an HTML planner/tracker/binder/vault/dashboard product, porting one to a new niche, making an app work offline, adding backup/restore, sync between devices, or print/PDF output, or getting such an app ready to sell — even phrased loosely as "fix my app", "make a tracker for X", "why does my printout look wrong", or "same as the homeschool one but for Y".
---

# Binder apps

A binder app is **one self-contained HTML file**. The buyer downloads it, opens
it in a browser, fills it in over months, and prints a professional document.
No account, no subscription, no network. The records live on their device and
nowhere else.

That last fact drives every decision below. There is no server to restore from
and no support team to call, so the app has to be *trustworthy* in a way an
ordinary web app never has to be. Most of this skill is about that.

## The family

Five shipped products share one engine: Homeschool Hub, Home Management Binder,
Ultimate Mom Binder, Emergency Vault, Personal Finance Planner. Measured across
two of them, **180 of ~223 class methods are identical**. The engine is generic;
only the configuration, the demo data and two or three printed documents change.

**So the default way to make a new binder is to fork a shipped one, not to write
one.** Writing from scratch is for the case where no shipped product is close.

## Pick the workflow

| Situation | Go to |
|---|---|
| Existing app, is it good enough to sell? | **Audit** |
| Existing app, bring it up to standard | **Upgrade** |
| New niche, no app yet | **Spin off** |

---

## The Binder Standard

Eight things separate a product someone pays £15–40 for from one that generates
refunds. `scripts/audit_binder.py` checks all eight statically; the three marked
(runtime) also need `scripts/verify_binder.js`.

1. **Genuinely offline** — every asset inlined, verified with the network cut (runtime)
2. **Output escaped** — `Smith & Sons <Reception>` survives intact (runtime)
3. **Durable storage** — records in IndexedDB, not localStorage's 5 MB ceiling
4. **Honest about saves** — a failed write says so, in a dialog, with a backup offer
5. **Recoverable** — rolling snapshots, validated imports, auto-backup to a file
6. **Merge-aware restore** — two backups combine; exact duplicates are detected
7. **Settings in the backup** — a restore rebuilds the setup, not just the data
8. **A real print engine** — builds a document with a cover page and a picker,
   never just re-styles the screen (runtime)

A shipped binder scores **0 blockers, 1 major, 0 minor**. The one major is the
Google Fonts fallback, which is accepted across the range: the app works offline
regardless, only the typeface changes.

### Add-ons are not part of the standard

**Sync between devices** is the one add-on built for this family. It is off by
default, added only when the user asks for it on a specific product, and the
app stays fully usable without it. The listing keeps saying the data lives on
the buyer's computer; sync adds "optional, encrypted with a private code".

A binder is a vault — filled in rarely, in bursts, and relied on later — so
sync is judged on whether a month-old burst survives a merge, not on latency.
Three things decide whether it is safe: attachments sync as metadata only (one
scan can exceed the 5 MB room), the PIN hash and snapshots never leave the
device, and sync never re-ids a record. `references/sync.md`.

The build guard and the audit both know about this: an undeclared network host
fails the build whether it is a CDN or a sync server, and a sync-enabled app
that leaks its PIN hash is a blocker.

---

## Workflow: auditing

```bash
python3 scripts/audit_binder.py path/to/App.html
NODE_PATH=$(npm root -g) node scripts/verify_binder.js path/to/App.html --shots /tmp/shots
```

The static audit finds most defects in seconds. The verifier catches the three
that only appear when the file runs: whether it renders with no network, whether
user text survives a round trip, and whether the printed document paginates.

**Show the evidence, don't describe it.** A screenshot of the app rendering
unstyled with the network cut persuades; a line saying "it loads a CDN" does
not. Then read `references/pitfalls.md` before proposing fixes — most findings
map to a known failure with a known remedy.

If the file does not start with `<!DOCTYPE html>` — for instance it is JSX saved
with an `.html` extension — stop there. It cannot open in a browser at all.

---

## Workflow: upgrading

Fix in this order. It is ordered by what loses buyers fastest, and each step
ships independently.

1. **Offline** — vendor and inline every asset, add the build guard.
   `references/build-and-offline.md`, `scripts/build.py`
2. **Escaping** — add `escapeHtml()` and route every user value through it.
   `assets/escaping-and-helpers.js`
3. **Storage and save honesty** — IndexedDB record store, quota handling, the
   failure dialog. `assets/storage-and-recordstore.js`, `assets/save-honesty.js`
4. **Safety net** — snapshots, import validation, auto-backup to a file.
   `assets/merge-restore.js`, `assets/auto-backup.js`
5. **Print engine** — the document builder, cover page, picker.
   `references/print-engine.md`, `assets/print-engine.js`, `assets/print-stylesheet.css`
6. **Restore quality** — merge, duplicate detection, settings in the backup.
7. **Product polish** — onboarding, demo data anchored to today, due-date
   filters, column picker. `assets/due-dates.js`, `references/product-and-listing.md`
8. **Add-ons, if asked** — sync between devices. Last, and never by default.
   `references/sync.md`

Re-run the audit after each step. Zero blockers is the point at which an app is
safe to sell.

**When the app is an older, hand-written one**, weigh retrofitting eight
subsystems against porting its domain content onto the shipped engine. On the
Emergency Vault the port took less time than the retrofit would have and
arrived at 0 blockers immediately, because the engine was already correct.

---

## Workflow: spinning off a new niche

**Before any code, answer one question: what does the buyer have to show
someone else?**

A transcript for admissions. A net worth statement for a lender. A compliance
summary for a state. A sitter sheet for whoever has the children. That artifact
*is* the product and the reason it prices above a template. If there is no such
artifact, say so — the ceiling is low and a PDF may serve better.

Then:

1. **Fork the closest shipped product.** Choose by *entity*, not by subject —
   the entity is the record everything else hangs off:

   | Entity | Fork | Examples |
   |---|---|---|
   | People | Mom Binder / Emergency Vault | family, patients, clients, pets |
   | Places | Home Management Binder | properties, rooms, sites, vehicles |
   | Accounts | Finance Planner | money, subscriptions, assets |
   | Students | Homeschool Hub | anything with years and grading |

2. **Rebrand**, in this order — a missed rename is the usual cause of two
   binders fighting over the same settings:
   - `STORAGE_KEY`, `SETTINGS_PREFIX`, `SNAPSHOT_KEYS`
   - every `'<prefix><Something>'` settings key (`'mbDarkMode'` → `'fpDarkMode'`)
   - the record-id prefix (`'mb'` → `'fp'`)
   - `<title>`, sidebar name and subtitle, `APP_VERSION` back to `1.0.0`
   - the output filename in `build.py`

3. **Write `SECTIONS`.** This is the hour that generates most of the app.
   `references/architecture.md`, `assets/config-example.js`

4. **Build the calculations**, if any. Get these right — a plausible but wrong
   number is the defect most likely to reach a buyer unnoticed.
   `references/calculations.md`

5. **Build the proof documents** — the artifact from step zero.

6. **Demo data anchored to today**, so the app looks alive whenever it is
   opened, and so it *demonstrates* each feature. See the warning in
   `references/calculations.md` about demo data that accidentally proves nothing.

7. **Rewire what the fork left behind**: `NAV_GROUPS`, `ONBOARDING_SLIDES`,
   default hidden modules, the dashboard KPI tiles and charts, the dated-items
   list, the document shortcut map, and the print modal's document flags.
   Grep for the donor's module keys — a leftover `this.data.groceries` in a
   finance planner is silent, not loud.

8. **Audit and verify** before calling it done.

Expect roughly **12% of the code to be domain-specific**. Writing much more
means something generic is being rebuilt.

---

## Domain research is the real cost

The code transfers; the domain knowledge does not. For anything with rules —
compliance hours, tax categories, interest, grading scales — the numbers must be
right, and being wrong produces refunds and one-star reviews.

Two protections, both non-negotiable:

- **Let the buyer enter their own requirements** rather than hard-coding rules
  that vary by state, country or year.
- **State plainly, in the app and the listing,** that it tracks the numbers they
  enter and does not give legal, tax, medical or financial advice.

Avoid clinical record keeping. A browser is not an appropriate place for it, and
the Emergency Vault's medical module stays deliberately at the level of
"allergies a paramedic should know", not treatment history.

**Never invite a buyer to store a credential.** The Digital Estate module asks
*where the password is kept*, never the password. Account modules ask for the
last four digits. Printed documents repeat the point in their footer.

---

## Working method

**Verify, don't assume.** Every claim about behaviour should be something you
observed. Load the page with the network cut. Render the print document to PDF
and count the pages. Type punctuation into a name field. This skill exists
because a reference app passed code review with defects that only appeared when
somebody actually ran it.

**Write after each edit.** A patch script that validates ten changes and writes
once loses all ten when the seventh assertion fails. Persist after each
replacement.

**Prove a regression test can fail.** A test that passes against the broken
version measures nothing. Confirm it fails before the fix, then passes after.
This is not theoretical: the payoff-maths fixture in the finance planner
originally sorted both methods into the same order, so it compared nothing while
appearing to pass.

**Never edit `dist/`.** Work in `src/` and rebuild, or the next build silently
discards the work.

**Push your work.** These apps are built in containers that get reclaimed.
Committing is not enough; unpushed commits die with the machine. If pushing is
blocked, say so early and loudly rather than accumulating work that cannot
survive — and send the built files to the user as you go.

---

## Reference files

Read when the workflow points at them, not before:

| File | When |
|---|---|
| `references/architecture.md` | Writing SECTIONS, adding a module or field type |
| `references/data-safety.md` | Storage, backup, restore, merge, snapshots, save failures |
| `references/print-engine.md` | Anything about printing, PDFs or document output |
| `references/build-and-offline.md` | Setting up the build, vendoring, offline problems |
| `references/calculations.md` | Any computed number the buyer will rely on |
| `references/sync.md` | **Add-on, only when asked** — sync between devices |
| `references/pitfalls.md` | **Before fixing a bug** — check whether it is a known one |
| `references/product-and-listing.md` | Onboarding, guides, listing copy, mockups, Etsy realities |

## Assets

Working code lifted verbatim from shipped apps. Copy it rather than
reimplementing; every file is syntax-checked.

| File | What |
|---|---|
| `assets/storage-and-recordstore.js` | Non-throwing localStorage wrapper + IndexedDB store |
| `assets/save-honesty.js` | Save, quota failure dialog, snapshots, migration |
| `assets/merge-restore.js` | Fingerprint merge, dedupe, id remapping, import validation |
| `assets/auto-backup.js` | File System Access auto-backup, reconnect, status line |
| `assets/print-engine.js` | Document builder, cover, column widths, orientation |
| `assets/print-stylesheet.css` | Print CSS with the pagination rules that matter |
| `assets/due-dates.js` | Due buckets, badges, overdue counts, recurring roll-forward |
| `assets/entity-layer.js` | The entity: filtering and per-entity document sections |
| `assets/escaping-and-helpers.js` | `escapeHtml`, `sha256`, date and money formatting |
| `assets/config-example.js` | A complete real `SECTIONS` + `NAV_GROUPS` + `THEMES` |
| `assets/sync/binder-sync.js` | Sync client: code, encryption, unit merge. Copy unchanged |
| `assets/sync/worker/` | The Cloudflare Worker that holds the encrypted blob |

## Scripts

| Script | What |
|---|---|
| `scripts/audit_binder.py` | Static audit against the eight standards. Exits 1 on blockers. |
| `scripts/verify_binder.js` | Runtime checks in a real browser. Needs Playwright. |
| `scripts/build.py` | Inlines every asset; refuses to build a file that reaches the network. |
