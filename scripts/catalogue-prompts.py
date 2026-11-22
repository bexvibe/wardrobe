"""
Expands catalogue/items.json into one image prompt per variant.

    python3 scripts/catalogue-prompts.py            # writes catalogue/prompts.md + prompts.jsonl
    python3 scripts/catalogue-prompts.py --test     # prints the 5 test prompts only

Workflow with a chat tool (ChatGPT, Gemini): paste a prompt, download the
image, save it as  catalogue/raw/<id>.png  (the id is shown above each
prompt). Then run scripts/catalogue-process.py.

Workflow with an API: prompts.jsonl has {"id", "prompt", "background"} per
line, one request each.

Why the prompt is so insistent about the background: the cutout step finds
the garment by looking for a flat colour around it. Any shadow, gradient or
floor texture comes through as part of the garment. Light garments (white,
cream, light denim) get a mid-grey backdrop instead of white, because a
white tee on a white background has no edge to find.
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CAT = os.path.join(ROOT, 'catalogue')

TEMPLATE = (
    "Product photograph of {desc}, {view}, centred, the whole item fully in frame "
    "with generous empty margin on every side. Neat and unwrinkled, no model, no "
    "mannequin, no hanger, no people. No logos, no text, no labels, no brand marks. "
    "Plain flat solid {bg_name} background ({bg_hex}), perfectly uniform: no shadow, "
    "no reflection, no gradient, no floor, no texture. Soft even studio lighting, "
    "sharp focus, true-to-life colour, high detail. Square image."
)
DEFAULT_VIEW = "laid flat and photographed straight from above"

TEST_IDS = ['tee-white', 'tee-black', 'jeans-straight-indigo', 'sneakers-white', 'cap-black']


def variants():
    data = json.load(open(os.path.join(CAT, 'items.json')))
    colours = data['colours']
    for t in data['types']:
        for cid in t['colours']:
            c = colours[cid]
            light = bool(c.get('light'))
            bg_hex = data['light_background'] if light else data['dark_background']
            yield {
                'id': f"{t['id']}-{cid}",
                'type': t['id'],
                'colour': cid,
                'name': f"{c['label']} {t['name']}",
                'category': t['category'],
                'background': bg_hex,
                'prompt': TEMPLATE.format(
                    desc=t['desc'].replace('{c}', c['phrase']),
                    view=t.get('view') or DEFAULT_VIEW,
                    bg_name='mid-grey' if light else 'pure white',
                    bg_hex=bg_hex,
                ),
            }


def main():
    vs = list(variants())
    if '--test' in sys.argv:
        for v in vs:
            if v['id'] in TEST_IDS:
                print(f"--- {v['id']}\n{v['prompt']}\n")
        return

    with open(os.path.join(CAT, 'prompts.jsonl'), 'w') as f:
        for v in vs:
            f.write(json.dumps({k: v[k] for k in ('id', 'prompt', 'background')}) + '\n')

    lines = ['# Catalogue prompts', '',
             f'{len(vs)} images. Save each result as `catalogue/raw/<id>.png`.', '',
             'Start with the 5 marked **TEST**. If those look good together, do the rest.', '']
    cat = None
    for v in sorted(vs, key=lambda v: (v['category'], v['id'])):
        if v['category'] != cat:
            cat = v['category']
            lines += [f'## {cat}', '']
        tag = ' **TEST**' if v['id'] in TEST_IDS else ''
        lines += [f"### `{v['id']}`{tag} — {v['name']}", '', '```', v['prompt'], '```', '']
    open(os.path.join(CAT, 'prompts.md'), 'w').write('\n'.join(lines))
    print(f'{len(vs)} prompts -> catalogue/prompts.md, catalogue/prompts.jsonl')


if __name__ == '__main__':
    main()
