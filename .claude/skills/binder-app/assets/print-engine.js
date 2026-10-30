/* The print engine: builds a complete HTML document and renders it in a
 * hidden iframe. It never re-styles the screen.
 *
 * Details that are easy to get wrong and expensive to find:
 *  - window.open is stopped by popup blockers; a hidden iframe is not.
 *  - Declaring `size:` inside @page PINS Chrome's Layout control, so the
 *    buyer cannot pick landscape for a wide table. Do not declare it.
 *  - `@page :first { margin: 0 }` exists for a cover page. Emit it ONLY
 *    when there is a cover, or page one of content prints edge to edge.
 *  - A named @page forces a break at every switch: one orientation per
 *    document, chosen up front by needsLandscape().
 */

getPrintHTML(title, coverHtml, contentHtml, landscape = false) {
                const edLine = this.ownerLine();
                const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-600').trim() || '#4f46e5';
                const themeDark = getComputedStyle(document.documentElement).getPropertyValue('--theme-900').trim() || '#312e81';

                return `<html><head><title>Print - ${title}</title><style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&display=swap'); 
                body{font-family:'Inter',sans-serif; color:#0f172a; padding:0; margin:0; line-height:1.5; background: #fff;} 
                h1,h2,h3,h4{font-family:'Inter',sans-serif; margin: 0;} 
                h3 { font-size: 20px; margin-top: 40px; border-bottom: 2px solid ${themeColor}; color: ${themeDark}; padding-bottom: 8px; page-break-after: avoid; font-family: 'Merriweather', serif;}
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; page-break-inside: auto; table-layout: fixed; }
                thead { display: table-header-group; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; font-size: 12px; }
                /* A serial number or a URL may break anywhere; a header may not.
                   Breaking "Project" across seven lines is never the right answer,
                   so a header overflows its column rather than shattering. */
                /* break-word, not anywhere: a long word moves to its own line
                   first and only splits if it still will not fit. */
                td { word-wrap: break-word; overflow-wrap: break-word; }
                th { overflow-wrap: normal; word-break: keep-all; hyphens: none; }
                /* A date or an amount is one atom. "$24,5" over "00.00" is not a
                   smaller number, it is a wrong one, so these never break. */
                td.num { white-space: nowrap; overflow-wrap: normal; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
                /* The date must not break; the phrase underneath it must. Without
                   this the nowrap above forced "6 days overdue" onto one line and
                   pushed the whole column wide. */
                .due-note { font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700; margin-top: 2px; white-space: normal; }

                /* Eight or more columns will not read on portrait Letter at a
                   legible size. Rather than shrink the type -- this binder is
                   often printed by people who would rather not squint -- the
                   whole document is turned on its side. */
                .wide-table th, .wide-table td { padding: 8px 9px; }

                /* Four across reads well on a portrait page; a landscape one has
                   room for the whole week in a single strip, which is what a week
                   on a fridge door wants to look like. */
                .week-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
                @media print and (orientation: landscape) {
                    .week-grid { grid-template-columns: repeat(7, 1fr); }
                }

                /* A ten-column table fits comfortably across a landscape page and
                   not at all across a portrait one. Since the reader now chooses
                   the orientation, the table adapts to whichever they picked
                   rather than the document dictating it. */
                @media print and (orientation: portrait) {
                    .wide-table th, .wide-table td { font-size: 9.5px; padding: 5px 5px; }
                    .wide-table td.num { font-size: 9px; }
                }
                th { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; color: black !important; font-weight: bold; }
                .cover-page { 
                    height: 99vh !important; max-height: 99vh !important; overflow: hidden !important;
                    display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; box-sizing: border-box; padding: 40px; 
                    background-color: #0f172a; 
                    background-image: linear-gradient(135deg, #0f172a 0%, ${themeDark} 100%);
                    color: #ffffff;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                } 
                .cover-page h1 { font-size: 48px; margin-bottom: 16px; font-weight: 800; font-family: 'Merriweather', serif; letter-spacing: -1px;}
                
                /* Print Calendar Styles */
                .print-calendar { display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0; page-break-inside: avoid; margin-bottom: 30px;}
                .print-calendar-header { display: grid; grid-template-columns: repeat(7, 1fr); background: #f8fafc !important; -webkit-print-color-adjust: exact; font-weight: bold; text-align: center; font-size: 11px; text-transform: uppercase; border-top: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0;}
                .print-calendar-header > div { padding: 8px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;}
                .print-calendar > div { min-height: 100px; padding: 8px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; box-sizing: border-box; font-size: 11px; }

                /* One month to a page, always. A six-row grid is taller than the
                   space left beside anything else, so each month takes its own
                   sheet rather than being split across two. The cell height is
                   what makes that possible: six rows have to fit whichever way
                   the reader turned the paper, and a landscape page is three
                   inches shorter. */
                .print-month { page-break-inside: avoid; break-inside: avoid; page-break-after: always; }
                .print-month:last-of-type { page-break-after: auto; }
                .print-month:not(:has(~ .print-month)) { page-break-after: auto; }
                @media print and (orientation: landscape) {
                    .print-calendar > div { min-height: 74px; padding: 5px; font-size: 10px; }
                    .print-calendar .print-cal-item { padding: 2px 3px; margin-bottom: 2px; }
                }
                .print-cal-day { font-weight: bold; margin-bottom: 4px; font-family: 'JetBrains Mono', monospace;}
                .print-cal-item { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; padding: 4px; margin-bottom: 4px; border-radius: 2px; border: 1px solid #e2e8f0; }
                .print-cal-item-success { background: #ecfdf5 !important; border-color: #a7f3d0 !important; color: #065f46; }
                .print-cal-item-error { background: #fff1f2 !important; border-color: #fecdd3 !important; color: #9f1239; }
                .print-cal-item-primary { background: #f0fdfa !important; border-color: #ccfbf1 !important; color: #115e59; }

                /* Each generated page forces a break -- except the last one, which would
                   otherwise push the footer onto a blank trailing page. Two selectors so this
                   holds however the pages happen to be wrapped. */
                .print-page { page-break-after: always; }
                .print-page:last-of-type { page-break-after: auto; }
                .print-page:not(:has(~ .print-page)) { page-break-after: auto; }
                .print-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; page-break-inside: avoid; page-break-before: avoid; }
                .doc-toolbar { position: fixed; top: 16px; right: 16px; z-index: 50; display: flex; align-items: center; gap: 10px; }
                .doc-hint { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; color: #b45309; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 8px 12px; }
                .doc-toolbar button { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; color: #fff; background: ${themeColor}; border: 0; border-radius: 10px; padding: 10px 16px; cursor: pointer; box-shadow: 0 6px 16px rgba(15,23,42,0.25); }
                @media print { .doc-toolbar { display: none !important; } }
                /* The zero margin exists so a cover page can bleed to the paper
                   edge. A document with no cover -- the sitter sheet, the week,
                   the shopping list -- would otherwise have that applied to its
                   first page of actual content, which is why those three printed
                   flush to the edge while everything else looked right.

                   Deliberately no page size here. Declaring one pins Chrome's
                   Layout control so the reader cannot switch to landscape, and a
                   wide table is exactly when they would want to. The toolbar
                   says so instead, and it does not print. */
                @media print{ @page { margin: 0.4in; } ${coverHtml ? '@page :first { margin: 0; }' : ''} body { max-width: 100%; padding: 0; margin: 0; } }
                </style></head><body><div class="doc-toolbar">${landscape ? '<span class="doc-hint">Wide tables &mdash; choose <b>Landscape</b> in the print dialog</span>' : ''}<button onclick="window.print()">Print / Save as PDF</button></div>${coverHtml}${contentHtml}<div class="print-footer">${escapeHtml(title)} &bull; Prepared ${escapeHtml(new Date().toLocaleDateString())}${edLine ? ' &bull; ' + escapeHtml(edLine) : ''} &bull; Emergency Vault v${APP_VERSION}</div></body></html>`;
            }

            // Print, or hand the owner a file they can keep and email.
