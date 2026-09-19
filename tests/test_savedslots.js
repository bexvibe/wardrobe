// Faves gets the same piece filters Outfits has. The difference is what they
// mean: on Outfits a slot filter is a list to draw from, on Faves it is a
// test an outfit you already kept has to pass. The two pages also have to
// keep their own settings — narrowing what you are browsing must not narrow
// what you have kept.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// Three kept outfits: two top+bottom (one with a jumper over it, one bare)
// and one dress. Enough for None, Any and a pinned piece to each mean
// something.
const FAVS = [
  {combo_key:'tb|seed_22|seed_11|none|seed_1|none', base:'topbottom',
   top_id:'seed_22', bottom_id:'seed_11', dress_id:null,
   jumper_id:'seed_1', jacket_id:null, shoe_id:null,
   archived_at:null, created_at:'2026-01-01'},
  {combo_key:'tb|seed_23|seed_12|none|none|none', base:'topbottom',
   top_id:'seed_23', bottom_id:'seed_12', dress_id:null,
   jumper_id:null, jacket_id:null, shoe_id:null,
   archived_at:null, created_at:'2026-01-02'},
  {combo_key:'dress|seed_32|none|none|none', base:'dress',
   top_id:null, bottom_id:null, dress_id:'seed_32',
   jumper_id:null, jacket_id:null, shoe_id:null,
   archived_at:null, created_at:'2026-01-03'},
];
const TAGS={seed_22:['summer'], seed_11:['summer'], seed_32:['evening']};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\nwindow.__SEED_TAGS=${JSON.stringify(TAGS)};\nwindow.__SEED_OUTFITS=${JSON.stringify(FAVS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  await p.click('#nav-saved-btn'); await p.waitForTimeout(700);
  return p;
}

const cards = p => p.evaluate(()=>document.querySelectorAll('#saved-gallery .outfit-card').length);
const chipLabels = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
    .map(e=>e.childNodes[0].textContent.trim()));
const countLine = p => p.textContent('#saved-count-line').then(t=>t.trim());

async function setSlot(p, key, choice){
  await p.evaluate(k=>openSlotPicker(k), key);
  await p.waitForTimeout(350);
  await p.click(`#picker-quick-picks .base-btn:has-text("${choice}")`);
  await p.waitForTimeout(250);
  await p.click('.modal .sheet-back');
  await p.waitForTimeout(600);
}

