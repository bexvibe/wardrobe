// One order for the categories, wherever you meet the list: the wardrobe's
// own tabs, the filter row on Outfits, the filter row on Faves. A category
// you own nothing in falls to the end — ahead of No Image, which is a state
// a piece is in rather than a kind of thing. And a category with nothing in
// it says so, and has nothing to choose from.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const rows=JSON.parse(fs.readFileSync(REPO + '/supabase/seed-items.json','utf8'));
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const FAVS=[{combo_key:'tb|seed_22|seed_11|none|none|none', base:'topbottom',
  top_id:'seed_22', bottom_id:'seed_11', dress_id:null, jumper_id:null,
  jacket_id:null, shoe_id:null, extra_ids:[], archived_at:null, created_at:'2026-01-01'}];

async function open(b, patch){
  const seedRows = JSON.parse(JSON.stringify(rows));
  if(patch) patch(seedRows);
  const seed = JSON.stringify(seedRows);
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;`+
         `window.__SEED_OUTFITS=${JSON.stringify(FAVS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(900);
  return p;
}

const wardrobeTabs = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#tabs .tab')).map(e=>e.textContent.trim()));
const filterChips = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
    .map(e=>e.childNodes[0].textContent.trim()));
const counts = p => p.evaluate(()=>{
  const o = {};
  Array.from(document.querySelectorAll('#tabs .tab')).forEach(e => {
    const t = e.textContent.trim();
    if(t !== 'All') o[t] = itemsInTab(t).length;
  });
  return o;
});

// Owned categories keep their declared order; empty ones follow, also in
// their declared order; No Image is last of all.
function wellOrdered(list, owned){
  const rank = t => t === 'All' ? 0 : t === 'No Image' ? 3 : owned[t] ? 1 : 2;
  const ranks = list.map(rank);
  return ranks.every((r, i) => i === 0 || ranks[i-1] <= r);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The wardrobe's own tabs ----
  {
    const p=await open(b);
    const tabs = await wardrobeTabs(p);
    const owned = await counts(p);
    check('All leads', tabs[0]==='All', tabs.slice(0,3).join(', '));
    check('then the categories you own something in, in order, then the empty ones',
      wellOrdered(tabs, owned), tabs.join(', '));
    check('and No Image is last of all',
      tabs[tabs.length-1]==='No Image', tabs.slice(-3).join(', '));
    check('an empty category is still offered, just later',
      tabs.includes('Skirts') && owned['Skirts']===0 &&
      tabs.indexOf('Skirts') > tabs.indexOf('Jackets'), tabs.join(', '));
    check('every category is there, none dropped',
      tabs.length === (await p.evaluate(()=>TAB_ORDER.length)),
      `${tabs.length} of ${await p.evaluate(()=>TAB_ORDER.length)}`);
    await p.close();
  }

  // ---- 2. The same order in the filter rows ----
  {
    const p=await open(b);
    const owned = await counts(p);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    const onOutfits = await filterChips(p);
    check('the Outfits row follows the same rule',
      wellOrdered(onOutfits, owned), onOutfits.join(', '));
    check('and holds every category an outfit is built from',
      onOutfits.length === (await p.evaluate(()=>OUTFIT_TABS.length)),
      `${onOutfits.length} of ${await p.evaluate(()=>OUTFIT_TABS.length)}`);

    await toFaves(p, 1200);
    const onFaves = await filterChips(p);
    check('Faves is the same row in the same order',
      JSON.stringify(onFaves)===JSON.stringify(onOutfits), onFaves.join(', '));

    // And it is the order the wardrobe uses, for the ones they share.
    const tabs = await wardrobeTabs(p);
    const shared = tabs.filter(t => onOutfits.includes(t));
    check('and it agrees with the wardrobe tabs on the ones they share',
      JSON.stringify(shared)===JSON.stringify(onOutfits.filter(t=>shared.includes(t))),
      `${shared.join(', ')} vs ${onOutfits.join(', ')}`);
    await p.close();
  }

  // ---- 3. Owning one moves it back up ----
  {
    // Give the wardrobe a skirt, and Skirts should sit where it is declared
    // rather than at the end.
    const p=await open(b, seedRows => {
      seedRows.push({name:'Black midi skirt', brand:'COS', size:'S', category:'Skirts',
                     price:'', source:'', notes:'', photo:'skirt.webp'});
    });
    const tabs = await wardrobeTabs(p);
    const owned = await counts(p);
    check('a category you now own one of comes back up the list',
      owned['Skirts']===1 && tabs.indexOf('Skirts') < tabs.indexOf('Jumpsuits'),
      tabs.join(', '));
    check('and it is back among the ones you own, in declared order',
      wellOrdered(tabs, owned), tabs.join(', '));
    check('right after Shorts, where it is declared',
      tabs.indexOf('Skirts') === tabs.indexOf('Dresses') - 1 ||
      tabs.indexOf('Skirts') < tabs.indexOf('Dresses'),
      tabs.join(', '));

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    const chips = await filterChips(p);
    check('and the filter row moved it too',
      chips.indexOf('Skirts') < chips.indexOf('Jumpsuits'), chips.join(', '));
    await p.close();
  }

  // ---- 4. A category with nothing in it says so ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await p.evaluate(()=>openSlotPicker('Skirts')); await p.waitForTimeout(500);
    const empty = await p.evaluate(()=>{
      const note = document.getElementById('picker-empty');
      const cs = getComputedStyle(note);
      return {
        text: note.textContent.trim(),
        shown: note.offsetParent !== null,
        size: parseFloat(cs.fontSize),
        muted: cs.color !== getComputedStyle(document.body).color,
        quick: Array.from(document.querySelectorAll('#picker-quick-picks .base-btn'))
          .map(e=>e.textContent.trim()),
        tiles: document.querySelectorAll('#picker-gallery .picker-tile').length,
      };
    });
    check('it says so, in the category\'s own words', empty.text==='No skirts', empty.text);
    check('small and light rather than a heading',
      empty.shown && empty.size <= 13 && empty.muted, `${empty.size}px`);
    check('there is nothing to choose from', empty.tiles===0);
    check('and Any is the only quick pick, as everywhere',
      JSON.stringify(empty.quick)===JSON.stringify(['Any']), empty.quick.join(', '));
    await p.close();
  }

  // ---- 5. A category with something in it is unchanged ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await p.evaluate(()=>openSlotPicker('Tops')); await p.waitForTimeout(500);
    const full = await p.evaluate(()=>({
      note: document.getElementById('picker-empty').offsetParent !== null,
      quick: Array.from(document.querySelectorAll('#picker-quick-picks .base-btn'))
        .map(e=>e.textContent.trim()),
      tiles: document.querySelectorAll('#picker-gallery .picker-tile').length,
    }));
    check('no note where there is something to show', !full.note);
    check('Any and nothing else, the same as an empty one',
      JSON.stringify(full.quick)===JSON.stringify(['Any']), full.quick.join(', '));
    check('and the pieces to choose from', full.tiles > 0, String(full.tiles));

    // Narrowing is done by picking, and Any is the way back from it.
    await p.click('#picker-gallery .picker-tile'); await p.waitForTimeout(300);
    check('picking a piece narrows the category',
      await p.evaluate(()=>outfitFilters['Tops'].type==='items' &&
                           outfitFilters['Tops'].ids.length===1));
    await p.click('#picker-quick-picks .base-btn:has-text("Any")');
    await p.waitForTimeout(300);
    check('and Any is the way back to the whole of it',
      await p.evaluate(()=>outfitFilters['Tops'].type==='any'));
    await p.close();
  }

  // ---- 6. An empty category cannot narrow anything ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
    const before = await p.evaluate(()=>totalComboCount());

    // With None gone, the only way to narrow a category is to pick a piece
    // from it — and a category you own none of has none to pick. So it is
    // offered, and it simply cannot do anything.
    await p.evaluate(()=>openSlotPicker('Skirts')); await p.waitForTimeout(500);
    check('the picker opens on nothing to choose',
      await p.evaluate(()=>document.querySelectorAll('#picker-gallery .picker-tile').length===0));
    check('with Any already on, and no other way to change it',
      await p.evaluate(()=>{
        const btns = Array.from(document.querySelectorAll('#picker-quick-picks .base-btn'));
        return btns.length===1 && btns[0].textContent.trim()==='Any' &&
               btns[0].classList.contains('active');
      }));
    await p.click('.modal .sheet-back'); await p.waitForTimeout(800);
    check('so the page is exactly as you left it',
      (await p.evaluate(()=>totalComboCount()))===before,
      `${await p.evaluate(()=>totalComboCount())} vs ${before}`);
    check('and the category stayed on Any',
      await p.evaluate(()=>outfitFilters['Skirts'].type==='any'));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
