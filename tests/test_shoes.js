const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const html=fs.readFileSync(REPO + '/index.html','utf8');

// An outfit saved back when shoes were part of combos. Its shoe sits in
// outfit_extras, which is where supabase/add-outfit-extras-table.sql puts
// a shoe_id when it runs — the app reads accessories from there and does
// not look at the old column.
const LEGACY_KEY = 'tb|seed_22|seed_11|none|none|seed_9';
const LEGACY = [{combo_key:LEGACY_KEY, base:'topbottom',
  top_id:'seed_22', bottom_id:'seed_11', dress_id:null, jumper_id:null, jacket_id:null,
  shoe_id:'seed_9', archived_at:null, created_at:new Date().toISOString()}];
const LEGACY_EXTRAS = [{combo_key:LEGACY_KEY, extra_ids:['seed_9']}];

const results=[];
const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function run(browser, shoesOn){
  const page = await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  // Serve index.html with the flag forced to the state under test.
  const patched = html.replace('const INCLUDE_SHOES_IN_OUTFITS = false;',
                               `const INCLUDE_SHOES_IN_OUTFITS = ${shoesOn};`);
  if(!patched.includes(`INCLUDE_SHOES_IN_OUTFITS = ${shoesOn}`)) throw new Error('flag patch failed');
  await page.route('**/index.html', r=>r.fulfill({contentType:'text/html',body:patched}));
  await page.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__SEED_OUTFITS=${JSON.stringify(LEGACY)};`+
         `window.__SEED_EXTRAS=${JSON.stringify(LEGACY_EXTRAS)};\n${fake}`}));
  await page.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'wardrobe@the-archive.app'};`}));
  await page.goto('http://localhost:8933/index.html');
  await page.waitForTimeout(300);
  await page.fill('#gate-password','correct-horse'); await page.click('#gate-submit');
  await page.waitForSelector('#app-root',{state:'visible'}); await page.waitForTimeout(300);
  await page.click('#nav-outfits-btn'); await page.waitForTimeout(600);
  return page;
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---------- flag OFF (shipping state) ----------
  {
    const page = await run(b,false);
    const info = await page.evaluate(()=>{
      const shoeIds = new Set(ITEMS.filter(i=>tabForItem(i)==='Shoes').map(i=>i.id));
      return {
        shoeCount: shoeIds.size,
        combosWithShoe: outfitDisplayed.filter(c=>c.shoe).length,
        shown: outfitDisplayed.length,
        keysEndNone: outfitDisplayed.every(c=>comboKey(c).endsWith('|none')),
        total: totalComboCount(),
        // Both shapes are in one stream now, so the expected figure is
        // (tops x bottoms + dresses) x the layers, not tops x bottoms alone.
        expected: (()=>{const n=s=>slotList(outfitFilters,s).length;
          return (n('top')*n('bottom') + n('dress')) * n('jumper') * n('jacket');})(),
        filterChips: Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip')).map(e=>e.textContent.trim().split('\n')[0]),
      };
    });
    check('wardrobe still contains shoes', info.shoeCount>0, info.shoeCount+' pairs');
    check('no generated outfit includes shoes', info.combosWithShoe===0, `${info.shown} shown, ${info.combosWithShoe} with shoes`);
    check('combo keys keep their shoe segment as none', info.keysEndNone);
    check('combination count drops the shoe multiplier', info.total===info.expected, `${info.total} = ${info.expected}`);
    check('Shoes filter chip is gone', !info.filterChips.some(c=>/Shoes/.test(c)), info.filterChips.join(', '));

    // a pre-existing saved outfit keeps its shoe
    await page.evaluate(()=>closeFilterSheet()); await page.waitForTimeout(300);
    await page.click('#nav-saved-btn'); await page.waitForTimeout(400);
    const saved = await page.evaluate(()=>({
      count: favoriteOutfits.length,
      thumbs: document.querySelectorAll('#saved-gallery .outfit-thumbs img, #saved-gallery .outfit-thumbs .no-photo-mini').length
    }));
    check('outfit saved with shoes still shows all 3 pieces', saved.count===1 && saved.thumbs===3,
      `pieces rendered=${saved.thumbs}`);
    await page.screenshot({path:shot('s1-no-shoes.png')});

    // tapping a shoe explains itself
    await page.click('#nav-inventory-btn'); await page.waitForTimeout(300);
    const toast = await page.evaluate(async()=>{
      const shoe = ITEMS.find(i=>tabForItem(i)==='Shoes');
      findOutfitsWithPiece(shoe.id);
      return document.getElementById('toast').textContent;
    });
    check('tapping a shoe explains why there are no outfits', /pick them by hand/.test(toast), toast);
    await page.close();
  }

  // ---------- flag ON (reversibility) ----------
  {
    const page = await run(b,true);
    const info = await page.evaluate(()=>({
      combosWithShoe: outfitDisplayed.filter(c=>c.shoe).length,
      shown: outfitDisplayed.length,
      filterChips: Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip')).map(e=>e.textContent.trim().split('\n')[0]),
    }));
    check('flipping the flag back on restores shoe combos', info.combosWithShoe>0,
      `${info.combosWithShoe}/${info.shown} shown include shoes`);
    check('Shoes filter chip returns', info.filterChips.some(c=>/Shoes/.test(c)), info.filterChips.join(', '));

    // the legacy saved outfit's heart lights up again — keys survived the round trip
    const stillValid = await page.evaluate(()=>{
      const key='tb|seed_22|seed_11|none|none|seed_9';
      return {favorited:isFavorited(key), generatable:!!outfitDisplayed.find(c=>comboKey(c)===key) || 'not in first page'};
    });
    check('saved outfit key still recognised with shoes back on', stillValid.favorited===true);
    await page.screenshot({path:shot('s2-shoes-on.png')});
    await page.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
