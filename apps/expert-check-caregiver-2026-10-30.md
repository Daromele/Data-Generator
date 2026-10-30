# Expert check: Caregiver Binder (2026-10-30)

Report only. Nothing in the app was changed.

## Summary

**App:** `apps/Caregiver_Binder.html`, an offline binder for a family member caring for a parent. It covers appointments, a daily care log, care tasks, a medication list, the care team, a health summary, documents, insurance, care costs and a journal. It prints a medication list, a care summary and a care costs report, and exports an Excel workbook.

**Niche checked live (2026-10-30):**
- **Etsy caregiver binders:** a bestseller bundle at about $7–14 with 117 reviews, and a 135-page aging-parent binder at about $19. Prices run from about $1 to $55, the top one being a printed binder ([Etsy search: caregiver binder printable](https://www.etsy.com/market/caregiver_binder_printable), [medical parent caregiver binder](https://www.etsy.com/market/medical_parent_caregiver_binder), [listing 1000437708](https://www.etsy.com/listing/1000437708/printable-caregiver-binder-elderly-care), [aging parent emergency kit 4521537220](https://www.etsy.com/listing/4521537220/aging-parent-emergency-kit-printable)).
- **What those binders commonly contain:**
  - a **vitals log** (blood pressure, temperature, pulse, weight, blood glucose) and a **medication schedule grid / medication administration record (MAR)**
  - an **emergency plan / quick-start sheet**
  - daily logs of meals, hydration, sleep, bowel movements and behaviors
  - dementia-specific versions with behavior, sundowning and wandering logs ([listing 4588312781](https://www.etsy.com/listing/4588312781))
- **Apps checked:**
  - Caring Village: calendar, medication list, documents, wellness journal, encrypted chat, roles and permissions ([AARP top caregiving apps](https://www.aarp.org/personal-technology/top-caregiving-apps/), [Healthify NZ](https://healthify.nz/caring-village-app); vendor roundup [caringvillage.com](https://caringvillage.com/2026/05/13/caregiver-apps-for-families/))
  - Medisafe: medication adherence and reminders, with caregiver alerts
  - ianacare: task delegation and a shared care calendar
  - CareZone: medication list and vitals
  - Notion's [Health & Caregiver Binder template](https://www.notion.com/templates/health-caregiver-binder)
- **Files caregivers already have:**
  - Apple Health can export a **medications PDF** but has no CSV ([Apple community](https://discussions-kr-prz.apple.com/thread/254936336), [Apple developer forum](https://developer.apple.com/forums/thread/762229)).
  - Medication apps (DoseAlert, DoseKeeper) export a CSV medication list or a PDF log ([DoseGuard backup and export](https://doseguard.moosemediafsj.ca/help/backup-export)).
  - Money files are not central to this niche.

**Limits:** Etsy and Caring Village pages could not be opened from this session (their domains aren't allowed). Listing contents and prices come from search-result text. Review quotes were not reachable, and no "I wish…" reviews turned up in search.

**The three findings that matter most:**
1. **"How often" does nothing.** A task marked Weekly or Daily never comes back after it's marked done. The form promises something the app doesn't do.
2. **No vitals log and no medication given/taken check-off.** Nearly every Etsy caregiver binder sells these two pages, and Medisafe and CareZone treat them as basic.
3. **The care costs report and Excel export can't be limited to a period.** A caregiver doing taxes, an FSA/HSA claim, reimbursement or Medicaid paperwork needs one year or one quarter. After a year of use the report prints every cost ever entered, 420 rows in the test below.

## Missing (a buyer who knows this job will notice within a week)

**1. "How often" on Care Tasks has no effect**
- **What happens:** Marking a Weekly task done just leaves it done. No next one is created and the due date doesn't move.
- **Who hits it:** every daily user, in week 1 (groceries, refilling the pill organizer).
- **Evidence:** the `repeat` field exists only in the form and the prints; no code reads it. The demo shows "Pick up groceries · Weekly".
- **Effort:** S. Marking a repeating task done either creates the next one or moves its date forward; the engine's `dueStatus` already handles dates.
- **Where it lives:** the existing field. Nothing new on screen.
- **Newbie conflict:** no. **Selling point:** yes ("recurring care tasks").

**2. Vitals log (blood pressure, pulse, blood sugar, weight, temperature, oxygen)**
- **Who hits it:** anyone caring for someone with high blood pressure, diabetes or heart failure, on day 1. The doctor asks "what have the readings been?"
- **Evidence:**
  - Etsy binders list a "Vitals Log: blood pressure, temperature, pulse, weight, blood glucose" as a core page.
  - Caregiver logs commonly record BP and blood sugar morning and evening.
  - CareZone lists vitals logs.
- **Effort:** M.
  - A new section: date, time, reading type, value or values, and a notes field ("after meds", "felt dizzy").
  - A simple trend line per type.
  - A print that fits one page for the doctor.
- **Where it lives:** its own tab under Health Records. It's hideable like every tab, so a buyer who doesn't track vitals switches it off in Settings.
- **Newbie conflict:** no. **Selling point:** yes ("vitals log with charts for the doctor").
- **Scope note:** record and chart only. No ranges, alerts or "normal" labels, to keep it non-clinical.

**3. Medication given / taken check-off**
- **What it is:** a daily grid of each medication against morning, noon, evening and bedtime, which the helper ticks off.
- **Who hits it:** families sharing care (Laura, David and the aide in the demo) who need to know whether Mom's morning pills were given. They need it on day 1.
- **Evidence:**
  - Etsy titles sell this as a "Medication Administration Record" or "medication schedule grid".
  - Medisafe is built around adherence.
  - The care log demo itself has an entry, "Morning medications taken", written as free text, which is the workaround.
- **Effort:** M.
  - Add a "When taken" field to medications: multi-select, copied from the label.
  - Add a Today checklist generated from it; each tick is stored as a log entry with who and when.
  - Print a 7-day or 31-day grid.
- **Where it lives:** a "Today's medications" card on the Overview, which only appears once a medication has times set, plus a print.
- **Newbie conflict:** low (the card is hidden until times exist). **Selling point:** yes, strongly; a photo of the printed grid would sell well.
- **Scope note:** it records what the family did. It never suggests doses or warns about interactions.

**4. Period filter on Care Costs, its report and the Excel export**
- **Who hits it:** whoever does Mom's taxes, an FSA/HSA claim, a reimbursement or a sibling cost-sharing talk, at the first month-end or in tax season.
- **Evidence (heavy-use test):**
  - With 420 costs, the Care Costs print rendered every row in one document (197 KB of HTML), and the Excel "Care Costs" sheet holds every cost ever entered.
  - The list's "All Dates" filter exists, but the print and the export ignore it.
- **Effort:** S. The report and the export follow the list's date filter, plus a "This year / last year / quarter" choice in the print dialog.
- **Where it lives:** the existing date filter and the print dialog.
- **Newbie conflict:** no. **Selling point:** yes ("tax-time care costs report").

**5. Emergency sheet (one page for paramedics, the ER or a respite helper)**
- **Contents:** name, date of birth, conditions, allergies, current medications, doctors, emergency contacts, insurance, where the advance directive and power of attorney are, and code status (DNR or POLST) **as the family records it**.
- **Who hits it:** the first ER visit or the first time a respite helper stays alone.
- **Evidence:**
  - Etsy sells "Aging Parent Emergency Kit … QR Information Sheets" as its own listing.
  - Bundles list an "emergency plan and quick-start sheet".
- **Effort:** S. All the data is already in the binder; this is one more print.
- **Where it lives:** the Print & Share card and the Health Summary header.
- **Newbie conflict:** no. **Selling point:** yes (a fridge-sheet photo).
- **Today's coverage:** the Care Summary is close, but it runs 2 pages and has no emergency contacts at the top.

## Strong upgrades (would beat the competition)

**1. More than one person cared for**
- **What it is:** a "Person" field, or a switch to filter the whole binder by person.
- **Who:** adult children caring for both parents; the demo's sibling setup is common.
- **Evidence:** the Ultimate Mom and Homeschool binders on this engine already have a members filter. It was removed for Caregiver because there was no `members` section.
- **Effort:** M. Bring back the engine's `members` section, labelled "People I care for", hidden while only one is entered.
- **Newbie conflict:** no, if hidden until a second person is added. **Selling point:** yes ("one binder for both parents").

**2. Shared care circle, sold as such**
- **What it is:** sync already lets a sibling and an aide see the same binder. Caring Village and ianacare make shared coordination their headline.
- **What to add:** a "Logged by" field that remembers the person on this device, so entries say who did what without typing it.
- **Effort:** S.
- **Where it lives:** Settings, as "This device belongs to…".
- **Selling point:** yes. "Share with siblings, no account, no subscription" is a direct answer to Caring Village's $14.99 a month.

**3. Health timeline and doctor-visit prep page**
- **Who uses it:** the person going to an appointment.
- **What it is:** a print for the next appointment with three parts:
  - the questions from the appointment's notes
  - care log entries of type "Something new to mention" since the last visit
  - recent vitals
- **Effort:** M.
- **Where it lives:** a button on each appointment.
- **Selling point:** yes ("walk into every appointment prepared").

**4. Care log quick entry**
- **What it is:** a one-line "+ Note" on the Overview. It fills date, time and author and leaves type at General.
- **Effort:** S.
- **Where it lives:** the Overview, plus a keyboard shortcut (N).
- **Newbie conflict:** low.
- **Selling point:** no, but it is the most-used action.

**5. Refill workflow**
- **What it is:** a "Picked up" button on a medication that moves the next refill date by its supply (30 or 90 days). There's also a Refills due list.
- **Effort:** S. **Where it lives:** the medication row menu. **Selling point:** small.

**6. Dementia pack**
- **What it is:** behavior, sundowning and wandering-plan sections, hidden by default and switched on in Settings.
- **Evidence:** Etsy has dedicated listings for this ([4588312781](https://www.etsy.com/listing/4588312781)).
- **Effort:** M.
- **Selling point:** yes, possibly as a second listing title ("Dementia Caregiver Binder").

## Nice ideas

- **Import a medication list:** paste or read a CSV from a medication app (DoseAlert-style columns: name, strength, directions). Apple Health only gives a PDF, so this helps fewer buyers. Effort S/M. Lives in the medication header menu.
- **Bulk select and bulk delete** in the table view, and **Undo** after a delete; today the confirm box says "This action cannot be undone". Lives in the table header checkbox. Effort M.
- **Archive instead of delete** for stopped medications and old tasks: kept out of the list but still in the history and prints. Effort S.
- **Keyboard shortcuts** (N new, / search, G then a letter to jump) with a shortcut list in Settings. Effort S.
- **Remember the last-used values:** "Logged by", "Paid by" and "Who is taking them" default to the last person entered. Effort S.

## Heavy-use and friction numbers

**Test data:** a year of records, 1,825 in total: 1,100 care log entries, 420 costs, 160 appointments, 120 tasks and 25 medications, with long titles. Chromium at 1440 px; no page errors.

| Action | Time |
|---|---|
| Overview | 4 ms |
| Daily Care Log, table / cards | **273 ms / 351 ms** (all 1,100 rows drawn, no paging) |
| Care Costs, table / cards | 126 / 104 ms |
| Appointments, table / cards / calendar | 62 / 84 / 19 ms |
| Care Tasks, Medications | under 50 ms |
| Search ("mailbox") | 22 ms |
| Sort costs by amount | 143 ms |
| Care Costs print / Excel export | 18 / 14 ms (but every row, see Missing 4) |
| Data size | 384 KB (fine for browser storage) |

- **What breaks at scale:**
  - The Daily Care Log cards view nears the 300–350 ms threshold at about 1,100 entries. At about 3,000 entries (three years of daily notes) it will feel slow.
  - Fix: show the latest 200 entries with a "Show more" button, or default the log to "Last 90 days". Effort S.
- **Nothing else broke.**

**Clicks for the five most common daily tasks** (from the Overview):
1. **Log a care note:** 5 clicks (Daily Care Log, Add, type, choose type, Save). Date fills itself; time doesn't. With quick entry (upgrade 4) it would take 1 click plus typing.
2. **Mark a task done:** 4 clicks (Edit, status, choose Done, Save). There's no one-click tick, and a repeating task doesn't come back (Missing 1).
3. **Add an appointment:** 6 clicks (Appointments, Add, date, time, type, Save).
4. **Record a refill picked up:** 5 clicks (Medication List, Edit, date picker, pick date, Save). A "Picked up" button would make it 2 (upgrade 5).
5. **Add a cost:** 5 clicks (Care Costs, Add, type what, amount, Save). Date fills itself, and Paid by doesn't remember the last person.

- **Already there and good:**
  - duplicate (a row action)
  - CSV export of every list, the Excel workbook, backup and restore
  - search across all sections
  - date filters
  - three print documents plus the Master Binder
  - sync between devices
  - attachments on documents

## Rules to teach the skills (if the owner approves)

- **sellable-html-app / binder-app:**
  - "A select that promises behavior ('How often', 'Repeats', 'Remind me') must have that behavior in the same release, or it doesn't ship."
  - "Every money or time report follows the list's period filter and offers This year / Last year in its print dialog."
- **binder-app (health-adjacent binders):** "Ship a vitals log and a dose check-off grid, record-only, never ranges or advice. Ship a one-page emergency sheet built from data already in the binder."
- **binder-app (logs):** "Any log a user adds to daily opens on the last 90 days or pages at 200 rows."
