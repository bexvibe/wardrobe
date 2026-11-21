# Back, Close, Cancel: one meaning each

Agreed and applied: hero popup Close, outfit builder Cancel, wardrobe edit mode Done.

## The rule

| Word | Means | Use it when | Icon | Safe? |
|---|---|---|---|---|
| **Back** | Go up one step to the screen you came from | You are on a page or a layer reached from somewhere else (a sub-page in the Filters sheet, an item or outfit opened from a list) | Left chevron `‹` | Always: nothing is lost |
| **Close** | Put this overlay away; nowhere to go back to | A popup or sheet that stands on its own and has no unsaved input (the hero popup, the Filters sheet at its top level) | `×` or the word Close, no chevron | Always: nothing is lost |
| **Cancel** | Abandon what I was typing or building | A form, editor or prompt with a Save/Create button beside it | Word only | Discards input |
| **Done** *(optional fourth)* | Leave a mode I have been working in; changes already applied | Edit mode on the wardrobe | Word only | Keeps changes |

Test for any button: *Is there a screen to return to?* Back. *Is there unsaved work being thrown away?* Cancel. *Neither?* Close.

Your suggestion holds: Back is for going back to a page, Close is for closing a popup.

## Audit of today's screens

| Screen | Today | Should be | Why |
|---|---|---|---|
| Hero popup ("Try this outfit") | Back | **Close** | Standalone popup; Back now sits beside the new undo arrow and reads as "previous shuffle" |
| Filters sheet, category page (`filter-sheet-back`) | Back | Back | A real sub-page; returns to the list |
| Filters sheet, top level | "See N outfits" | keep | It is a Close with the result in its name; fine |
| Item page (`item-page-back`) | Back | Back | Returns to wherever it was opened from |
| Outfit page (`outfit-page-back`) | Back | Back | Same |
| Capsule page | Back | Back | Same |
| Archive page | `‹ Wardrobe` | Back | Names its destination; consistent with the rule |
| Outfit builder | Back (beside "Save as fave") | **Cancel** | It is a form with Save; leaving discards the build |
| Item form | Cancel | Cancel | Correct |
| Accessories picker | Cancel | Cancel | Correct |
| Capsule editor | Cancel | Cancel | Correct |
| Tag editor | Cancel | Cancel | Correct |
| Name prompt (`prompt-confirm`) | Cancel | Cancel | Correct |
| Wardrobe edit mode (`edit-back-btn`) | Back | **Done** | It exits a mode rather than going to a previous screen |
| Search | "Close search" | Close | Correct |

So four changes: hero popup Back to Close, outfit builder Back to Cancel, edit mode Back to Done, and keep the rest.

## Behaviour that goes with the words

- **Phone back gesture / browser back** follows the on-screen button of the top layer: it steps Back on pages, Closes a popup, and on a form with unsaved input asks before discarding (as Cancel would).
- **Tap outside / swipe down** on a popup or sheet is Close. On a form with unsaved input it should not silently discard.
- **Chevron only on Back.** A Close or Cancel button never carries a chevron, so the icon alone tells you which it is.
- **Order in a footer:** the leaving action on the left (Back / Close / Cancel), the forward action on the right (Save, Shuffle, See N outfits).

## Decision

Done stays, for edit mode.
