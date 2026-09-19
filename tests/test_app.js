const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };

const SCRATCH = __dirname;
const BASE = 'http://localhost:8933';
const PASSWORD = 'correct-horse';

const fake = fs.readFileSync(path.join(SCRATCH, 'fake-supabase.js'), 'utf8');
const seedItems = fs.readFileSync(path.join(REPO, 'supabase', 'seed-items.json'), 'utf8');

const results = [];

// The wardrobe stopped printing a count, so count what it actually drew.
const shown = p => p.evaluate(() =>
  document.getElementById('gallery').style.display === 'none'
    ? document.querySelectorAll('#name-list .name-row').length
    : document.querySelectorAll('#gallery .tile').length);

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function newPage(browser, { legacy } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => console.log('  PAGEERROR: ' + e.message));

  // Serve the fake in place of the real bundle, and a configured config.js.
  await page.route('**/vendor/supabase-js-*.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.__SEED_ITEMS = ${seedItems};\n${fake}` })
  );
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.WARDROBE_CONFIG = { supabaseUrl:'https://fake.supabase.co', supabaseAnonKey:'anon', authEmail:'wardrobe@the-archive.app' };`,
    })
  );
  if (legacy) {
    await page.addInitScript((state) => {
      localStorage.setItem('wardrobe-deleted-ids', JSON.stringify(state.deleted));
      localStorage.setItem('wardrobe-favorite-outfits', JSON.stringify(state.favorites));
      localStorage.setItem('wardrobe-hidden-combos', JSON.stringify(state.hidden));
    }, legacy);
  }
  return page;
}

// Select mode is entered by holding a piece — there is no button at rest.
async function holdFirstTile(page){
  const box = await page.locator('#gallery .tile').first().boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function login(page) {
  await page.fill('#gate-password', PASSWORD);
  await page.click('#gate-submit');
  await page.waitForSelector('#app-root', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ---- 1. Gate blocks the app until the password is right ----
  {
    const page = await newPage(browser);
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);

    check('gate is shown before login', await page.isVisible('#gate-login'));
    check('app is hidden before login', !(await page.isVisible('#app-root')));

    await page.fill('#gate-password', 'wrong-password');
    await page.click('#gate-submit');
    await page.waitForTimeout(200);
    check('wrong password is rejected',
      (await page.textContent('#gate-login-error')).includes('did not work') && !(await page.isVisible('#app-root')));

    await login(page);
    check('correct password unlocks the app', await page.isVisible('#app-root'));

    const count = await shown(page);
    check('items load from the database', count === 80, String(count));
    await page.screenshot({ path: shot('v1-inventory.png') });
    await page.close();
  }

  // ---- 2. Archive instead of delete, and restore ----
  {
    const page = await newPage(browser);
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    await login(page);

    await holdFirstTile(page);             // holding selects it
    // No confirmation step: the undo on the toast is the safety net.
    await page.click('button:has-text("Delete selected")');
    await page.waitForTimeout(700);

    const afterCount = await shown(page);
    check('archiving removes the item from inventory', afterCount === 79, String(afterCount));

    const dbState = await page.evaluate(() => {
      const rows = window.__WARDROBE_STATE.items;
      return {
        archived: rows.filter((r) => r.archived_at).length,
        hardDeleted: rows.length !== 80,
      };
    });
    check('archived row is soft-deleted, not removed', dbState.archived === 1 && !dbState.hardDeleted,
      `archived=${dbState.archived} rowsIntact=${!dbState.hardDeleted}`);

    await page.click('#archive-link');
    await page.waitForTimeout(250);
    check('archive tab lists the archived piece',
      (await page.textContent('#archive-count-line')).includes('1 archived'));
    await page.screenshot({ path: shot('v2-archive.png') });

    await page.click('.archive-row button:has-text("Restore")');
    await page.waitForTimeout(300);
    check('restore empties the archive',
      (await page.textContent('#archive-count-line')).includes('0 archived'));

    const restored = await page.evaluate(() => window.__WARDROBE_STATE.items.filter((r) => r.archived_at).length);
    check('restore clears archived_at in the database', restored === 0);
    await page.close();
  }

  // ---- 3. Favourites persist to the database ----
  {
    const page = await newPage(browser);
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    await login(page);

    await page.click('#nav-outfits-btn');
    await page.waitForTimeout(400);
    await page.click('.outfit-fav-btn');
    await page.waitForTimeout(300);

    const saved = await page.evaluate(() => window.__WARDROBE_STATE.saved_outfits);
    check('hearting writes a saved_outfits row', saved.length === 1 && !saved[0].archived_at,
      saved.length ? saved[0].combo_key : 'none');

    await page.click('#nav-saved-btn');
    await page.waitForTimeout(300);
    check('saved tab shows the hearted outfit',
      (await page.textContent('#saved-count-line')).includes('1 fave'));

    await page.click('#saved-gallery .outfit-fav-btn.favorited');
    await page.waitForTimeout(300);
    const afterUnheart = await page.evaluate(() => window.__WARDROBE_STATE.saved_outfits);
    check('un-hearting soft-deletes rather than dropping the row',
      afterUnheart.length === 1 && Boolean(afterUnheart[0].archived_at),
      `rows=${afterUnheart.length} archived=${Boolean(afterUnheart[0] && afterUnheart[0].archived_at)}`);
    await page.close();
  }

  // ---- 4. Adding a piece ----
  {
    const page = await newPage(browser);
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    await login(page);

    await page.click('#add-item-btn');
    await page.waitForTimeout(250);
    await page.fill('#form-name', 'Test Trench');
    await page.fill('#form-brand', 'Testwear');
    await page.fill('#form-category', 'Jackets');
    await page.click('#form-save-btn');
    await page.waitForTimeout(400);

    const added = await page.evaluate(() =>
      window.__WARDROBE_STATE.items.filter((r) => r.name === 'Test Trench')
    );
    check('new item is inserted with a generated id',
      added.length === 1 && added[0].id.startsWith('itm_'), added.length ? added[0].id : 'none');
    check('inventory count reflects the new piece',
      (await shown(page)) === 81);
    await page.close();
  }

  // ---- 5. One-time migration of existing phone data ----
  {
    const legacy = {
      deleted: ['seed_3', 'seed_4'],
      favorites: [{ key: 'tb|seed_22|seed_11|none|none|none', base: 'topbottom',
                    top: 'seed_22', bottom: 'seed_11', dress: null, jumper: null, jacket: null, shoe: null }],
      hidden: ['tb|seed_0|seed_1|none|none|none'],
    };
    const page = await newPage(browser, { legacy });
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    await login(page);
    await page.waitForTimeout(600);

    const migrated = await page.evaluate(() => ({
      archived: window.__WARDROBE_STATE.items.filter((r) => r.archived_at).map((r) => r.id),
      outfits: window.__WARDROBE_STATE.saved_outfits.length,
      hidden: window.__WARDROBE_STATE.hidden_combos.length,
      flag: Boolean(localStorage.getItem('wardrobe-migrated-to-supabase')),
      legacyKept: Boolean(localStorage.getItem('wardrobe-deleted-ids')),
    }));
    check('legacy deletes become archived items',
      migrated.archived.length === 2 && migrated.archived.includes('seed_3'), migrated.archived.join(','));
    check('legacy favourites migrate', migrated.outfits === 1);
    check('legacy hidden combos migrate', migrated.hidden === 1);
    check('migration flag is set', migrated.flag);
    check('old localStorage kept as a backup', migrated.legacyKept);
    check('saved tab shows the migrated outfit',
      await (async () => {
        await page.click('#nav-saved-btn');
        await page.waitForTimeout(300);
        return (await page.textContent('#saved-count-line')).includes('1 fave');
      })());
    await page.screenshot({ path: shot('v3-migrated.png') });

    // Reload: the migration must not run a second time. The fake's database is
    // in-memory and starts empty again on reload, while the legacy localStorage
    // keys are deliberately still there — so a migration that re-ran would show
    // up as fresh writes. Assert on the writes themselves, not on row counts.
    await page.reload();
    await page.waitForTimeout(800);
    check('session persists across reload (no re-login)', await page.isVisible('#app-root'));

    const rerunWrites = await page.evaluate(() =>
      window.__WARDROBE_CALLS.filter((c) => c.op === 'upsert' || c.op === 'update')
    );
    check('migration does not run twice', rerunWrites.length === 0,
      rerunWrites.length ? JSON.stringify(rerunWrites) : 'no write calls on second load');
    await page.close();
  }

  // ---- 6. Unconfigured install degrades gracefully ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/vendor/supabase-js-*.js', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: fake })
    );
    await page.route('**/config.js', (route) =>
      route.fulfill({ contentType: 'application/javascript',
        body: `window.WARDROBE_CONFIG = { supabaseUrl:'', supabaseAnonKey:'', authEmail:'x@y.z' };` })
    );
    await page.goto(BASE + '/index.html');
    await page.waitForTimeout(300);
    check('unconfigured install shows setup instructions, not a broken page',
      await page.isVisible('#gate-unconfigured'));
    await page.screenshot({ path: shot('v4-unconfigured.png') });
    await page.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
