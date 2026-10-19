# Handoff — binder-app skill work

Written 2026-10-18. Everything described here is **pushed**; nothing of value
lives only in the old session's container.

## Where things are

| | |
|---|---|
| Repo | `Daromele/Data-Generator` |
| Branch | `claude/webapp-loading-yj4erg` |
| PR | #2 (draft) — https://github.com/Daromele/Data-Generator/pull/2 |
| Head | `4a2d84f` |
| The work | `.claude/skills/binder-app/` — 33 files |

The skill is also installed on the account as `anthropic-skills:binder-app`,
so a new session can invoke it by name. **The repo copy is the source of
truth**; the installed copy is a snapshot. After changing the skill, re-run
`sh .claude/skills/binder-app/scripts/package_skill.sh` and re-upload, or the
two drift apart.

## What this is

Two Etsy shops, both selling single-file offline HTML apps:

- **DBD / Designs by Darowan** (this user) — "binder" apps: Homeschool Hub,
  Home Management Binder, Ultimate Mom Binder, Emergency Vault, Personal
  Finance Planner. A *vault*: store data, extract polished printed PDFs.
- **JPS Digital Pages** — the `sellable-html-app` skill, a different user and
  a different product shape: an *active* app used daily.

They share an owner's attention and now share practices. The user is explicit
that convergence is fine: *"i dont mind if jps and binder get similar as we
make tweaks because there is a difference in their ultimate function."*

## How this skill came to exist

A container was reclaimed and **~60 unpushed commits across six app projects
were lost**. Only two built HTML files survived, as uploads. The skill is the
engine recovered from them and written down so it cannot be lost again.

Two of the user's standing instructions contributed: "don't worry about
pushing to github in this session" and "stop checking, trying or reporting"
GitHub. Both were about a connection problem, not about the separate risk that
unpushed work dies with the machine. **Pushing works now and should continue
after every meaningful chunk.**

## The skill, file by file

```
SKILL.md                  8 standards + a 9th (sameness); audit/upgrade/spin-off workflows
references/
  architecture.md         SECTIONS as the generator, the entity, 12 field types
  design-system.md        5 fixed themes, measured type scale, exact component classes
  data-safety.md          storage, save honesty, snapshots, merge restore
  print-engine.md         the document builder — the product's reason to exist
  build-and-offline.md    vendoring, the 3-pass build guard, the verified device table
  calculations.md         test-first, month-by-month money, demo data that proves things
  pitfalls.md             ~30 real defects with remedies — READ BEFORE DEBUGGING
  feature-catalog.md      the definition of done, A–P
  packaging.md            demo, mockups, video, START_HERE, LICENSE, listing copy
  lessons.md              taste and working style — read once per product
  sync.md                 ADD-ON: sync between devices
  hosted-and-activation.md ADD-ON: hosted copy for phones behind an activation code
assets/                   10 engine modules + sync client + Cloudflare Worker
scripts/
  audit_binder.py         the 8 standards, static. Exits 1 on blockers
  check_house_style.py    the 9th: fixed themes, palette, fonts, dark pairs
  verify_binder.js        Playwright: offline, escaping, print pagination
  build.py                inlines assets; refuses a file that reaches the network
  package_skill.sh        snapshot the skill as a .skill file
exports/jps/              material to copy INTO the JPS skill (print engine + 2 patches)
```

Known-good baseline, both surviving apps:

```
audit_binder.py       0 blockers, 1 major, 0 minor   (the major is the Google Fonts fallback, accepted)
check_house_style.py  Vault 0/0/0 · Homeschool 1 major (one stray `purple` class — real, unfixed)
verify_binder.js      6 passed, 0 failed (run against the Vault)
```

## Decisions already made — do not relitigate

- **Sync shares the existing JPS worker**, `https://jps-sync.darowan-rph.workers.dev`.
  Rooms derive on-device from the `app` key, so products cannot collide. Every
  binder needs a distinct, permanent `app` key. One free tier and one outage
  surface now cover both shops.
- **`binder-sync.js` stays byte-identical to upstream.** Changing the salt
  forks the crypto and strands anyone already synced.
- **Attachments do not sync** — metadata only; a single scan can exceed the
  5 MB room.
- **Five fixed themes** (indigo, teal, emerald, rose, amber) with fixed
  accents. A product picks a default; it never gets its own palette. Enforced.
- **Device claim** (updated session 2): the *file* is for Windows and Mac
  computers; phones and tablets use the **hosted copy** at
  `dbd-apps.pages.dev/<slug>/` with the product's access code from
  START_HERE.pdf (same model as JPS). Never "app store app".
- **A PIN is a privacy screen, not encryption.** Never invite a buyer to store
  a credential.
- **The demo must not cap the printed document.** It is the reason to buy.
- Dashboard difference kept on purpose: JPS leads with a hero number (daily
  app); a binder leads with what's due and what's missing (vault).

## Done since (session 2, 2026-10-18)

