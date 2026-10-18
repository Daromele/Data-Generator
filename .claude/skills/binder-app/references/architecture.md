# Architecture

One HTML file. One class instance (`app`). One config object (`SECTIONS`) that
generates most of the UI. Understanding `SECTIONS` is most of understanding the
engine.

## File layout

```
<!DOCTYPE html>
<head>
  <style>  ... Tailwind, precompiled and inlined ... </style>
  <style>  ... Phosphor icon font, base64 woff2 ... </style>
  <style>  ... app CSS: themes, print, components ... </style>
</head>
<body>
  ... static shell: sidebar, header, modal roots ...
  <script> ... Chart.js, inlined ... </script>
  <script> ... THEMES, NAV_GROUPS, SECTIONS, ONBOARDING_SLIDES ... </script>
  <script> ... class BinderApp { ~223 methods } ; const app = new BinderApp() </script>
</body>
```

In `src/app.html` the three vendor blocks are the markers `<!--INJECT:TAILWIND-->`,
`<!--INJECT:PHOSPHOR-->`, `<!--INJECT:CHART-->`; `scripts/build.py` replaces them.
Everything else is hand-written and lives in `src/`.

## The entity

Every binder has exactly one **entity**: the record that everything else hangs
off. Students, family members, properties, accounts. It earns its special
treatment by doing two jobs no ordinary module does:

1. **Whole-app filtering.** A single selector at the top narrows every list,
   count, chart and document to one entity. Buyers think in these terms
   ("show me just Emma"), so the app must too.
2. **Per-entity documents.** The printed artifact is usually *per entity* — one
   transcript per student, one sitter sheet per child. The print modal gets
   entity checkboxes, not just section checkboxes.

`assets/entity-layer.js` holds the whole implementation: `members()`,
`memberName()`, `recordMatchesMember()`, `printMemberIds()`, `printMemberBoxes()`,
`togglePrintMembers()`. Rename the noun; keep the shape.

Choosing the entity wrongly is the one architectural mistake that is expensive to
undo. If the buyer would ever say "show me only X", X is the entity.

## SECTIONS

```js
const SECTIONS = {
  documents: {
    title: 'Documents',
    icon: 'ph-folder',
    singular: 'Document',
    fields: [
      { key: 'name',     label: 'Document',  type: 'text',     required: true },
      { key: 'member',   label: 'Belongs to', type: 'member_select' },
      { key: 'expires',  label: 'Expires',   type: 'date' },
      { key: 'where',    label: 'Where kept', type: 'text' },
      { key: 'notes',    label: 'Notes',     type: 'textarea', hideInTable: true },
      { key: 'files',    label: 'Scans',     type: 'attachments' }
    ],
    dueField: 'expires',
    sortDefault: 'expires',
    views: ['table', 'cards'],
    printable: true
  },
  ...
}
```

One entry generates: the sidebar item, the page header and count, the add/edit
modal, the table (columns, sort, column picker), the card view, the search
filter, the due-date filter, the CSV export, the print section, the dashboard
tile and the backup payload shape. **Adding a field means adding one line here
and nothing else.** If a change needs edits in five places, the generic path has
been bypassed somewhere — find it instead of working around it.

### Section keys

| Key | Effect |
|---|---|
| `title`, `singular`, `icon` | headings, buttons ("Add Document"), sidebar |
| `fields` | everything below |
| `dueField` | turns on the due-date filter and badges for this section |
| `sortDefault` | initial sort column |
| `views` | `'table'`, `'cards'`, `'board'` — a toggle appears if more than one |
| `printable` | section offered in the print picker |
| `hiddenByDefault` | module off until the buyer enables it in Settings |
| `totalField` | a sum row in the table and in the printed document |

### Field types

| Type | Renders | Notes |
|---|---|---|
| `text` | input | |
| `textarea` | textarea | use `hideInTable: true` |
| `number` | numeric input | `money: true` formats as currency |
| `date` | date input | the only type `dueField` may point at |
| `url` | input + open link | never auto-fetched |
| `select` | dropdown | needs `options: [...]` |
| `attachments` | file picker, base64 in IndexedDB | downscaled on import |
| `<entity>_select` | one entity | e.g. `member_select`, `student_select` |
| `<entity>_multi` | several entities | checkbox list |
| `ay_select` | academic year | Homeschool only |
| `course_select` | a course record | Homeschool only |

Adding a type means touching four methods — the modal field renderer, the table
cell renderer, `printCellHtml`, and the CSV serialiser. Prefer an existing type.

## NAV_GROUPS

Sidebar grouping only: `{ label, icon, sections: ['documents', ...] }`. Sections
missing from every group are unreachable, which is the usual cause of "the
module exists but I can't see it".

## The class

~223 methods; ~180 are identical across shipped apps. Rough shape:

- **lifecycle** — `init`, `loadData`, `migrate`, `saveData`, `render`
- **routing** — `navigate`, `renderSection`, `renderDashboard`
- **CRUD** — `openModal`, `saveRecord`, `deleteRecord`, `duplicateRecord`
- **table/cards** — rendering, sorting, column picker, search
- **entity** — `assets/entity-layer.js`
- **due dates** — `assets/due-dates.js`
- **print** — `assets/print-engine.js`
- **data safety** — `assets/save-honesty.js`, `merge-restore.js`, `auto-backup.js`
- **settings/themes/onboarding**
- **domain-specific** — about 12%: GPA, net worth, debt payoff, meal totals

When adding a method, check whether the generic one already does it with a
config flag. That is nearly always the case.

## State

```js
this.data        // { sectionKey: [records] }  — the saved document
this.settings    // theme, hidden modules, column choices
this.ui          // current section, search text, filters, sort — never saved
```

Keep `this.ui` out of the backup; restoring someone into a stale search filter
looks like data loss.

Records carry `id` (prefix + timestamp + random), `created`, `updated`. The id
prefix is per-app and must be renamed on a fork — see the rebrand checklist in
`SKILL.md`.
