# Design system

Everything here was measured in the shipped Emergency Vault and Homeschool Hub,
not invented. Class counts are from both files together. Copy these patterns
rather than inventing near-misses — a binder that is 90% consistent reads as
unfinished, and the buyer is comparing it to software they already pay for.

The look: **a tinted canvas, white cards that float on it, one accent colour the
buyer chooses, and slate for everything else.**

## Colour

### The theme accent

Five themes, each a full 50–900 ramp:

```js
const THEMES = {
  indigo:  { 50:'#eef2ff', …, 500:'#6366f1', 600:'#4f46e5', …, 900:'#312e81' },
  teal: …, emerald: …, rose: …, amber: …
};
```

Switching a theme sets ten CSS custom properties on `:root` and re-renders:

```js
setColorTheme(name) {
  const c = THEMES[name]; if (!c) return;
  Object.keys(c).forEach(s =>
    document.documentElement.style.setProperty(`--theme-${s}`, c[s]));
  storage.set(PREFIX + 'ColorTheme', name);
  this.reRenderCurrentSection();
}
```

Tailwind's `primary-*` is wired to those variables in the build config, so
`.text-primary-600 { color: var(--theme-600) }`. **Write `primary-600`, never
`indigo-600`.** A hard-coded palette colour is the single most common way a new
screen stops following the theme switcher, and it is invisible until someone
switches.

| Use | Token |
|---|---|
| Primary button, active nav, links | `primary-600`, hover `primary-700` |
| Icon on a tinted chip | `primary-600` on `primary-50` |
| Dark mode accent | `primary-500` / `primary-400` |
| Everything structural | `slate-*` |

### Slate, and the two surfaces

- **Canvas** `#eef1f7`, with two very soft radial washes in `--theme-100` and
  `--theme-50` (fixed attachment). This is what makes white cards read as
  raised. In dark mode the canvas is `#0b1220` and the washes drop to ~10%.
- **Card** white, or `darkCard` (`#1e293b`) in dark mode.
- Borders `slate-200` / `slate-800`; muted text `slate-500`; body text
  `slate-700` / `slate-300`; headings `slate-900` / white.

### Semantic colour

Status colour is a **badge**, never the row. Red for overdue, amber for due
soon, green for done, slate for undated. Always pair the colour with a word —
"Overdue", not a bare red dot. A binder is printed in black and white at least
as often as it is read on screen.

## Type

Three faces, inlined as base64 woff2 in `<style id="binder-fonts">`
(`build-and-offline.md`), so screen and print match with the network cut:

| Face | Class | Where |
|---|---|---|
| **Inter** | default on `body` | everything |
| **Merriweather** | `.serif-font` | card titles and printed headings |
| **JetBrains Mono** | `.number-font` | every number, with `tabular-nums` |

`tabular-nums` is not decoration. Without it a column of amounts does not line
up, and a binder is mostly columns of amounts and dates.

Measured scale — the app is built almost entirely from two sizes:

| Size | Uses | Where |
|---|---|---|
| `text-sm` | 241 | body, table cells, buttons |
| `text-xs` | 120 | labels, meta, badges |
| `text-lg` | 111 | card titles |
| `text-xl` → `text-4xl` | 51 total | page titles and KPI numbers only |

Field labels are their own thing, and always this:

```html
<label class="block text-xs font-bold text-slate-700 dark:text-slate-300
              mb-1 uppercase tracking-wider">
```

## Shape and depth

| Token | Count | Use |
|---|---|---|
| `rounded-xl` | 147 | buttons, inputs, chips — the default |
| `rounded-lg` | 75 | small internal elements, icon tiles |
| `rounded-2xl` | 70 | **cards only** |
| `rounded-full` | 24 | avatars, badges, icon circles |
| `shadow-sm` | 213 | everything raised |
| `shadow-md` | 10 | primary action buttons, modals |

Depth comes from the border plus `shadow-sm`, not from heavy shadows. Two
levels of elevation is the whole system.

Spacing: `gap-2` (106) and `gap-3` (57) dominate, `gap-4` (41) between cards,
`gap-6` for page sections. Card padding is `p-5` or `p-6`.

## Components

### Card

```html
<div class="bg-white dark:bg-darkCard rounded-2xl border border-slate-200
            dark:border-slate-800 overflow-hidden shadow-sm">
  <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800
              bg-slate-50 dark:bg-slate-900/50">
    <h3 class="font-bold text-slate-900 dark:text-white flex items-center
               gap-2 text-lg serif-font">
      <i class="ph ph-folder text-primary-500"></i> Title
    </h3>
  </div>
  …
</div>
```

The tinted header strip is what separates these cards from generic Tailwind
cards. Use it whenever the card has a title.

### Clickable card

Adds `cursor-pointer hover:border-primary-300 dark:hover:border-primary-700
transition-colors group`. The border takes the accent on hover; the card does
not lift or scale.

### Buttons

```html
<!-- primary -->
<button class="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white
               rounded-xl text-sm font-bold shadow-sm transition-colors">

<!-- secondary -->
<button class="px-4 py-2 bg-white dark:bg-darkCard border border-slate-200
               dark:border-slate-700 text-slate-700 dark:text-slate-200
               text-sm font-semibold rounded-xl">
```

