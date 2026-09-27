# The Archive — handover

Written 27 Sep 2026. Pass one of the thumb-reach work is done, green and
committed. Pass two — the four editors — has not been started.

---

## The idea being built

Everything you touch should be in reach of one thumb, at the bottom of the
screen. The rule that keeps it from collapsing into "cram it all at the
bottom":

> **Things you read can live high. Things you touch must live low.**

Titles, counts, empty-state lines and the outfit photos stay where they
are. Controls come down.

A measurement made this concrete. With the filter panel open, only 2 of 22
controls sat above the 45% line, and both belonged to the page behind it —
the panel was already right. Then tapping a piece chip opened a
full-screen, top-anchored sheet with **Back at 12px in the top-left
corner**, the hardest point on the screen to reach. That was the whole gap.

### The finding that drove the design

Auditing every sheet: the live/staged convention was already consistent —
sheets that stage have a Save, sheets that apply live have none. The
inconsistency was elsewhere and it was total:

> **Every commit was at the bottom. Every exit was at the top-left.**
> The control you always need was in the hardest place; the one you
> sometimes need was in the easiest.

So the exit joins the commit at the foot of the sheet.

---

## Decisions made (all confirmed with Bex)

### Which sheets stage and which apply live

| Sheet | Applies | Bottom bar | Drag to close | Done? |
|---|---|---|---|---|
| Filter picker (tap a piece chip) | **live** | `Done` | yes | ✅ pass one |
| Add accessories | **staged** (changed) | `Cancel` · `Save` | no | ✅ pass one |
| Piece → capsules | **staged** (changed) | `Cancel` · `Save` | no | ✅ pass one |
| Piece detail | read-only | none | yes | ✅ pass one |
| Item form | staged | `Cancel` · `Save piece` | no | ⬜ pass two |
| Outfit builder | staged | `Cancel` · `Save outfit` | no | ⬜ pass two |
| Capsule editor | staged | `Cancel` · `Save capsule` | no | ⬜ pass two |
| Tag editor | staged | `Cancel` · `Save` | no | ⬜ pass two |

Her reasoning where it matters:

- **Filter picker stays live** — "it's a temporary state, you can easily
  clear a filter". Nothing to commit, so the bar is one word.
- **Accessories became staged** — you are dressing an outfit, so you try a
  hat, then a different hat. Also retitled to **"Add accessories"**.
- **Capsule ticks became staged** — same shape as accessories.

### The rest

- **Sheets are 85% of the screen**, bottom-anchored, page peeking above.
  The strip of page is not decoration: on a picker it is where you watch
  the results change as you tap.
- **Top-left Back is removed** from every sheet in pass one. Pass two
  removes it from the editors.
- **Cancel left, Save right, pushed apart.** A right thumb falls on the
  right, so the safe side is the one that keeps your work. Cancel is drawn
  quiet; they are at opposite ends, not a tidy pair.
- **"Cancel", not "Discard"** — her call, the plainer word. This reverses
  an older rule that banned the word Cancel; `test_guard` section 8 now
  records the new one and why it changed.
- **Drag-down-to-close on live and read-only sheets only.** Anything
  holding a draft is dismissed deliberately through its bar.
- **A grip** (the little bar) is drawn only on sheets that answer the
  gesture. A handle on a sheet that ignores it is a lie.
- **"New capsule" from the capsule picker just asks for a name.** It used
  to open the whole capsule editor, which asked you to choose pieces when
  you were already holding one.
- **Read-only sheets get no bottom bar at all** — drag-down is the way out.
- **The piece sheet's actions stay in the body for now** (Edit / Add to
  capsule / Outfits with this piece). Revisit after living with it.

---

## Pass one — shipped

All in `index.html`.

- `.modal-backdrop` is a dim overlay; `.modal` is an 85% bottom sheet that
  slides up, scrolls internally, and has rounded top corners.
- `.modal` is a **flex column** and `.modal-body` is `flex:1 0 auto`, so a
  short sheet still puts its bar at the foot instead of halfway up.
- `.sheet-footer` is `position: sticky` inside the sheet (was `fixed` to
  the viewport). `.sheet-footer.split` lays Cancel and Save at opposite
  ends. Sticky is also in flow, so nothing can hide underneath it.
- `.sheet-grip` — the drag handle.
- Drag-to-close generalised: `wireDragToClose(el, isOpen, onClose)` now
  serves both the filter panel and the sheets. Each sheet calls
  `allowSheetDrag(fn)` as it draws, or `allowSheetDrag(null)`. `pushSheet`
  resets it to null so a sheet that forgets is merely undraggable.
