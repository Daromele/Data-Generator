# Feature catalog — the definition of done

The eight Binder Standards say whether an app is *safe to sell*. This says
whether it is *finished*. Every binder gets all of A–L unless a line says
otherwise, and every binder gets them **the same way**, so the family looks
like one product line and a buyer who owns two recognises the second.

Tick all before calling an app done:

```
A  head: <title>, description, theme-color, favicon, license comment, noscript
B  rail: brand mark + name + subtitle, nav groups, active marker, due counts,
   demo button, version, save status; off-canvas drawer below md
C  top bar: entity picker, search, theme + dark toggle, Print, Back up
D  banners: demo mode, backup reminder (Not now), storage problem
E  page frame: eyebrow + h1 + count + subtitle + actions, footer with shop links
F  dashboard: KPI tiles with icons, due/overdue strip, charts, dated-items list,
   empty state with three steps
G  tables: sortable, searchable, filterable, paged, column picker, card/table
   toggle remembered, totals pinned
H  dialogs: modal with x, inline field errors, in-app confirm (never
   window.confirm), toast + Undo
I  settings: themes, dark mode, hidden modules ("n of m shown"), entity list,
   regional (currency, date format), PIN, getting started, replay tour
J  data safety: backup, restore (merge), auto-backup link, snapshots, CSV
K  print: picker, cover, per-entity documents, signature block
L  onboarding: welcome slides, demo data, backup nudge after 30 days
M  keyboard, focus, accessibility
N  motion, with prefers-reduced-motion off
O  storage keys and state conventions
P  attachments (when the product takes scans)
```

Add-ons, not in the checklist unless asked: **sync** (`sync.md`) and a
**hosted copy with an activation code** (`hosted-and-activation.md`).

---

## A. Head

`<title>` is the product name alone. A `description` meta, a `theme-color`
matching the default theme, an inline SVG favicon as a data URI (a tab with no
favicon looks unfinished the moment the buyer has two open), a license comment
at the top of the file, and a `<noscript>` that explains the app needs
JavaScript rather than showing a blank page.

## B. The rail

Always `bg-slate-900`, 256 px, off-canvas below `md` with a backdrop. Brand
mark, product name, one-line subtitle. Items grouped by `NAV_GROUPS`, active
item in the accent, a rose count badge for anything overdue. At the foot: the
demo-data button, `APP_VERSION`, and a save-status line that says *Saved* with
a timestamp, because a buyer with no cloud needs to see that.

## C. Top bar

The entity picker is the leftmost control — it filters the whole app, so it
outranks everything. Then search, the theme chooser and dark toggle, **Print**,
and **Back up**. Print and Back up are always visible; they are the two things
the product exists for.

## D. Banners

Three, in this priority: a storage problem (rose, never dismissible), demo
mode (amber, with *Clear demo data*), the backup reminder after
`BACKUP_NUDGE_DAYS` (slate, with *Not now*, and not again the same day).

## E. Page frame

Eyebrow (the group), `h1` (the section), the record count, a one-line
description from `SECTIONS`, and the actions right-aligned. The footer carries
the shop and terms links on every screen.

## F. Dashboard

KPI tiles four to a row, each tinted and iconed, each clickable through to the
section it counts. A due/overdue strip. Charts that answer a question rather
than decorate. A dated-items list — what is coming up — which for a vault is
the single most-used thing on the page.

Empty, it shows three steps, not zeros. "Add your first family member" beats a
row of 0s every time.

## G. Tables

Sortable by any heading (dates and numbers sort as numbers, totals stay
pinned), a search box, a filter select for any low-cardinality column, paging
at ~15 rows, a column picker, and a card/table toggle remembered in settings.

Use one shared enhancer that runs after each render and keeps its state across
re-renders. Per-table implementations drift apart within two products.

## H. Dialogs

One modal component: `role="dialog"`, `aria-modal`, `aria-labelledby`, Esc and
backdrop close, focus returned to the opener. Validation errors appear **under
the field**, never as an alert. Confirms are in-app — `window.confirm` is
ugly, unstyleable and blocks the page. Every destructive action toasts with
**Undo**.

## I. Settings

Themes as swatch chips, dark mode, **hidden modules** with switches and an
"n of m shown" line, the entity list, regional settings (currency, date
format), the PIN, and *Getting started* with a replay-the-tour button and the
shop contact line.

Rarely-used modules start hidden. A fifteen-item sidebar on first run makes
the product look like work.

## J. Data safety

See `data-safety.md`. On the checklist because it has to be *visible*: one
Back up button, one Restore, the auto-backup link with its status line,
snapshot recovery, and CSV export per section.

## K. Print

See `print-engine.md`. The picker, the cover page, per-entity documents, the
signature block. This is the product's reason to exist — if any item on this
list gets extra polish, it is this one.

## L. Onboarding

Four or five welcome slides, shown once, replayable. Demo data on by default
with one-click clear. The backup nudge at 30 days.

## M. Keyboard and accessibility

`/` focuses search, `Esc` closes the top-most layer, `Ctrl/Cmd+P` opens the
print picker. Visible focus rings everywhere. 44 px tap targets. `aria-label`
on every icon-only button and on charts. Tab order survives a re-render.

## N. Motion

Three animations only (toast in, toast out, section fade), all disabled under
`prefers-reduced-motion` and in print. See `design-system.md`.

## O. Storage keys and state

Every key is `SETTINGS_PREFIX` + a name. Records in IndexedDB; settings in
localStorage; `this.ui` never persisted. The prefix, the record-id prefix and
`SNAPSHOT_KEYS` are renamed on every fork — see the rebrand checklist in
`SKILL.md`.

## P. Attachments

Only for products that take scans. Downscaled on import
(`SAMPLE_MAX_EDGE` 1600, `SAMPLE_MAX_BYTES` 4 MB), shown as a thumbnail with a
viewer, removable, and counted in the backup size warning. If sync is on, read
the attachment rule in `sync.md` first.
