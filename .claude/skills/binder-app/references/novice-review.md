# Novice review

A first-time buyer has never seen the app, does not read instructions, and
judges it in the first five minutes. Every refund this product line has had a
reason for traces to something that confused them, not something that broke.

Run it **before the listing kit**, after the audits pass. Fix what it finds,
then add each new finding as a general rule here and, where it can be
automated, as a check in `scripts/novice_check.js`.

## 1. The automated walk

```bash
NODE_PATH=$(npm root -g) node scripts/novice_check.js App.html --shots /tmp/novice
```

Fresh profile, network cut, 1280 px. It checks:

- the welcome appears on first open
- every screen with the demo data, then every screen after "start clean":
  no `NaN`, `undefined`, `null`, `Invalid Date`, `Infinity`, `[object Object]`;
  no script errors; no near-blank screen without an empty state; no zero tiles
  on a brand-new dashboard; no sideways scrolling
- every add form submitted empty: it must refuse with a visible reason, and its
  title must name what is being added
- a record survives a reload

It has been proven to fail: a build with a `NaN` tile and unvalidated forms
gives 13 blockers.

## 2. Look at the screenshots yourself

The script cannot judge wording or taste. Open every `empty-*.png` and
`demo-*.png` and ask, as someone who has never seen it:

- **Do I know what to do first?** The empty dashboard should point at the one
  first step (add a student, a person, a property).
- **Does every number name its period?** "Logged in period", "this year",
  "on the transcript".
- **Does a zero look like failure?** Show "—" until there is data.
- **Does a tile agree with the document it mirrors?** Credits on the dashboard
  must equal credits on the transcript, by the same rule.
- **Is any placeholder about to be printed?** "Primary Educator", "Student
  Name", "[Your school]" on an official document.
- **Does every control work in this state?** Hide what cannot act yet
  (export with no records, arrows with one page).
- **Do dialog titles match the button that opened them?**

## 3. Rules from reviews so far

From Homeschool Hub (first review) — remedies in `pitfalls.md` § Novice findings:

1. Zero data shows "—", not 0, 0%, 0.00.
2. A KPI that mirrors a printed document uses the document's records and rule.
3. A missing optional name drops its line from the document; no placeholders.
4. Every user value reaching HTML is escaped, including settings inputs and
   cover pages — not only table cells.

From the JPS family (`sellable-html-app`), adopted here:

5. No "today" default for a due date; a past date asks "Already done?".
6. Charts start at the first entry and stop at the last.
7. Hide what cannot act yet; a one-click fix must work in every state it is
   offered.
8. Labels count what they do ("3 overdue", not "Overdue").

From the Legacy Planner and Emergency Vault review (Oct 2026). Both passed every automated check and
still had all of these; `novice_check.js` now finds each one (proven on the pre-fix Vault: 11 major):

9. **The first five minutes cost at most 4 clicks** from first open to the first saved record. Slide one
   of the welcome offers "Start with my own records" / "Show me around first"; Skip on a first run
   starts clean; a replay never offers to wipe. (Was: four slides, a wipe-or-keep choice, a profile
   form, then the add. 7 clicks, and closing the welcome with × kept the demo silently.)
10. **The demo never opens overdue.** Demo due dates sit in the future (due soon), and the backup
    banner never shows over demo data. The first thing a buyer sees is not a red tile.
11. **A required choice the welcome already implied gets a default** (`default: "Adult"` on the
    household role, `"Executor"` on key people). An empty save shows the app's own hint ("Fill in
    "Name" first.") and focuses the field, never only the browser's bubble.
12. **Dashes per tile, not per dashboard.** A tile shows "—" until *its* section has something to
    count. After the first person, "Located 0 · Who to call 0 · Estate $0.00" read as failing.
13. **The backup nag waits for something worth losing** (~5 records), never after the first record.
14. **"Where you stand" names the next step, not the fault** ("Next: medical notes for 1 person",
    not "1 person with no medical record yet").
15. **One toast at a time**; a new one replaces the last unless the last carries an action.
16. **Print is paper under every theme**: `@media print` resets `html.dark` surfaces and ink.
17. **Donor words are a check, not a memory.** The other binders' product names and section titles
    (read from the files beside the app) must not appear on any screen in any state. Settings ›
    Document Export still listed Sitter Sheet, Immunisation and Photo Record; the dashboard said
    "Chores, appointments, school deadlines"; a demo note mentioned "Katie the sitter".
18. **Three families, one checker.** The `newbie-check` skill (Dashboard-Creator repo) runs its crawl,
    walk and first-job drive on binders with no setup; run it as well before packaging. Its crawl also
    carries this script's junk-text and empty-form checks.