deliverDocument(title, html, nameHint) {
                if (this.printMode === 'download') {
                    const stamp = new Date().toISOString().split('T')[0];
                    const base = String(nameHint || title).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Document';
                    this.downloadFile(`${base}_${stamp}.html`, html, 'text/html;charset=utf-8');
                    this.showToast('Document saved. Open it any time, or print it to PDF.');
                    return;
                }
                this.printDocument(html);
            }

            // Renders into a hidden iframe instead of window.open, so nothing
            // depends on the buyer's popup blocker being switched off.
printDocument(html) {
                const existing = document.getElementById('print-frame');
                if (existing) existing.remove();

                const frame = document.createElement('iframe');
                frame.id = 'print-frame';
                frame.setAttribute('aria-hidden', 'true');
                frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
                document.body.appendChild(frame);

                const doc = frame.contentWindow.document;
                doc.open();
                doc.write(html);
                doc.close();

                const trigger = () => {
                    try {
                        frame.contentWindow.focus();
                        frame.contentWindow.print();
                    } catch (err) {
                        this.showToast('Printing was blocked by this browser.', 'error');
                    }
                    setTimeout(() => frame.remove(), 60000);
                };
                // Give webfonts and layout a beat before the print dialog opens.
                if (frame.contentWindow.document.readyState === 'complete') setTimeout(trigger, 400);
                else frame.onload = () => setTimeout(trigger, 400);
            }

            // Does this document contain a table too wide for portrait Letter?
            // Asked once, up front: switching orientation mid-document forces a
            // page break at every switch, which turned an eight-page binder into
            // eighteen with half of them near-empty. One orientation throughout.