async function pinFirst(p, key){
  await p.evaluate(k=>openSlotPicker(k), key);
  await p.waitForTimeout(350);
  const id = await p.evaluate(()=>document.querySelector('#picker-gallery .picker-tile').getAttribute('onclick'));
  await p.click('#picker-gallery .picker-tile'); await p.waitForTimeout(250);
  await p.click('.modal .sheet-back'); await p.waitForTimeout(600);
  return id;
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The controls are there, and they are the Outfits ones ----
  {
    const p=await open(b);
    check('three kept outfits to start with', (await cards(p))===3, String(await cards(p)));
    check('the panel is open on arrival', await p.evaluate(()=>filterSheetOpen()));
    check('Faves offers a Pieces row, not tags alone',
      await p.evaluate(()=>Boolean(document.getElementById('sheet-filter-grid'))));
    check('with every category an outfit is built from',
      (await chipLabels(p)).length === 8 &&
      await p.evaluate(ls => ls.every(t => OUTFIT_TABS.includes(t)), await chipLabels(p)),
      (await chipLabels(p)).join(', '));

    // And the Outfits page shows the same set, so "the same as Outfits" is a
    // fact rather than a coincidence of this fixture. Shoes are on neither:
    // they go on a kept outfit by hand, they are not something it is made of.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    const onOutfits = await chipLabels(p);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(700);
    check('literally the same row as the Outfits page',
      JSON.stringify(onOutfits)===JSON.stringify(await chipLabels(p)), onOutfits.join(', '));
    check('and neither page offers Shoes', !onOutfits.includes('Shoes'));
    await p.close();
  }

  // ---- 2. None on a base slot narrows by shape, as on Outfits ----
  {
    const p=await open(b);
    await setSlot(p, 'Dresses', 'None');
    check('Dress → None keeps the top-and-bottom faves', (await cards(p))===2, String(await cards(p)));
    check('and says how many of how many', (await countLine(p)).includes('2 of 3'), await countLine(p));

    await setSlot(p, 'Dresses', 'Any');
    await setSlot(p, 'Tops', 'None');
    check('Top → None keeps the dress fave', (await cards(p))===1, String(await cards(p)));
    check('which is the dress one',
      await p.evaluate(()=>favoriteOutfits.filter(savedOutfitMatches)[0].base==='dress'));
    await p.close();
  }

  // ---- 3. None on a layer means the outfit really has nothing there ----
  {
    const p=await open(b);
    check('one of the three wears a jumper',
      await p.evaluate(()=>favoriteOutfits.filter(r=>r.jumper).length)===1);
    await setSlot(p, 'Jumpers', 'None');
    check('Jumper → None drops the one wearing one', (await cards(p))===2, String(await cards(p)));
    const worn = await p.evaluate(()=>favoriteOutfits.filter(savedOutfitMatches).map(r=>r.jumper));
    check('and the ones left have no jumper at all', worn.every(x=>!x), JSON.stringify(worn));
    await p.close();
  }

  // ---- 4. Pinning a piece keeps only the outfits wearing it ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      savedFilters['Tops'] = {type:'items', ids:['seed_22']};
      renderFilterControls(); renderSavedOutfits();
    });
    await p.waitForTimeout(500);
    check('pinning a top keeps only the fave wearing it', (await cards(p))===1, String(await cards(p)));
    // A number in a badge, not the words "1 selected".
    check('the chip counts the pinned pieces',
      (await p.evaluate(()=>Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
        .find(e=>e.childNodes[0].textContent.trim()==='Tops')
        .querySelector('.chip-count').textContent.trim())) === '1');
    check('a piece no fave wears is empty rather than wrong', await (async()=>{
      await p.evaluate(()=>{
        savedFilters['Tops'] = {type:'items', ids:['seed_29']};
        renderSavedOutfits();
      });
      await p.waitForTimeout(400);
      return (await cards(p))===0 &&
        (await p.textContent('#saved-empty-title')).trim() === 'Nothing matches';
    })());
    await p.close();
  }

  // ---- 5. Nothing dims here either ----
  {
    const p=await open(b);
    await setSlot(p, 'Tops', 'None');
    const state = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
        .map(e=>({label: e.childNodes[0].textContent.trim(),
                  opacity: getComputedStyle(e).opacity})));
    check('with only dresses able to match, every chip still reads full strength',
      state.every(c=>c.opacity === '1'), JSON.stringify(state));
    check('and the filter itself still works', (await cards(p))===1, String(await cards(p)));
    await p.close();
  }

  // ---- 6. The two pages keep their own settings ----
  {
    const p=await open(b);
    await setSlot(p, 'Dresses', 'None');
    check('the fave filter is set', await p.evaluate(()=>savedFilters['Dresses'].type)==='none');

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    check('the Outfits slots are untouched',
      await p.evaluate(()=>Object.keys(outfitFilters).every(k=>outfitFilters[k].type==='any')));
    check('and every Outfits chip is back to an outline with no badge',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
        .every(e=>e.dataset.state==='any' && !e.classList.contains('active') &&
                  !e.querySelector('.chip-count'))));

    // Narrow Outfits, go back, and the fave filter is still its own.
    await setSlot(p, 'Tops', 'None');
    await p.click('#nav-saved-btn'); await p.waitForTimeout(700);
    check('the fave filter survived the round trip',
      await p.evaluate(()=>savedFilters['Dresses'].type==='none' && savedFilters['Tops'].type==='any'));
    check('and is still filtering the page', (await cards(p))===2, String(await cards(p)));

    // Coming back a second time in the same visit, the panel stays down —
    // it only comes up by itself the first time — so the pill is already
    // standing in for it, counting whichever page you are on.
    check('the panel does not open itself a second time',
      !(await p.evaluate(()=>filterSheetOpen())));
    check('the collapsed panel counts the fave filters, not the outfit ones',
      (await p.textContent('#filters-fab')).replace(/\s+/g,'') === 'Filters1',
      (await p.textContent('#filters-fab')).replace(/\s+/g,' ').trim());
    await p.close();
  }

  // ---- 7. Clear all clears both kinds on this page ----
  {
    const p=await open(b);
    await setSlot(p, 'Dresses', 'None');
    await p.click('#sheet-tag-chips .tag-chip'); await p.waitForTimeout(500);
    check('a tag and a slot are both on', await p.evaluate(()=>activeFilterCount())>=2,
      String(await p.evaluate(()=>activeFilterCount())));
    await p.click('#filter-sheet-clear'); await p.waitForTimeout(600);
    check('Clear all takes the slots as well as the tag',
      await p.evaluate(()=>savedTags.length===0 && Object.keys(savedFilters).every(k=>savedFilters[k].type==='any')));
    check('and every fave is back', (await cards(p))===3, String(await cards(p)));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