- `openSlotPicker` — grip, `Done`, no Back, draggable.
- `openOutfitExtrasPicker` — `extrasDraft`, "Add accessories", Cancel/Save,
  not draggable. `toggleOutfitExtra` writes to the draft only.
- `drawItemCapsulePicker` — `capsulePicksDraft`, Cancel/Save, not
  draggable. `saveItemCapsules` writes only what changed.
- `startNewCapsuleForPiece` — uses the new `promptForText` dialog.
- `promptForText` / `#prompt-backdrop` — a one-line text dialog, sibling of
  the confirm dialog. Enter submits. `onConfirm` returns `false` to keep it
  up with an error showing.
- `drawItemSheet` — grip, no Back, draggable via `goBackFromSheet`.
- `closeModalIfBackdrop` now asks about `extrasDraft` and
  `capsulePicksDraft` too.

Three real bugs the change introduced and the suites caught, all of the
same shape — **the sheet is the scroller now, not the backdrop**:

- `stickSheetTabs` was watching the backdrop, so a picker's category row
  never knew it had stuck. It also now parks the row at the sheet's top
  when there is no header to park it under.
- `openPieceSheet`'s "tap the piece you are already on to go back up to it"
  scrolled the backdrop, which no longer moves.
- A short sheet floated its bar mid-screen until `.modal` became a column.

A fourth was of the same family but the suites did not catch it, so it has
a test now (`test_place` section 6): stepping deeper rebuilds the sheet you
left, so `pushSheet` notes its scroll on the trail and `restoreSheetScroll`
puts it back — it keeps asking for up to 40 frames, because what decides a
piece sheet's height (the outfits under it) arrives after the redraw, and
it gives up the moment you touch the sheet.

---

## Pass two — not started

The four editors: item form, capsule editor, outfit builder, tag editor.
They already inherit the 85% sheet shape (that change was global) and they
already have bottom Saves. What is left:

- Add `Cancel` to each bar, `.split` layout, verbs as in the table above.
- Remove their top-left Back.
- Leave the tag editor's **Delete tag** in the body — destructive, and not
  the same act as Cancel.
- **The item form lives on `#form-backdrop`, not `#modal-backdrop`** — its
  wiring is separate. Check it.
- `test_guard` section 9 asserts the editors *still* say Back at the top.
  It is there to fail when pass two lands: that is the signal to fold those
  checks into section 8 beside the pickers.
- **Untested risk: the keyboard.** A bottom bar can sit behind the iOS
  keyboard. The footer is `sticky` inside a scrolling sheet now, which
  should behave better than `fixed` did, but this has only been checked in
  desktop Chromium. Test on a real phone before trusting it.

---

## How to work on this project

- One file: `index.html`. Static app on Vercel, Supabase behind it.
- `node tests/run.js` — 44 suites, 4-way parallel, ~290s. Needs
  `NODE_PATH=/opt/node22/lib/node_modules` and a static server on **8933**
  (`python3 -m http.server 8933`).
- `node tests/run.js chips wand` runs a subset.
- Tests drive the real UI against a fake Supabase (`tests/fake-supabase.js`).
  The fake pins the shuffle seed so suites are deterministic;
  `window.__SESSION_SEED` deals a different hand.
- `tests/nav.js` holds the shared ways around: `toFaves`, `toAll`, and
  `leaveSheet`, which leaves whichever sheet is up by whichever control
  that sheet actually has. A suite that is *about* the leaving still
  reaches for the control it means.
- `node --check` does **not** catch bugs in generated markup. Several real
  bugs this project has shipped were only visible in a screenshot. Drive
  the app and look at it.
- Supabase project `rztcuxisilabybedscwn`. Migrations are paste-able files
  in `supabase/`.
- Photos: `scripts/remove-background.py` → `wardrobe-photos-originals/` →
  `scripts/optimise-photos.py` → 600px WebP in `wardrobe-photos/`. Give a
  replacement photo a **new filename** — served photos are cached immutable.

---

## Recently shipped (for context)

- Faves folded into Outfits as a switch in the bottom bar (`Outfits` + a
  heart). One filter state across both halves; hidden means hidden in both.
- Accessories moved out of `saved_outfits` into an `outfit_extras` table
  keyed by `combo_key`, so any outfit can be dressed without being kept.
- Both outfit lists deal in a different order each visit, from a seed in
  `sessionStorage`. A wand button (`--brand` violet, Material
  `wand_stars`) deals again on demand.
- The heart is drawn SVG, not a font glyph — `♥`/`♡` are in neither Work
  Sans nor Fraunces and were being substituted differently per device.
- Filters open as a popover above their own button; the button stays put
  and its arrow turns over.
