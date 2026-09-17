# Next up

Written 17 Sep 2026, from Bex's list. Nothing here is started.

## 1. Editing and deleting tags

There is no way to fix a typo'd tag. Tags are only editable per piece, in the
edit form's comma-separated field, so a `wnter` sits in the Outfits and Faves
panels until every piece carrying it has been edited by hand.

Wanted: rename and delete a tag from the chip itself — long-press, the same
gesture that starts a selection in the wardrobe — rewriting it across every
item in one write.

## 2. Expanding the featured outfit

The lead card on Outfits does not expand. Tapping it toggles
`expandedComboKey`, which the grid honours but the hero does not draw, so the
piece list, Hide this combo and the way to each piece are all unreachable from
the one outfit the page leads with.

## 3. A piece tapped in a list should open, not just navigate

This reverses part of `6133fe0`. Tapping a piece under an outfit or a capsule
currently takes you to the wardrobe on its category, scrolls to it and outlines
the tile. Bex wants it to go there **and open the piece** — the wardrobe tab
with the detail sheet up, rather than landing behind it.

`openPieceInWardrobe` already did this; the `openModal(itemId)` call was taken
out. Put it back, keep the scroll and the outline underneath.

## 4. Remove the "outfits with this piece" count

`#m-outfit-count-line`, in the sheet `findOutfitsWithPiece` opens — the last
combination count left, after the Outfits page lost its own. (`#saved-count-line`
and `#archive-count-line` still print theirs; she has not asked about those.)

## 5. "New capsule with this piece" → "New capsule"

In the capsule picker on a piece's detail sheet. The label explains itself from
where it is.

## 6. Confirmation before archiving or deleting

Inconsistent today:

- **A piece, from the edit sheet** — archives immediately, undo on the toast.
- **A selection of pieces** — asks ("Delete N items?"), then undo on the toast.
- **A capsule** — asks, then undo on the toast.
- **Hiding a combination** — immediate, undo on the toast.

Wanted: a confirmation everywhere something is taken away. Worth deciding
whether the undo stays as well or whether confirming replaces it — two
safety nets on one action is a tap that means nothing.

## 7. Remove "Remove shoes"

On an expanded outfit under Faves. "Change shoes" already opens a picker whose
first option is **No shoes**, so the second button is a second way to do the
same thing.
