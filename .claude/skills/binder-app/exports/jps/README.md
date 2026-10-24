# Exports for the `sellable-html-app` (JPS) skill

Files written here are meant to be copied into that skill, not used from this
one. They are the reverse direction of the port: things the binder family does
better, written up in JPS's terms.

| File | Goes to | Why |
|---|---|---|
| `print-engine.md` | `references/print-engine.md` | JPS prints the screen; the binder family builds a separate document with a cover page, a picker and measured column widths. Worth having wherever the buyer shows the output to someone else. |

Also worth patching by hand, no file needed:

- **`references/packaging.md` §5** — the device claim. iOS Safari will not open
  a downloaded `.html` file at all, so "works on Mac and PC in Chrome, Edge,
  Safari and Firefox" is right but incomplete; the listing should say *not
  designed for phones or tablets* unless a hosted copy is part of the product.
  This claim being wrong generated a correction across a whole listing kit.
- **`references/architecture.md`** — restore-by-merge. JPS backs up and
  restores; the binder family merges two backups by content fingerprint,
  re-ids collisions and remaps entity references, so two half-filled devices
  combine instead of one overwriting the other.
