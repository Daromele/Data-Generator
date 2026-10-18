# Print engine: building a document, not a styled screen

> Ported from the `binder-app` skill, where the printed artifact is the
> product. Drop this in as `references/print-engine.md` and link it from
> SKILL.md's reference table and the definition of done (section O).

Today's print story is a `@media print` block that hides the rail and prints
what is on screen. That is enough for a working page and not enough for a
document the buyer keeps, emails to an accountant, or files with a tax return.
A real print engine builds a **separate document** and prints that.

The difference is worth it wherever the app produces something the buyer shows
someone else: a P&L, a year summary, a net worth statement, a shop report.

## It builds a document

`getPrintHTML()` returns a complete standalone HTML string — its own `<head>`,
its own stylesheet, a cover page, section headings, tables sized for paper.
The screen's layout is irrelevant to it, which is the point: the screen is
built for scanning and the document is built for reading.

`deliverDocument()` writes that string into a **hidden iframe** and calls
`print()` on the iframe's window.

**Never `window.open()`.** Popup blockers eat it and the buyer sees a button
that does nothing, with no error. An iframe always works. This is the single
most important rule here.

## The picker

Before printing, a modal asks what goes in: which sections, which entities
(all / none / individually), a cover page yes or no, a signature block yes or
no, and the period.

Printing everything by default produces forty pages and the buyer never prints
again.

## Page setup

```css
@page { size: Letter portrait; margin: 14mm; }
```

Naming the size **pins Chrome's own Layout control** — the user's print dialog
follows it instead of offering landscape and reflowing the document.

```css
@page :first { margin: 0 }
```

Emit this **only when a cover page exists**. Unconditional, a cover-less
document prints edge to edge with no margin.

**One orientation per document.** A named `@page wide` for landscape tables
forces a page break at every switch — an 8-page document became 18 that way.
If some tables are too wide, narrow them (drop low-value columns past about 8)
or print that section as its own document.

## Pagination

```css
thead { display: table-header-group }   /* headers repeat on every page */
tr, .card { break-inside: avoid }
h2 { break-after: avoid }               /* no heading alone at the foot */
.section { break-before: page }
```

Note how this differs from the current guidance: keeping *cards* whole
produced empty first pages, so cards flow and only charts and rows stay whole.
In a built document the units are rows and sections, not cards.

## Column widths

Size columns from the actual content length rather than letting the browser
decide. Auto-layout gives a three-character date column 30% of the width and
squeezes notes to one word per line. Measure the longest value per column,
allocate, then let the rest take what is left.

Drop any column that is empty for every row — on screen it is a reminder, on
paper it is noise.

Dates and amounts are atoms: `white-space: nowrap`, mono, `tabular-nums`.
`$24,5` over `00.00` is not a smaller number, it is a wrong one.

## Cover, signatures, footer

A cover page — title, entity, period, generated-on date, the seller's own name
if set — is what makes a stapled printout read as a document rather than a
screenshot.

A signature block (line, printed name, date) for anything that gets filed or
handed over. A footer with page numbers, the document title, and the
disclaimer for anything with money, medicine or law in it. Printed pages
outlive the app.

## Escaping

The document is built as a string, so **every value goes through the escaper**.
Print is the easiest place to forget it, and a shop called `Smith & Sons
<Reception>` breaks the document structure rather than merely looking wrong.

## Verifying

Render the print document to PDF in Playwright and check the artifact, not the
CSS:

- orientation from the `MediaBox` dimensions
- page count before and after any pagination change
- that a cover-less document still has margins
- that a long table repeats its header

Every print bug in this engine's history looked right in the CSS.
