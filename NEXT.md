# Next

Ideas parked, not started.

## Stick the wardrobe's category row to the top as you scroll

Scrolling eighty tiles loses the tab row off the top, so switching from
Tops to Jackets means scrolling all the way back up first. Sticking it
under the page head would keep it a tap away wherever you are in the grid.

- The select mode already does this with `.page-head.selecting` —
  `position:sticky; top:0`, with `margin-top:calc(var(--page-top) * -1)` so
  the bar sits where it will sit once stuck rather than dropping the page's
  top padding the moment you move. Same trick applies.
- Open question: does the page title stick too, or scroll away and leave
  the tabs alone at the top? Title plus tabs is ~78px of fixed height on a
  390px screen, which is a lot to give up permanently. Tabs alone probably.
- The row scrolls sideways, so its own horizontal scroll position wants
  keeping while it is stuck.
- Both cannot stick at `top:0` at once — check it against the select mode's
  sticky head.

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