- Ported from `sellable-html-app`: **sync tooling** (`add_sync.py`,
  `sync_flow.mjs`), a **novice review** (`novice_check.js` +
  `references/novice-review.md`), and the **kit pipeline** (`capture_screens.js`,
  `make_photos.js`, `make_video.js`, `make_demo.py`, `demo_check.js`,
  `make_kits.py`). See SKILL.md workflow steps 9–11 and packaging.md § The pipeline.
- Fonts now inlined; the standard is 0/0/0, no accepted major.
- **Homeschool Hub** (`apps/Homeschool_Hub_Binder.html`): fonts inlined, sync added
  (`--app homeschool-hub`, never change it), credits tile fixed (read a legacy
  field), dashes for empty tiles, escaping fixed on settings inputs and two cover
  pages, no "Primary Educator" placeholder on documents. 0/0/0 on both audits,
  verify 6/6, novice 0/0/0, sync_flow 16/16, demo_check all pass.
- Kits: `apps/homeschool-hub/kits/Homeschool_Hub_Buyer_Kit.zip` and
  `Homeschool_Hub_Listing_Kit.zip`. Config in `apps/homeschool-hub/kit.json`;
  fill its `[ADD ...]` fields and re-run `make_kits.py`.

- **Phone access + START_HERE.pdf** (the JPS model): `build_hosted.py`,
  `start_here.py`, `gate_test.mjs`, workflow `deploy-dbd-apps.yml`. Homeschool
  Hub has its code (in the user's ACCESS_CODES.txt, never in git). Production
  hosting is the JPS pipeline: Dashboard-Creator branch `claude/gifted-cannon-6hsfy4`
  (`binders/`, `BINDERS` in `hosting/build_sites.py`) -> https://jps-apps.pages.dev/homeschool-hub/.
  Free demo: https://jps-demo.pages.dev/homeschool-hub/ (jps-demos main).

- **Homeschool Hub moved to JPS Digital Pages** (user's decision, 2026-10-19): no DBD sales in 2
  months; JPS has the reviews, demo site and hosting. Brand lives in `kit.json` › `brand`
  (start_here.py, make_kits.py read it). Storage keys and the sync key are unchanged, so existing
  buyers lose nothing. Restyled to the JPS house style with `scripts/jps_skin.py` (DM Sans/Manrope, 8 JPS themes,
  paper/rail/hero); `check_house_style.py` checks a skinned binder against JPS rules. Its listing kit is
  built with the JPS pipeline in Dashboard-Creator `monthly-plan/listing/homeschool-hub/`.

## Open / next

1. **Rebuild `src/app.html` from the Emergency Vault.** Highest value. The
   skill tells you to "fork the closest shipped product" but can only hand you
   built HTML, so forking is copy-and-adapt rather than one command. JPS has
   `assets/starter.html` + `new_app.js`; this is the gap.
2. **Rebuild the six lost app projects** from the delivered files.
3. **Legacy & End of Life Planner** and **Digital Meal Planner** still need
   seven of the eight standards.
4. **Emergency Vault listing kit** — deck, guide, listing text, callouts, demo.
5. Netlify demos; fill `[ADD YOUR DEMO LINK]` / `[ADD YOUR VIDEO LINK]`.
6. Port the custom dashboard date filter (This month / Last month / custom) to
   the other binders.
7. ~~Fix Homeschool Hub's one stray `purple` class.~~ Done — and its fonts are
   now vendored inline. `apps/Homeschool_Hub_Binder.html` scores 0/0/0 on both
   audits and passes `verify_binder.js` 6/6 offline.
8. Copy `exports/jps/print-engine.md` into the JPS skill, and patch its device
   claim and restore-by-merge note.

## Working with this user

Full list in `references/lessons.md`. The short version:

- Reviews on **screenshots**. Works but looks wrong = not done.
- Expects another 25% after "almost there" — a pass over every screen.
- Fix small things you notice without asking; list them in the summary.
- Wants **concise** answers and a contrasting view only when there is one.
- Works **product by product**.
- Every listing/guide revision has been "make it shorter".

## Files that may still be in the user's downloads

Three mockup decks, three guides, listing texts, nine callout PNG/SVGs, two
demo zips, `Emergency_Vault.html`, `Personal_Finance_Planner.html`,
`Homeschool_Hub_Binder.html`. Worth asking for before rebuilding anything.

## Uploads available to the old session only

`Emergency_Vault.html`, `Homeschool_Hub_Binder.html` and
`sellable-html-app.skill` were uploads. A new session will not have them —
**re-upload the two HTML files** if the next task needs the engine source.

## Home Management Binder (third JPS binder)

Converted like Emergency Vault (`apps/Home_Management_Binder.html`, prefix `hb`,
theme `sage`, sync key `home-management`). Fixed: US wording (floors, color,
jewelry, license plate), old cover title, zero tiles, one-page contacts sheet.
Engine fixes found on the way, applied to all three binders and the skill:
- sync compared documents by JSON text, so key order alone re-sent the vault
  (`same()` now compares canonically)
- `jps_skin.py` wrapped unquoted font names in double quotes, which broke
  `style="..."` attributes in printed documents
- `capture_screens.js` now dismisses the welcome for any prefix
