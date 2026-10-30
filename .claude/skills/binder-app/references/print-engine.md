# Print engine

The printed document is why these apps price above a spreadsheet template. The
buyer fills the app in for months to produce *one artifact they hand to someone
else*: a transcript, a net worth statement, a sitter sheet, a compliance
summary. Print is a first-class feature, not `window.print()` with a media
query.

Working code: `assets/print-engine.js`, `assets/print-stylesheet.css`.

## It builds a document

`getPrintHTML()` returns a complete standalone HTML string — its own `<head>`,
its own stylesheet, a cover page, section headings, tables sized for paper.
The screen's layout is irrelevant to it.

`deliverDocument()` writes that string into a **hidden iframe** and calls
`print()` on the iframe's window.

**Never `window.open()`.** Popup blockers eat it, and the buyer sees a button
that does nothing with no error. An iframe always works. This is the single
most important rule in this file.

## The picker

Before printing, a modal asks what goes in:

- which sections (`printable: true` in `SECTIONS`)
- which entities (`printMemberBoxes()` — all / none / individually)
- a cover page, yes or no
- a signature block, yes or no

Printing everything by default produces 40 pages and the buyer never prints
again.

## Page setup

```css
@page { size: Letter portrait; margin: 14mm; }
```

Naming the size **pins Chrome's own Layout control** — it is then not merely a
default, the user's print dialog follows it. Omit it and Chrome offers
landscape and the document reflows unpredictably.

```css
@page :first { margin: 0 }
```

Only emit this **when a cover page exists**. Unconditional, a cover-less
document prints edge to edge with no margin. (This shipped once.)

**One orientation per document.** A named `@page wide` for landscape tables
forces a page break at every switch — an 8-page document became 18. If some
tables are too wide, narrow them (`WIDE_TABLE_COLUMNS = 8`, then drop
`hideInTable`/low-value columns) or print the wide section as its own document.
`needsLandscape()` decides for the whole document, not per section.

## Pagination rules that matter

```css
thead { display: table-header-group }   /* headers repeat on every page */
tr, .card { break-inside: avoid }
h2 { break-after: avoid }               /* no heading alone at the foot */
.section { break-before: page }
```

Verify by rendering to PDF and counting pages, not by reading CSS.

## Column widths

`printColumnWidths()` + `selectColumnChars()` size columns from the actual
content length rather than letting the browser decide. Auto-layout gives a
three-character date column 30% of the width and squeezes notes to one word per
line. Measure, then allocate.

`printableFields()` drops anything marked `hideInTable`, plus empty columns —
a column that is blank for every record is noise on paper.

## Cover page and signatures

`printCover()`: title, entity name, date range, generated-on date, and the
buyer's own name if set. It is what makes a stapled printout look like a
document rather than a screenshot.

`printSignatureBlock()`: signature line, printed name, date. A transcript or a
legal summary needs it; a grocery list does not — hence the toggle.

`printTotalRow()` adds the sum for sections with `totalField`.

## The footer

Page numbers, the document title, and — for anything with money, medicine or
law in it — the disclaimer. Printed pages outlive the app.

## Escaping

Print output is built as a string, so **every value goes through
`escapeHtml()`**. A record named `Smith & Sons <Reception>` breaks the document
structure otherwise, and print is the easiest place to forget it.

## Verifying

`scripts/verify_binder.js` builds the print document in a real browser, renders
it to PDF, and reports page count and `MediaBox`. Use it for:

- orientation (`MediaBox` dimensions, not intent)
- page count before and after a pagination change
- that a cover-less document still has margins

"The CSS looks right" is not verification. Every print bug in this file's
history looked right in the CSS.
