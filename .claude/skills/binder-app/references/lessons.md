# Lessons: feedback turned into rules

Read once per product. Each line is a correction that was actually made, so
applying them up front means they are never made again.

`pitfalls.md` is for defects — things that are broken. This is for taste and
working style — things that are right but wrong.

## How the user works

- Reviews on **screenshots**. A change that works but looks wrong is not done.
- Expects **another 25% after "almost there"**: a top-to-bottom pass touching
  every screen — spacing, dead space, icon/text alignment, equal card heights,
  empty states, wording, phone width.
- "Keep making slight improvements independently when you notice them." Fix
  small things without asking; list them in the summary.
- Prefers **concise answers**, and a contrasting view only when there is a
  real one.
- Decides scope fast. Build extras behind a switch rather than deleting them.
- Works **product by product**. Finish one before starting the next.

## Layout

- **Dead space is a bug.** Two half-empty columns become three or four compact
  ones, or the space gets a second useful chart.
- **Cards in a row share a height.** A table beside a chart takes the chart's
  height and scrolls inside its card.
- **Related things sit together** — the chart and the table that explains it.
- **Centre titles and subtitles** on mockup slides.
- **Bloat is a bug.** A fifteen-item sidebar on first run looks like work:
  group into `NAV_GROUPS`, hide rarely-used modules by default. But do not
  merge a screen that worked on its own.
- **Stay where the buyer was** after an action — the entity they were filtering
  by, the tab they were on.
- Grid is the default view for entities; table is the option.

## Colour and type

- **The five themes are fixed.** A new product picks a default from them; it
  does not get its own palette. `scripts/check_house_style.py` enforces this.
- Write `primary-*`, never a palette name. A hard-coded `indigo-600` ignores
  the theme switcher and nobody notices until they switch.
- **Solid colours, no gradients** on tiles.
- **One colour language**: rose = bad or overdue, amber = due soon, emerald =
  good or done, blue = informational, the accent = the product's own colour.
- **Status is a word plus a colour, never a colour alone.** These documents get
  printed in black and white.
- **Icons in the content**, not everywhere. Check every icon is vertically
  centred against its text — "the text sits slightly above" has been said more
  than once.
- Numbers are mono and `tabular-nums`, always.

## Tables and charts

- **Every table sortable, searchable and filterable**, through one shared
  enhancer, not per-table code.
- **Page long tables** (~15 rows) instead of growing the card.
- Long names wrap to two lines so the right-hand columns stay visible.
- **Numbers on the bars**, flat bars, no rounded ends, no white gaps in a
  stack. Axes at the bottom of their container.
- Donut above its legend. Pie or donut when the point is a percentage;
  otherwise something else.
- A chart that answers no question gets deleted.

## Words

- American English: "check", not "tick"; "color" in the UI.
- **Short.** Every listing and guide revision has been an instruction to cut.
  "What you get" is one line. "Perfect for" is one sentence.
- Explain a derived number on screen, next to it.
- Say which action fills an empty section.
- Don't claim what is not there, and don't copy a competitor's claims.

## Data and trust

- **Nothing is lost silently.** A failed write gets a modal with a backup
  offer, not a console line.
- A refused import must say *why* it was refused.
- "Disappeared after a refresh" means the quota was hit — that is what
  IndexedDB is for.
- Everything imported is editable and deletable, with Undo.
- **Never invite a buyer to store a credential.** Ask where the password is
  kept. Ask for the last four digits.

## Products and packaging

- The free demo should give the "wow" and still leave a reason to buy — but do
  not cap the printed document; it *is* the reason to buy.
- Demo data for **three entities**, anchored to today, exercising every
  feature visibly.
- Mockup slides exported ready to upload; the seller should not screenshot
  anything.
- The buyer guide is **not text-heavy**. Short phrases, icons, numbered steps.
- Name deliverables per product.
- A listing packet in the order Etsy asks for it.

## Engineering

- **Push your work.** Containers get reclaimed; committing is not saving.
  About sixty commits across six projects were lost to this once.
- Never edit `dist/`.
- Persist after each edit. A script that validates ten changes and writes once
  loses all ten on the seventh failure.
- **Prove a regression test can fail** before trusting it.
- Use a real editor or a Python script for multi-line edits; `sed` with
  escaped pipes has corrupted a file.
- Grep before naming a method — a new `insights()` shadowing an old one is
  silent.
- Scope reduced-motion overrides tightly; a blanket rule once flattened every
  chart.
- Verify Phosphor icon names exist. A wrong name is a blank box, silently.


## Paper is a selling point (user rule)

Binder apps are for people who still like paper copies. That is why every
tab prints a polished PDF. Say so in every listing: it is the best of both
worlds, digital on every device and a real binder on the shelf.
- Listing photos: photo 2 is "The best of both worlds." over a fan of real
  printed pages (binder cover + three documents, content pages, not covers).
- Description: a "The best of both worlds:" paragraph right after the
  opening line, naming that product's printouts.
- Tags: include "printable planner".

- Wide screens: no 1400px cap (.max-w-7xl.mx-auto{max-width:none}), and the calendar view grows with the window (cal-card/cal-scroll/cal-grid: the page scrolls, never a box inside it). New binders forked from an existing one inherit both; the CSS sits at the end of the jps-skin style block.

- List view: the table card grows with its rows (.list-card), like the calendar. Filter labels: a field can set filterLabel, and words ending in -us pluralize to -uses ("All Statuses"). Phones: nothing under 12px, 40px menu button (Oct 2026, device-check on the Divorce Planner).

- **Every binder with dates gets a calendar.** A dated section that people plan around (court dates, appointments, deadlines, tasks) sets `hasCalendar: true`, which gives the three views: calendar, cards and list. Divorce shipped without one and was sent back. Finished (✅/🟢) or cancelled (❌) items are never overdue; times show 12-hour (formatTime) in US date format.
