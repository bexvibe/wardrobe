# Starter catalogue

Generic cutouts (white tee, dark jeans, jandals...) a new user can tap to
fill their wardrobe without photographing anything.

| File | What it is |
|---|---|
| `items.json` | The 67 types / 130 colour variants. Edit this to add or remove items. |
| `prompts.md` | One prompt per variant, grouped by category. Generated, do not hand-edit. |
| `prompts.jsonl` | Same prompts for an API batch loop. |
| `raw/` | Drop downloaded images here, named `<id>.png` (id is the heading in prompts.md). |
| `catalogue.json` | Written by the process script: the picker's data. |
| `preview.png` | Written by the process script: contact sheet to eyeball results. |

## Steps

1. `python3 scripts/catalogue-prompts.py` (after any edit to items.json)
2. Generate the 5 **TEST** images from `prompts.md`, save into `raw/`.
3. `python3 scripts/catalogue-process.py` and open `preview.png`.
4. If they look good together, do the rest and re-run step 3.

Needs `pip install numpy pillow scipy`.

## Known limits

- A shadow in the generated backdrop is kept as part of the garment and is
  not flagged. The prompt forbids shadows; reject any image that has one.
- Generated images of the same prompt vary. Expect to redo roughly one in four.