needsLandscape(sectionKeys, includeCheckboxes) {
                return sectionKeys.some(key => {
                    const config = SECTIONS[key];
                    if (!config || !Array.isArray(config.fields)) return false;
                    return this.printableFields(config).length + (includeCheckboxes ? 1 : 0) >= WIDE_TABLE_COLUMNS;
                });
            }

            // ---- Home documents -------------------------------------------
            // Three papers a home binder exists to produce. Each is written to
            // be handed to somebody else -- an adjuster, an accountant, a
            // house-sitter -- so each states plainly what it is and is not.
printCover(emoji, title, subtitle, extra) {
                return `
                    <div class="cover-page">
                        <div style="font-size: 80px; margin-bottom: 24px;">${emoji}</div>
                        <h1>${escapeHtml(title)}</h1>
                        <p style="font-size: 16px; color: #818cf8; margin-bottom: 10px; font-weight: bold;">${escapeHtml(subtitle)}</p>
                        ${extra ? `<p style="font-size: 15px; color: #a5b4fc; margin: 0 0 10px 0;">${escapeHtml(extra)}</p>` : ''}
                        ${this.ownerLine() ? `<p style="font-size: 16px; color: #c7d2fe; margin-top: 20px;">Owner(s): ${escapeHtml(this.ownerLine())}</p>` : ''}
                        <div style="margin-top: auto; padding-top: 40px;"><p style="font-size: 14px; color: #a5b4fc; margin: 0;">Generated: ${escapeHtml(new Date().toLocaleDateString())}</p></div>
                    </div>`;
            }

printSignatureBlock(left, right) {
                return `
                    <div style="margin-top: 40px; display:flex; justify-content:space-between; page-break-inside: avoid;">
                        <div style="width:45%; border-top:1px solid #cbd5e1; padding-top:10px;"><p style="font-size:12px; color:#64748b; margin:0;">${escapeHtml(left)}</p></div>
                        <div style="width:45%; border-top:1px solid #cbd5e1; padding-top:10px;"><p style="font-size:12px; color:#64748b; margin:0;">${escapeHtml(right)}</p></div>
                    </div>`;
            }

