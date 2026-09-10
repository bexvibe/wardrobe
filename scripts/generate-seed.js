#!/usr/bin/env node
/**
 * Regenerates supabase/seed.sql from supabase/seed-items.json.
 *
 * seed-items.json is the app's original hardcoded inventory, lifted out of
 * the SEED_DATA array that used to live in index.html. Once the database is
 * live it stops being the source of truth — it is kept so the initial rows
 * can be regenerated reproducibly rather than hand-maintaining 80 INSERTs,
 * and so the original inventory survives outside git history.
 *
 * The seed_N ids are deliberately preserved: saved outfits and hidden combos
 * are keyed on item ids, so keeping them means the state already on the
 * user's phone migrates across without any remapping.
 *
 *   node scripts/generate-seed.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'supabase', 'seed-items.json');

const items = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
if (!Array.isArray(items) || items.length === 0) throw new Error(`${SOURCE} parsed to nothing`);

const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const text = (v) => (v === null || v === undefined ? "''" : `'${String(v).replace(/'/g, "''")}'`);

const rows = items.map((item, i) => {
  const cols = [
    q('seed_' + i),
    text(item.name),
    text(item.brand),
    text(item.size),
    text(item.category),
    text(item.price),
    text(item.source),
    text(item.notes),
    q(item.photo),
  ];
  return `  (${cols.join(', ')})`;
});

const sql = `-- ============================================================
--  The Archive — initial inventory
--
--  GENERATED FILE — do not edit by hand.
--  Regenerate with: node scripts/generate-seed.js
--
--  Run this once, after schema.sql (see SETUP.md). Re-running is
--  safe: existing rows are left untouched, so anything you have
--  since edited in the app will not be clobbered back to these
--  original values.
-- ============================================================

insert into public.items (id, name, brand, size, category, price, source, notes, photo) values
${rows.join(',\n')}
on conflict (id) do nothing;
`;

fs.mkdirSync(path.join(ROOT, 'supabase'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'supabase', 'seed.sql'), sql);

const withPhoto = items.filter((i) => i.photo).length;
console.log(`Wrote supabase/seed.sql — ${items.length} items (${withPhoto} with photos, ${items.length - withPhoto} without).`);
