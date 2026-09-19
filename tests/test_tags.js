const { chromium } = require('playwright');
// The filters dock at the bottom of the screen and open themselves on
// Outfits and Faves. Everywhere else the pill raises them.
async function openFilters(page){
  const open = await page.evaluate(() => filterSheetOpen());
  if(!open){ await page.click('#filters-fab'); await page.waitForTimeout(400); }
}
async function closeFilters(page){
  await page.evaluate(() => closeFilterSheet());
  await page.waitForTimeout(300);
}

const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// The wardrobe stopped printing a count, so count what it actually drew.
const shown = p => p.evaluate(() =>
  document.getElementById('gallery').style.display === 'none'
    ? document.querySelectorAll('#name-list .name-row').length
    : document.querySelectorAll('#gallery .tile').length);


async function open(b, {withTags=true, tags={}}={}){
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=${withTags};window.__SEED_TAGS=${JSON.stringify(tags)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);
  return p;
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Column not added yet: the app must work, quietly without tags ----
  {
    const p=await open(b,{withTags:false});
    check('works before the migration: items still load',
      (await shown(p)) === 80);
    check('no Filters pill on the wardrobe at all', !(await p.isVisible('#filters-fab')));
    await p.click('#add-item-btn'); await p.waitForTimeout(300);
    check('tags field hidden in the form', !(await p.isVisible('#form-tags-field')));
    // saving must not attempt to write the missing column
    await p.fill('#form-name','No Tags Piece'); await p.click('#form-save-btn'); await p.waitForTimeout(500);
    const row=await p.evaluate(()=>window.__WARDROBE_STATE.items.find(r=>r.name==='No Tags Piece'));
    check('save succeeds and sends no tags', Boolean(row) && !('tags' in row));
    await p.close();
  }

  // ---- 2. Tagging an item ----
  {
    const p=await open(b);
    check('tags field shown once the column exists',
      await (async()=>{ await p.click('#add-item-btn'); await p.waitForTimeout(300);
                        return p.isVisible('#form-tags-field'); })());
    await p.fill('#form-name','Linen Shirt');
    await p.fill('#form-tags','Summer,  WORK , summer');   // messy on purpose
    await p.click('#form-save-btn'); await p.waitForTimeout(500);
    const row=await p.evaluate(()=>window.__WARDROBE_STATE.items.find(r=>r.name==='Linen Shirt'));
    check('tags normalised and de-duplicated',
      JSON.stringify(row.tags)===JSON.stringify(['summer','work']), JSON.stringify(row.tags));
    // The pill lives on Outfits and Faves; the wardrobe never shows one.
    check('the wardrobe still offers no pill', !(await p.isVisible('#filters-fab')));
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(800);
    check('and the new tag is in the Outfits panel',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#sheet-tag-chips .tag-chip'))
        .some(c=>c.textContent.trim()==='summer')));
    await p.close();
  }

  // ---- 3. The wardrobe does not narrow by tag ----
  {
    // Tags exist, and the wardrobe takes no notice of them: its categories
    // and its search are how you narrow a grid of pieces.
    const p=await open(b,{tags:{seed_22:['summer'], seed_11:['summer'], seed_0:['winter']}});
    check('the wardrobe shows every piece even with tags about',
      (await shown(p)) === 80, String(await shown(p)));
    check('there is no filter control on the page',
      !(await p.isVisible('#filters-fab')) &&
      await p.evaluate(()=>!filterSheetHasContent()));
    check('and its list ignores tags entirely',
      await p.evaluate(()=>visibleFilteredItems('').length) === 80);
    check('search still narrows it, which is what that page has',
      await p.evaluate(()=>visibleFilteredItems('jeans').length) > 0 &&
      await p.evaluate(()=>visibleFilteredItems('jeans').length) < 80,
      String(await p.evaluate(()=>visibleFilteredItems('jeans').length)));
    await p.screenshot({path:shot('tags-inventory.png')});
    await p.close();
  }

  // ---- 4. Filtering outfits: every piece must carry the tag ----
  {
    const p=await open(b,{tags:{seed_22:['summer'], seed_11:['summer'], seed_0:['winter']}});
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(700);
    const all=await p.evaluate(()=>totalComboCount());
    await openFilters(p); await p.click('#sheet-tag-chips .tag-chip:has-text("summer")'); await p.waitForTimeout(700);
    const tagged=await p.evaluate(()=>totalComboCount());
    check('outfit count narrows to tagged pieces', tagged < all && tagged > 0, `${all} -> ${tagged}`);
    const ok=await p.evaluate(()=>{
      const tagOf=id=>{const i=ITEMS.find(x=>x.id===id); return i?(i.tags||[]):[];};
      // an outfit qualifies on one tagged piece, not on all of them
      return outfitDisplayed.every(c=>comboPieces(c).some(pc=>tagOf(pc.id).includes('summer')));
    });
    check('every generated outfit contains at least one tagged piece', ok);
    await p.screenshot({path:shot('tags-outfits.png')});

    // independence
    await closeFilters(p);
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(400);
    check('the wardrobe is untouched by the outfit filter',
      (await shown(p)) === 80, String(await shown(p)));
    await p.close();
  }

  // ---- 5. Persistence + editing ----
  {
    const p=await open(b,{tags:{seed_22:['summer']}});
    await p.evaluate(()=>openModal('seed_22')); await p.waitForTimeout(400);
    check('tags show on the item detail',
      (await p.textContent('.detail-tags')).includes('summer'));
    await p.click('.modal-actions button:has-text("Edit")'); await p.waitForTimeout(400);
    check('edit form pre-fills existing tags',
      (await p.inputValue('#form-tags'))==='summer');
    // tap a suggestion chip to add another
    await p.fill('#form-tags','summer, linen'); await p.click('#form-save-btn'); await p.waitForTimeout(500);
    await p.reload(); await p.waitForTimeout(900);
    const after=await p.evaluate(()=>ITEMS.find(i=>i.id==='seed_22').tags);
    check('tag edits survive a reload', JSON.stringify(after)===JSON.stringify(['summer','linen']), JSON.stringify(after));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
