# Next

Ideas parked, not started.

## Keep the category row in reach while you scroll

Two places, one idea: the row of category chips should stay put instead of
scrolling off the top, so switching from Tops to Jackets does not mean
scrolling all the way back up first.

**The wardrobe grid** (`#tabs`). Eighty tiles is a long way back to the top.
Sticks under the page head, or in place of it.

**The capsule editor** (`#capsule-tabs`), picking pieces to add. This one is
half done already: `.sheet-header` is `position:sticky; top:0`, so the back
button stays put. The chips want to stick directly under it.

Notes for whoever picks this up:

- The two scroll in different things. The wardrobe scrolls the window; the
  capsule editor scrolls inside `.modal-backdrop` (`overflow-y:auto`).
  Sticky works in both, but the offsets come from different places.
- In the editor, the chips stick at the header's height, not at 0. Measure
  it into a custom property rather than hard-coding a number — the header
  is a back button plus 12px of padding either side, and any of that can
  move.
- Both rows sit inside a padded container, so a stuck row needs the
  negative-margin-plus-matching-padding trick to let its background reach
  the edges. The select mode already does exactly this:
  `.page-head.selecting` uses `margin:calc(var(--page-top) * -1) -16px …`
  so the bar sits where it will sit once stuck, rather than dropping the
  page's top padding the moment you move.
- Open question for the wardrobe only: does the page title stick too, or
  scroll away above the chips? Title plus chips is ~78px of permanently
  fixed height on a 390px screen. Chips alone, probably.
- Both rows scroll sideways, so their own horizontal position wants keeping
  while stuck.
- Nothing can share `top:0` with the select mode's sticky head — check that
  case.

## Open a piece without leaving the tab you were on

Tapping a piece listed under an outfit, a fave or a capsule currently calls
`openPieceInWardrobe`, which does `setMode('inventory')` — it throws you out
of the tab you were reading and onto the Wardrobe, changes `activeTab` to
the piece's category, clears any search, and scrolls the grid to the piece.
Going back leaves you on the Wardrobe, not where you came from.

What it should do instead:

- **Stay put.** Open the piece's sheet over the tab you are on. Faves stays
  Faves.
- **Back goes back.** Returning puts you on the same tab, at the same scroll
  position, with the same card still expanded.
- **Deeper follows the trail.** Anything the sheet leads to — Edit piece,
  Add to capsule, or tapping another piece under "Outfits with this piece" —
  should unwind one step at a time back along the way you came, not dump you
  at a top level.

That last point is the actual work: it needs a navigation stack rather than
today's single-slot `modalReturnItemId`.

### What a rewrite has to account for

- `#modal` is shared by everything — the detail sheet, the slot picker, the
  capsule editor, the accessories picker, the tag editor. A stack has to
  record which sheet to return to, not just which item.
- Per-tab state that has to be saved and restored: `scrollPositions` (keyed
  by mode, via `rememberScroll` / `restoreScroll`), and which card is open
  on each page — `expandedComboKey`, `expandedSavedKey`,
  `expandedCapsuleId`.
- `activeTab` and the search box are currently mutated on the way through.
  They should not be touched at all if we are not going to the Wardrobe.
- The capsule editor and the item form already guard against losing
  half-written work (`askToLeave`). A back-stack has to go through those
  guards, not around them.

### A live bug this should fix

Opening **any** piece's detail sheet silently overwrites the Outfits page's
filters, and the damage survives going back to that page.

`showOutfitsInModal` calls `lockFilterForPiece`, which does
`outfitFilters = emptySlotFilters()` and then pins the piece — so it can
render "Outfits with this piece" inside the sheet. Nothing ever puts back
what the Outfits page had.

Reproduced: set Jackets → None on Outfits, go to the Wardrobe, tap any
piece, then go back to Outfits. The Jackets filter is gone and the page is
pinned to `Tops: [that piece]` instead, with the pill reading "Filters 1"
as though you had asked for it.

The fix belongs with the work above — the sheet needs its own filter state
rather than borrowing the page's — but it is worth doing on its own if this
gets deferred again.
