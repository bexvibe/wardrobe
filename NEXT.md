# Next

Ideas parked, not started.

## Stick the wardrobe's category row to the top as you scroll

Scrolling eighty tiles loses the tab row off the top, so switching from
Tops to Jackets means scrolling all the way back up first. Sticking it
under the page head would keep it a tap away wherever you are in the grid.

Notes for whoever picks this up:

- The select mode already does this with `.page-head.selecting` —
  `position:sticky; top:0`, with `margin-top:calc(var(--page-top) * -1)` so
  the bar sits where it will sit once stuck rather than dropping the page's
  top padding the moment you move. Same trick applies.
- Open question: does the page title stick too, or scroll away and leave
  the tabs alone at the top? Title plus tabs is ~28px + 50px of fixed
  height on a 390px screen, which is a lot to give up permanently. Tabs
  alone probably, with the title scrolling off above them.
- The row scrolls sideways, so its own horizontal scroll position wants
  keeping while it is stuck — and it must not get caught by the filter
  panel's dismiss-on-scroll listener (`watchForSheetDismiss`), though the
  wardrobe has no filter panel, so that is only a worry if one returns.
- Worth checking against the select mode's sticky head: both cannot stick
  at `top:0` at once.
