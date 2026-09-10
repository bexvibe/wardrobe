#!/usr/bin/env node
/**
 * Concatenates schema.sql + seed.sql into supabase/setup-all.sql, so setting
 * the database up is a single paste into the Supabase SQL editor rather than
 * two separate runs in the right order.
 *
 *   node scripts/generate-setup-sql.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');

const header = `-- ============================================================
--  The Archive — one-shot setup
--
--  GENERATED FILE — do not edit by hand.
--  Regenerate with: node scripts/generate-setup-sql.js
--
--  Paste this whole file into the Supabase SQL editor and press Run.
--  It creates the tables and loads the initial 80 pieces in one go.
--
--  Safe to run more than once. Existing rows are left alone, so
--  anything you have since edited in the app is not clobbered.
--
--  Make sure nothing in the editor is selected before you hit Run —
--  with a selection, the editor runs only the highlighted text.
-- ============================================================

`;

const out = header + read('schema.sql') + '\n\n' + read('seed.sql');
fs.writeFileSync(path.join(ROOT, 'supabase', 'setup-all.sql'), out);
console.log(`Wrote supabase/setup-all.sql (${out.split('\n').length} lines).`);