printTotalRow(label, amount, muted) {
                return `<div style="display:flex; justify-content:space-between; align-items:baseline; border-top: 2px solid ${muted ? '#94a3b8' : '#0f172a'}; padding-top: 8px; margin: -18px 0 30px 0;">
                    <span style="font-size:12px; font-weight:700; color:#475569;">${escapeHtml(label)}</span>
                    <span class="number-font" style="font-size:${muted ? '17' : '19'}px; font-weight:800; color:#0f172a;">${escapeHtml(formatMoney(amount))}</span>
                </div>`;
            }

printColumnWidths(fields, includeCheckboxes) {
                const weights = fields.map(f => {
                    const label = this.printLabelFor(f);
                    const longestWord = label.split(/\s+/).reduce((n, w) => Math.max(n, w.length), 0);
                    const base = f.type === 'select'
                        ? this.selectColumnChars(f)
                        : (this.PRINT_COL_CHARS[f.type] || 14);
                    return Math.max(base, longestWord + 2, label.length * 0.85);
                });

                const checkbox = includeCheckboxes ? 4 : 0;
                const total = weights.reduce((a, b) => a + b, 0);
                const share = 100 - checkbox;

                let html = '<colgroup>';
                if (includeCheckboxes) html += `<col style="width: ${checkbox}%;">`;
                weights.forEach(w => {
                    html += `<col style="width: ${(w / total * share).toFixed(2)}%;">`;
                });
                return html + '</colgroup>';
            }

            // A select column is only as wide as its own longest option, which
            // the config already knows. Capped, so one verbose option cannot
            // swallow the table.
selectColumnChars(f) {
                const longest = (f.options || []).reduce((n, o) => Math.max(n, String(o).length), 0);
                return Math.min(Math.max(longest * 0.8, 14), 20);
            }

            // Photo counts are meaningless on paper and cost a whole column;
            // the Photo Record document is where photos belong.
printableFields(config) {
                return config.fields.filter(f => f.type !== 'attachments');
            }

            // The printed header a field gets. Form labels are written to be
            // unambiguous while you are typing into them ("Adds to cost basis?");
            // a column header has inches to work with, so the verbose ones carry
            // a shorter twin.
printLabelFor(f) {
                return f.printLabel || f.label.split('(')[0].trim();
            }

printCellHtml(item, f, sectionKey) {
                const raw = item[f.name];
                if (raw === null || raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0)) return '<td>-</td>';
                if (f.type === 'url') {
                    const safe = /^https?:\/\//i.test(String(raw)) ? String(raw) : '';
                    return safe
                        ? `<td><a href="${escapeHtml(safe)}" style="color: #4f46e5; text-decoration: underline;">Link</a></td>`
                        : `<td>${escapeHtml(raw)}</td>`;
                }
                const text = this.displayValue(item, f, sectionKey);
                const mono = f.type === 'number' || f.type === 'date' || f.type === 'time';

                // A printed schedule handed to a contractor or a house-sitter has
                // to say what is late without them doing the arithmetic.
                const cfg = SECTIONS[sectionKey];
                let note = '';
                if (f.type === 'date' && cfg && Array.isArray(cfg.dueFields) && cfg.dueFields.includes(f.name)) {
                    const status = this.dueStatus(item, sectionKey);
                    if (status && (status.tone === 'rose' || status.tone === 'amber')) {
                        const colour = status.tone === 'rose' ? '#be123c' : '#b45309';
                        note = `<div class="due-note" style="color:${colour}">${escapeHtml(status.label)}</div>`;
                    }
                }
                return `<td${mono ? ' class="num"' : ''}>${escapeHtml(text)}${note}</td>`;
            }