One primary action per screen. Destructive actions are secondary buttons with
`text-rose-600`, and always go through a confirm.

### Inputs

```html
<input class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border
              border-slate-300 dark:border-slate-600 rounded-xl text-sm
              focus:border-primary-500 outline-none">
```

Inputs are *recessed* (`slate-50`) against the white card — the inverse of the
card against the canvas. Focus moves the border to the accent.

### Icon chip

The repeated unit in lists and onboarding:

```html
<div class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-slate-800
            text-primary-600 dark:text-primary-400 flex items-center
            justify-center shrink-0">
  <i class="ph ph-file-text"></i>
</div>
```

Sizes in use: `w-9 h-9` inline, `w-10 h-10` in cards, `w-12 h-12` for a
section hero. `shrink-0` always — without it the icon squashes next to a long
title, which has shipped.

### Sidebar

```html
<aside id="sidebar" class="w-64 bg-slate-900 border-r border-slate-800
       flex flex-col h-full transition-all duration-300 absolute md:relative
       z-20 transform -translate-x-full md:translate-x-0 shadow-xl">
```

Always dark, even in light mode — it anchors the page and makes the canvas look
lit. 256 px, off-canvas below `md` with a backdrop. Groups come from
`NAV_GROUPS`; the active item takes the accent; a count badge sits right:

```html
<span class="ml-auto shrink-0 min-w-[20px] px-1.5 py-0.5 rounded-full
             bg-rose-500/20 text-rose-300 text-[10px] font-bold text-center">
```

### Modal

```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title"
     class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 hidden
            flex items-center justify-center opacity-0 transition-opacity p-4">
```

Every modal carries `role`, `aria-modal` and `aria-labelledby`, closes on Esc
and on backdrop click, and returns focus to whatever opened it. `p-4` on the
backdrop is what keeps it off the edges on a small laptop.

### Tables

Sortable headers:

```html
<th class="px-6 py-4 cursor-pointer hover:bg-slate-100
           dark:hover:bg-slate-800 transition-colors select-none">
```

Numbers go in `<td class="num">` — mono, `tabular-nums`, `whitespace-nowrap`.
A date or an amount is one atom and never wraps; `$24,5` over `00.00` is not a
smaller number, it is a wrong one.

Beyond `WIDE_TABLE_COLUMNS` (8) a table stops being readable on portrait
Letter. Hide columns before changing orientation.

### Empty states

Never an empty table. Centred icon chip, a sentence, and the button that fixes
it. Distinguish the three cases, because they need different sentences:
nothing added yet, nothing matching the filters, nothing matching the search
(quote the query back).

## Dark mode

Class-based (`.dark` on `<html>`), and **every** colour utility needs its pair.
A missing `dark:` is invisible until someone switches at night, and then it is
a white card in a dark room.

Check: canvas, cards, borders, muted text, inputs, badges, modal backdrop,
charts. Charts are the one people forget — Chart.js takes explicit colours, so
re-read them from the computed theme on switch rather than caching them.

## Motion

```css
@keyframes slideInUp { from { transform: translateY(10px); opacity: 0 } … }
.toast-enter { animation: slideInUp .3s cubic-bezier(.16,1,.3,1) forwards }
.fade-in     { animation: fadeIn .4s ease-out forwards }
```

Three animations total: toast in, toast out, section fade. Transitions are
`transition-colors` on hover, `duration-300` on the sidebar. Nothing bounces,
nothing scales.

All of it is disabled under `prefers-reduced-motion` and in print:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

## Icons

Phosphor, inlined as a base64 woff2, used as `<i class="ph ph-folder">`.

**Verify every icon name against the font's glyph list.** A name that does not
exist renders as a blank box, silently. `ph-room` and `ph-plus-bold` both
shipped that way.

## Print

Whatever theme is on, paper is paper: `@media print` resets `html.dark` and
everything under `#main-content` to a white background and dark ink (the
screen's own print, not the engine's documents, which have their own sheet).
Three binders printed black pages from dark mode before this rule.

The printed document has its own stylesheet and does not inherit any of this —
see `print-engine.md` and `assets/print-stylesheet.css`. The screen's print
rules only hide chrome:

```css
@media print {
  body { background: #fff !important; color: #000 !important }
  #sidebar, #topbar, .action-btns, #toast-container,
  [id$="-backdrop"], #lock-screen { display: none !important }
  #main-content { margin: 0 !important; padding: 0 !important; width: 100% !important }
}
```

## Checks before calling a screen done

1. No hard-coded palette colour where `primary-*` belongs — switch all five
   themes and watch.
2. Every colour utility has its `dark:` pair — switch to dark and look.
3. Numbers are `.number-font` and right-aligned; columns line up.
4. Cards side by side are the same height; `gap-4` between them.
5. One primary button.
6. Empty state for all three empty cases.
7. 390 px wide: no horizontal scroll, sidebar off-canvas, tables scroll inside
   their card rather than widening the page.
8. Status is a word plus a colour, never a colour alone.

Screenshot it and look. None of these checks catch *ugly*.
