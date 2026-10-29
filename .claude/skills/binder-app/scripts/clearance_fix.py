# Engine spacing and tap-target fixes found by device-check's clearance pass (Oct 2026, Caregiver Binder).
# Safe to run on any binder fork of the newest engine; each step says if it was already applied.
# usage: python3 clearance_fix.py App.html
import re, sys, os
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
done = []

def rep(a, b, label):
    global s
    if b in s and a not in s: return done.append(label + ': already')
    if a not in s: return done.append(label + ': NOT FOUND (engine differs, check by hand)')
    assert s.count(a) == 1, (label, s.count(a))
    s = s.replace(a, b); done.append(label)

# Card header: title and Edit/Duplicate/Delete share one row, so a long title never runs under the buttons.
rep('''                                <div class="absolute top-4 right-4 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20">
                                    ${this.rowActionsHtml(sectionKey, item.id, 'card')}
                                </div>
                                <h4 class="font-bold text-lg text-slate-900 dark:text-white mb-4 pr-24 border-b border-slate-100 dark:border-slate-800 pb-3 truncate relative z-10 serif-font" title="${escapeHtml(titleVal)}">${escapeHtml(titleVal)}</h4>''',
    '''                                <div class="flex items-start gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3 relative z-10">
                                    <h4 class="flex-1 min-w-0 font-bold text-lg text-slate-900 dark:text-white truncate serif-font" title="${escapeHtml(titleVal)}">${escapeHtml(titleVal)}</h4>
                                    <div class="card-actions shrink-0 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                        ${this.rowActionsHtml(sectionKey, item.id, 'card')}
                                    </div>
                                </div>''', 'card header row')
# The faint emoji in a card's corner is decoration: clipped on purpose.
rep('<div class="absolute -top-3 -right-2 text-6xl opacity-[0.05]', '<div data-cc-skip style="right:0" class="absolute -top-3 text-6xl opacity-[0.05]', 'watermark exempt, kept inside the card')
rep('<div data-cc-skip class="absolute -top-3 -right-2 text-6xl opacity-[0.05]', '<div data-cc-skip style="right:0" class="absolute -top-3 text-6xl opacity-[0.05]', 'watermark inside the card')
# A field label and its value: 8px apart, not 4.
rep('<span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">${escapeHtml(f.label.split', '<span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">${escapeHtml(f.label.split', 'card label gap')
n = len(re.findall(r'(<label class="block text-xs[^"]*?)\bmb-1\b', s))
s = re.sub(r'(<label class="block text-xs[^"]*?)\bmb-1\b', r'\1mb-2', s); done.append(f'form label gaps ({n})')
rep('<header id="topbar" class="h-20 ', '<header id="topbar" class="nogutter h-20 ', 'top bar is a full-width band')
rep('<aside id="sidebar" class="w-64 ', '<aside id="sidebar" class="nogutter w-64 ', 'sidebar is a full-height band')
s = s.replace('<span class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-primary-400">', '<span data-cc-skip class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-primary-400">'); done.append('active nav marker exempt')
s = s.replace('<thead>', '<thead data-cc-skip>') if '<thead data-cc-skip>' not in s else s; done.append('table heads exempt')
rep('<span class="${!isHidden ? \'translate-x-6\' : \'translate-x-1\'} inline-block h-4 w-4', '<span data-cc-skip class="${!isHidden ? \'translate-x-6\' : \'translate-x-1\'} inline-block h-4 w-4', 'switch knob exempt')
# Print & Share: the four buttons take a row of their own below 1280px under the heading at every width, instead of running off a tablet screen or squeezing the text into a narrow column.
rep('<div class="bg-white dark:bg-darkCard rounded-2xl border border-slate-200 dark:border-slate-800 p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm mt-8"', '<div class="print-share bg-white dark:bg-darkCard rounded-2xl border border-slate-200 dark:border-slate-800 p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm mt-8"', 'print and share row')
# Days from the next and last month: muted by background, not by fading the number past readable.
rep("const opacityClass = isFaded ? 'opacity-60 hover:opacity-100' : '';", "const opacityClass = '';", 'calendar faded days readable')
# Today's circle: white on the 600 shade, not the lighter 500.
rep("(isToday ? 'bg-primary-500 text-white w-7 h-7", "(isToday ? 'bg-primary-600 text-white w-7 h-7", 'today circle contrast')
# Coming Up: the print link wraps under the heading on a phone instead of running past the card.
rep('''<div class="flex items-center justify-between mb-4">
                                <div>
                                    <h3 id="coming-up"''', '''<div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                                <div>
                                    <h3 id="coming-up"''', 'coming up header wraps')
# Grid / table / calendar switch: a segmented control whose buttons fill its pill by design.
rep('<div class="flex items-center bg-white dark:bg-darkCard border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm shrink-0">', '<div data-cc-skip class="flex items-center bg-white dark:bg-darkCard border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm shrink-0">', 'view switch exempt')
rep('<span class="ml-2 px-2 py-0.5 ${tones[status.tone]}', '<span class="ml-2 px-2 py-1 ${tones[status.tone]}', 'due pill padding')
# Month grids run edge to edge by design (the layout pass skips them too).
rep('<div class="grid grid-cols-7 border-b border-slate-200', '<div data-cc-skip class="grid grid-cols-7 border-b border-slate-200', 'weekday row exempt')
rep('<div class="cal-grid grid grid-cols-7', '<div data-cc-skip class="cal-grid grid grid-cols-7', 'month grid exempt')

