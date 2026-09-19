// Pants and shorts are two things to browse and filter, one thing to wear.
// The tabs split; the outfit's bottom slot still draws from both, so a pair
// of shorts has not quietly dropped out of the generator.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
// The one pair of shorts in the real wardrobe has no photo yet, which puts
// it in No Image rather than in any category. Give it one here, so the split
// is tested on a pair that has somewhere to be.
const seedRows=JSON.parse(fs.readFileSync(REPO + '/supabase/seed-items.json','utf8'));
seedRows.forEach(r=>{ if(r.category==='Shorts') r.photo='shorts.webp'; });
const seed=JSON.stringify(seedRows);
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\nwindow.__WITH_CAPSULES=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

const tabs = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#tabs .tab')).map(e=>e.textContent.trim()));
const tiles = p => p.evaluate(()=>document.querySelectorAll('#gallery .tile').length);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The wardrobe has both, and no Bottoms ----
  {
    const p=await open(b);
    const t = await tabs(p);
    check('the wardrobe offers Pants', t.includes('Pants'), t.join(', '));
    check('and Shorts beside it', t.includes('Shorts'));
    check('nothing is called Bottoms any more', !t.includes('Bottoms'));
    check('Shorts comes right after Pants',
      t.indexOf('Shorts') === t.indexOf('Pants') + 1, t.join(', '));
    // Skirts is on the list but owned of none, so it waits at the end with
    // the other empty shelves rather than between two you use.
    check('and Skirts on the list, empty but ready',
      t.includes('Skirts') && t.indexOf('Skirts') > t.indexOf('Jackets'),
      t.join(', '));
    check('and the word Bottoms is gone from the page',
      !(await p.evaluate(()=>/\bBottoms\b/.test(document.body.innerText))));

    // Jeans are pants; shorts are not.
    await p.click('#tabs .tab:has-text("Pants")'); await p.waitForTimeout(500);
    const pants = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#gallery .tile'))
        .map(t=>ITEMS.find(i=>i.id===t.dataset.id).category));
    check('Pants holds jeans and pants', pants.length === 16 &&
      pants.every(c=>['Jeans','Pants','Skirts'].includes(c)),
      `${pants.length}: ${[...new Set(pants)].join(', ')}`);

    await p.click('#tabs .tab:has-text("Shorts")'); await p.waitForTimeout(500);
    const shorts = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#gallery .tile'))
        .map(t=>ITEMS.find(i=>i.id===t.dataset.id).category));
    check('Shorts holds only shorts', shorts.length === 1 && shorts[0] === 'Shorts',
      `${shorts.length}: ${[...new Set(shorts)].join(', ')}`);
    await p.close();
  }

  // ---- 2. The bottom of an outfit still comes from both ----
  {
    const p=await open(b);
    const pool = await p.evaluate(()=>{
      const bottoms = slotList(outfitFilters, 'bottom');
      return {
        n: bottoms.length,
        cats: [...new Set(bottoms.map(i=>i.category))].sort(),
        hasShorts: bottoms.some(i=>i.category==='Shorts'),
      };
    });
    check('the bottom slot draws from Pants and Shorts together',
      pool.n === 17 && pool.hasShorts, `${pool.n}: ${pool.cats.join(', ')}`);

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1100);
    check('and outfits are generated with shorts among them',
      await p.evaluate(()=>{
        const shorts = ITEMS.filter(i=>i.category==='Shorts').map(i=>i.id);
        return outfitGen && outfitDisplayed.length > 0 &&
          typeof totalComboCount() === 'number' && totalComboCount() > 0 &&
          shorts.length > 0;
      }));

    // The arithmetic in the count has to use the same two tabs the stream does.
    const agree = await p.evaluate(()=>{
      const tops = itemsInTab('Tops').length;
      const bottoms = slotList(outfitFilters, 'bottom').length;
      const dresses = itemsInTab('Dresses').length;
      const jum = itemsInTab('Jumpers').length + 1;
      const jac = itemsInTab('Jackets').length + 1;
      return {said: totalComboCount(), works: (tops * bottoms + dresses) * jum * jac};
    });
    check('the combination count counts both tabs',
      agree.said === agree.works, `${agree.said} vs ${agree.works}`);
    await p.close();
  }

  // ---- 3. Filtering the bottom slot reaches a pair of shorts ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1100);
    const shortsId = await p.evaluate(()=>ITEMS.find(i=>i.category==='Shorts').id);
    await p.evaluate(()=>openSlotPicker('Shorts')); await p.waitForTimeout(500);
    check('the Shorts picker offers the shorts and only the shorts',
      await p.evaluate(id=>{
        const tiles = Array.from(document.querySelectorAll('#picker-gallery .picker-tile'));
        return tiles.length === itemsInTab('Shorts').length &&
               tiles.some(t=>(t.getAttribute('onclick')||'').includes(id));
      }, shortsId));
    check('and the Pants picker does not', await (async()=>{
      await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
      await p.evaluate(()=>openSlotPicker('Pants')); await p.waitForTimeout(400);
      return p.evaluate(id=>!Array.from(document.querySelectorAll('#picker-gallery .picker-tile'))
        .some(t=>(t.getAttribute('onclick')||'').includes(id)), shortsId);
    })());

    await p.evaluate(id=>{ outfitFilters['Shorts'] = {type:'items', ids:[id]}; }, shortsId);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(900);
    // Pants is still on Any, but asking for a particular pair of shorts is
    // asking for those shorts — the other bottoms step aside rather than
    // coming along as alternatives.
    check('pinning them narrows every outfit to that pair',
      await p.evaluate(id=>outfitDisplayed.length > 0 &&
        outfitDisplayed.every(c=>c.bottom && c.bottom.id === id), shortsId));
    check('and the count agrees with what is on screen',
      await p.evaluate(()=>{
        let n=0; for(const c of comboGenerator()){ n++; if(n>200000) break; }
        return n === totalComboCount();
      }));
    await p.close();
  }

  // ---- 4. A piece leads to its own tab, whichever of the two it is ----
  {
    const p=await open(b);
    const where = await p.evaluate(()=>({
      shorts: tabForItem(ITEMS.find(i=>i.category==='Shorts')),
      jeans:  tabForItem(ITEMS.find(i=>i.category==='Jeans')),
    }));
    check('a pair of shorts belongs to Shorts', where.shorts === 'Shorts', where.shorts);
    check('a pair of jeans belongs to Pants', where.jeans === 'Pants', where.jeans);

    // "Outfits with this piece" locks the right slot from either tab.
    check('both lock the outfit bottom when you ask for outfits with them',
      await p.evaluate(()=>{
        // It hands back a set of filters now rather than writing into the
        // page's, so a sheet can ask about a piece without wiping them.
        const ok = (id, tab) => { const r = lockFilterForPiece(id);
                                  return r && r[tab].ids[0] === id; };
        return ok(ITEMS.find(i=>i.category==='Shorts').id, 'Shorts') &&
               ok(ITEMS.find(i=>i.category==='Jeans').id, 'Pants');
      }));
    await p.close();
  }

  // ---- 5. Capsules lay both out on the same band ----
  {
    const p=await open(b);
    check('a capsule draws pants and shorts on one row, above the shoes',
      await p.evaluate(()=>{
        const bands = CAPSULE_BANDS.map(b=>b.join('+'));
        const bottom = bands.findIndex(b=>b.includes('Pants'));
        return bands[bottom].includes('Shorts') &&
               bands[bottom].includes('Dresses') &&
               bands.findIndex(b=>b.includes('Tops')) < bottom &&
               bands.findIndex(b=>b.includes('Shoes')) > bottom;
      }));
    await p.close();
  }

  // ---- 6. And the category field still knows both words ----
  {
    const p=await open(b);
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    await p.fill('#form-category', 'sho'); await p.waitForTimeout(300);
    const opts = await p.evaluate(()=>Array.from(
      document.querySelectorAll('#form-category-options .picker-option')).map(e=>e.textContent.trim()));
    check('typing "sho" offers Shoes and Shorts', opts.includes('Shorts') && opts.includes('Shoes'),
      opts.join(', '));
    await p.fill('#form-category', 'pan'); await p.waitForTimeout(300);
    check('and "pan" offers Pants',
      await p.evaluate(()=>Array.from(
        document.querySelectorAll('#form-category-options .picker-option'))
          .some(e=>e.textContent.trim()==='Pants')));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
