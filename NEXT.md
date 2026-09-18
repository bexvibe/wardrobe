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

## See it on — generated try-on images

Decided: a real photo of Bex as the base, and the outfit generated onto it
by an image model. Generated on demand from a "See it on" button, not built
up front — most of the 35,224 combinations are not worth looking at.

### The shape of it

1. **One base photo**, uploaded once: front-on, full body, underwear,
   background removed. `remove-background.py` already does the removal.
2. **Outfit card gets a "See it on" button.** Tapping it sends the base
   photo and the outfit's garment cut-outs, in worn order, to a serverless
   route, which calls the image provider and returns a composite.
3. **Cached forever, keyed by `combo_key`.** An outfit is the same clothes
   every time, so an image never needs regenerating — only if the base
   photo changes.
4. The card shows the generated image once there is one, the flat-lay
   until then.

### Where the photo goes — do not get this wrong

The `wardrobe-uploads` bucket is **private** (`public: false`), served
through `createSignedUrl` with a TTL. That is where the base photo belongs,
via the normal upload path.

The 70 cut-outs in `wardrobe-photos/` are **not** in that bucket — they are
static files in the repo, served publicly by Vercel to anyone with the URL.
A photo of yourself in your underwear must never go there, and must never
be committed. Upload it through the app so it lands in the bucket like any
other uploaded photo.

Also worth deciding deliberately rather than by accident: the base photo
gets sent to whichever image provider you pick, and their retention and
training terms are then the terms your photo lives under. Worth reading
before the first upload rather than after.

### Schema

- `base_photos (id, photo_path, label, created_at, archived_at)` — plural,
  so there can be a summer one and a winter one, and so replacing one does
  not destroy the old. Mirrors how `items.photo_path` already works.
- `tryon_images (combo_key text primary key, image_path text not null,
   base_photo_id text not null, created_at)`.
  - Keyed by `combo_key`, not by saved outfit, so an image survives
    un-faving and works for outfits that were never kept.
  - `base_photo_id` so swapping the base photo invalidates the cache
    without deleting anything — the old images stay with the old body.
- Feature-flag it the way tags, capsules and extras already are:
  `tryonAvailable`, set from whether the column exists, so the button stays
  hidden until the migration has been run.

### The serverless route

The app is a static file with no server, so this is the first `/api` route
(there is no `api/` directory yet). Vercel supports it.

- The provider key lives in a Vercel environment variable. It cannot go in
  `config.js` — that file is public.
- **The route must check the caller is signed in.** Pass the Supabase access
  token, verify it server-side. Without that, anyone who finds the URL can
  spend your image credits. Easy to leave until later and then forget.
- Garment order comes from `outfitLayout` — the app already knows what goes
  over what.
- Most try-on models take one garment at a time, so this is likely a chain:
  base → bottom → top → jumper → jacket → shoes, each pass feeding the next.
  Each pass costs money and degrades the image slightly, which is the main
  thing to evaluate.

### Interface notes

- Generation takes seconds to tens of seconds. It needs a real pending
  state on the card, and it has to survive navigating away and coming back
  — write the row when it finishes, not when the sheet is still open.
- A failed generation is a toast, not a lost outfit. The flat-lay stays.
- The generated image wants to be the thing you see on an expanded card and
  on the hero. The grid stays flat-lay: 35,000 photographs of a person is
  slower to scan than 35,000 flat-lays, not faster.

### What is actually available (researched Sept 2026)

Two routes, and they fail in different directions.

**A general image model, one call, every garment at once.** Gemini 3.1
Flash Image ("Nano Banana 2") takes multiple reference images and
synthesises them into one output, holding coherence across up to 5
characters and 14 objects. Around $0.039 per image at 1024px on the 2.5
generation. One call for a whole outfit, so no chaining.

  The catch is fit. The FitVTON paper scores Nano Banana at 2.82 against
  3.08 for dedicated try-on models, and found it produces a "neutral fit"
  whatever body and size it is told about — fit does not come from prompts.
  Reviewers put it as better for creative previews than accurate fitting.

**A dedicated try-on API, one garment per call, chained.** FASHN v1.6 takes
exactly one `garment_image` with a category of tops / bottoms / one-pieces,
and cannot composite several. A full outfit is base → bottom → top →
jumper → jacket, each pass feeding the next. ~$0.075 per image on demand,
under $0.05 at volume — so roughly $0.30 for a four-layer outfit, about
eight times the single-call route. Ranked best in category for garment
drape accuracy in 2026, but output is 576x864, which is low.

  The catch is the chaining itself, and it is documented rather than
  theoretical: an error in an earlier stage propagates into later ones, and
  degradation with more references is universal — shape distortion,
  altered textures, colour drift from the reference. A four-layer outfit is
  exactly the hard case.

**Purpose-built multi-garment products exist but are thin.** WaveSpeed's
outfit try-on takes up to 8 garment images per request, though it returns
video. Kling's IMAGE 3.0 Omni combines a person photo with several
clothing references. Outfit-level try-on is an active research front right
now — Garments2Look (CVPR 2026) is the *first* large-scale multi-garment
dataset — which is why the commercial options are so sparse. Expect this to
be better in a year.

### Two things to get right whatever you pick

- **Paid tier, not free.** On Gemini's free tier your prompts and responses
  are used to improve Google's models; on pay-as-you-go they are not. For a
  photo of yourself in your underwear that is not a detail.
- **These move fast.** Gemini 2.5 Flash Image is already deprecated and
  shuts down on 2 October 2026. Whatever the route, the provider call wants
  to sit behind one function so swapping it is an afternoon.

### The test that decides it

One base photo. Three outfits — one simple (top + pants), one layered
(top + pants + jumper + jacket), one dress. Run each down both routes and
put the six results side by side.

What to look at, in order: does it still look like you; do the clothes look
like *your* clothes rather than similar ones; does the four-layer one
survive. If the single-call route holds up, it is eight times cheaper and
one call instead of five. If it does not, the question is whether chained
fidelity is worth 5x the calls and a 576x864 ceiling.