CSS = '''
/* clearance pass (device-check 2b): room and tap targets */
.jps-pal{width:76px;height:54px;padding:8px 8px 22px}.jps-pal span{bottom:5px}
.print-share{flex-direction:column!important;align-items:stretch!important}
.print-share > div:last-child{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));width:100%!important}
@media (max-width:1023px){#page-title{display:none!important}
  #header-action-btn-container .hidden.sm\\:inline{display:none!important}#header-action-btn-container .sm\\:hidden{display:inline!important}}
#page-title{margin-right:16px;white-space:nowrap}
#header-action-btn-container button{white-space:nowrap}
#main-content .p-6.flex:has(> button.px-5){flex-wrap:wrap;gap:12px}#main-content .p-6.flex > button.px-5{flex-shrink:0;white-space:nowrap}
#dashboard-trip-label{box-shadow:none;border-width:0!important;line-height:1.3;padding:4px 10px!important;display:inline-block;border-radius:999px}#owner-name-display{margin-top:8px}
#main-content .flex.items-center:has(> button.relative.inline-flex){gap:12px}#main-content .flex.items-center:has(> button.relative.inline-flex) > div{min-width:0}#main-content button.relative.inline-flex{flex-shrink:0}
@media (max-width:1279px){#main-content .grid:has(> .flex.items-center > button.relative.inline-flex){grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important}}
.sidebar-footer{padding:12px 16px 16px!important}
#nav-menu{padding-left:16px!important;padding-right:16px!important}
#dynamic-form label.block{margin-bottom:8px!important}
@media (max-width:1279px){#main-content .grid.md\\:grid-cols-2:has(> button.w-full.text-left){grid-template-columns:minmax(0,1fr)!important}}
/* contrast pass (device-check 4): Tailwind's slate grays are too light on the palette papers; use the palette's own inks */
html:not(.dark) .text-slate-300, html:not(.dark) .text-slate-400, html:not(.dark) .text-slate-500{color:var(--j-ink2)!important}
html.dark .text-slate-400, html.dark .text-slate-500, html.dark .dark\\:text-slate-400, html.dark .dark\\:text-slate-500, html.dark .dark\\:text-slate-600{color:var(--j-ink2)!important}
html.dark .dark\\:bg-primary-500{background-color:var(--theme-700)!important}
html.dark .text-slate-300, html.dark .dark\\:text-slate-600{color:var(--j-ink3)!important}
html.dark .text-slate-400, html.dark .text-slate-500, html.dark .dark\\:text-slate-400, html.dark .dark\\:text-slate-500{color:color-mix(in srgb, var(--j-ink2) 75%, #fff)!important}
html:not(.dark) .text-amber-600{color:#b45309!important}html:not(.dark) .text-rose-600{color:#be123c!important}
#dynamic-form div.p-3.bg-slate-50{padding:16px!important}
#nav-menu > div.sidebar-text{padding-bottom:8px!important}
#sync-join-form > * + *{margin-top:12px!important}
#main-content > div.h-full{height:auto;min-height:100%}
.sidebar-footer .sidebar-text > a + div{margin-top:8px}
@media (max-width:767px){#sidebar.-translate-x-full{visibility:hidden}}
@media (pointer:coarse){
  #main-content button:not(.jps-pal), #main-content select, #main-content input:not([type=checkbox]):not([type=radio]):not([type=color]),
  #modal-backdrop button, #modal-backdrop select, #modal-backdrop input:not([type=checkbox]):not([type=radio]):not([type=color]),
  #sidebar button, #topbar button, .nav-item{min-height:44px}
  #main-content button.p-1\\.5, #main-content button.p-2, #topbar button.p-2, #sidebar button.w-9, #close-sidebar, #open-sidebar{min-width:44px}
  #main-content button{min-width:44px}
  #modal-content > div.flex.items-center > button{min-width:44px}
  .card-actions button{min-width:44px;display:inline-flex;align-items:center;justify-content:center}
  #main-content button.text-xs, #sidebar .sidebar-text a, #main-content button.relative.inline-flex{position:relative}
  #main-content button.text-xs::after, #sidebar .sidebar-text a::after{content:"";position:absolute;inset:-14px 0}
  #main-content button.relative.inline-flex::after{content:"";position:absolute;inset:-10px 0}
}
'''
if '/* clearance pass (device-check 2b)' in s: done.append('css: already')
else:
    i = s.index('</style>', s.index('.jps-pal{position')); s = s[:i] + CSS + s[i:]; done.append('css')

open(p + '.tmp', 'w', encoding='utf-8').write(s); os.replace(p + '.tmp', p)
print('\n'.join(done))
