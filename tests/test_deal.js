// A different order every visit.
//
// A wardrobe of eighty pieces makes more combinations than anyone will
// scroll to, so whichever ones the generator reached first were the only
// ones ever seen — and what you had kept came back oldest-first for ever.
// Both are dealt afresh now.
//
// Once per visit, though, not once per draw: the order has to hold still
// while you are reading it, or the next page of the stream could hand you
// an outfit you already saw and never hand you another at all. That is the
// property most of this suite is about.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// Six kept outfits, so an order is something you can see.
const FAVS = [1,2,3,4,5,6].map(n => ({
  combo_key:`tb|seed_2${n}|seed_1${n}|none|none|none`, base:'topbottom',
  top_id:'seed_2'+n, bottom_id:'seed_1'+n, dress_id:null,
  jumper_id:null, jacket_id:null, shoe_id:null, extra_ids:[],
  archived_at:null, created_at:`2026-01-0${n}`}));

// `deal` is the session seed to pin, or null to let the app choose its own.
async function open(b, deal){
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__SEED_OUTFITS=${JSON.stringify(FAVS)};` +
         (deal === null ? 'window.__SESSION_SEED_FREE=true;' : `window.__SESSION_SEED=${deal};`) +
         `\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

async function toStream(p){
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
}
const stream = p => p.evaluate(()=>outfitDisplayed.slice(0, 8).map(c=>comboKey(c)));
const total  = p => p.evaluate(()=>totalComboCount());
const kept = async p => {
  await p.click('#nav-saved-btn'); await p.waitForTimeout(1200);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
  return p.evaluate(()=>Array.from(document.querySelectorAll('#saved-gallery .outfit-card'))
    .map(c=>c.querySelector('img') ? c.querySelector('img').getAttribute('alt') : '?'));
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Two visits, two orders, one wardrobe ----
  {
    const one = await open(b, 1);
    await toStream(one);
    const firstStream = await stream(one), firstTotal = await total(one);
    const firstKept = await kept(one);

    const two = await open(b, 987654321);
    await toStream(two);
    const secondStream = await stream(two), secondTotal = await total(two);
    const secondKept = await kept(two);

    check('the stream leads with something else',
      JSON.stringify(firstStream) !== JSON.stringify(secondStream),
      `${firstStream[0]} vs ${secondStream[0]}`);
    check('and so do the kept ones',
      JSON.stringify(firstKept) !== JSON.stringify(secondKept),
      `${firstKept[0]} vs ${secondKept[0]}`);

    // Dealt again, not changed: same wardrobe, same combinations.
    check('the same number of combinations either way',
      firstTotal === secondTotal, `${firstTotal} vs ${secondTotal}`);
    check('and the same kept outfits, in a different order',
      JSON.stringify(firstKept.slice().sort()) === JSON.stringify(secondKept.slice().sort()) &&
      firstKept.length === 6, String(firstKept.length));
    await one.close(); await two.close();
  }

  // ---- 2. It holds still while you are reading it ----
  {
    const p=await open(b, 42);
    await toStream(p);
    const before = await stream(p);

    // Another page of the stream must continue rather than start again.
    const firstPage = await p.evaluate(()=>outfitDisplayed.map(c=>comboKey(c)));
    await p.evaluate(()=>loadMoreOutfits()); await p.waitForTimeout(800);
    const twoPages = await p.evaluate(()=>outfitDisplayed.map(c=>comboKey(c)));
    check('the next page carries on from the last',
      JSON.stringify(twoPages.slice(0, firstPage.length)) === JSON.stringify(firstPage));
    check('and repeats none of it',
      new Set(twoPages).size === twoPages.length,
      `${twoPages.length} outfits, ${new Set(twoPages).size} of them different`);

    // Changing a filter rebuilds the generator from scratch; the order it
    // deals has to be the one you were already reading.
    await p.evaluate(()=>{ outfitFilters['Jackets'] = {type:'none', ids:[]};
                           resetOutfitResults(); });
    await p.waitForTimeout(900);
    await p.evaluate(()=>{ outfitFilters = emptySlotFilters(); resetOutfitResults(); });
    await p.waitForTimeout(900);
    check('a filter set and taken off again leaves the order as it was',
      JSON.stringify(await stream(p)) === JSON.stringify(before));

    // And a reload is the same visit.
    await p.reload(); await p.waitForTimeout(1500);
    await toStream(p);
    check('a reload is still the same visit',
      JSON.stringify(await stream(p)) === JSON.stringify(before));
    await p.close();
  }

  // ---- 3. Left to itself, it picks its own and remembers it ----
  {
    const p=await open(b, null);
    const held = await p.evaluate(()=>sessionStorage.getItem('wardrobe-session-seed'));
    check('a seed is put away for the visit', held !== null && held !== '', String(held));
    await toStream(p);
    const before = await stream(p);
    await p.reload(); await p.waitForTimeout(1500);
    await toStream(p);
    check('and the same one is picked up again on a reload',
      (await p.evaluate(()=>sessionStorage.getItem('wardrobe-session-seed'))) === held &&
      JSON.stringify(await stream(p)) === JSON.stringify(before));
    await p.close();
  }

  // ---- 4. The shuffle deals, it does not drop ----
  {
    const p=await open(b, 7);
    await toStream(p);
    check('every piece of a category is still in the list it was shuffled from',
      await p.evaluate(()=>{
        const drawn = new Set(slotList(outfitFilters, 'top').filter(Boolean).map(i=>i.id));
        const owned = itemsInTab('Tops').map(i=>i.id);
        return owned.length > 0 && owned.every(id => drawn.has(id)) &&
               drawn.size === owned.length;
      }));
    check('an optional layer still leads with going without it',
      await p.evaluate(()=>slotList(outfitFilters, 'jacket')[0] === null));
    check('and the shuffle is the same answer twice in a row',
      await p.evaluate(()=>{
        const a = slotList(outfitFilters, 'top').filter(Boolean).map(i=>i.id);
        const b = slotList(outfitFilters, 'top').filter(Boolean).map(i=>i.id);
        return JSON.stringify(a) === JSON.stringify(b);
      }));
    await p.close();
  }

  // ---- 5. A thin filter still finds its outfits ----
  {
    // One piece carries the tag, so the outfits that match are a sliver of
    // the space and land wherever the shuffle puts them. Every deal has to
    // find them, or the page reads as empty while the count underneath it
    // says otherwise.
    for(const deal of [1, 42, 987654321, 5150]){
      const p=await b.newPage({viewport:{width:390,height:900}});
      p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
      await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
        body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SESSION_SEED=${deal};`+
             `window.__SEED_TAGS=${JSON.stringify({seed_22:['sporty']})};\n${fake}`}));
      await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
        body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
      await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
      await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
      await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
      await toStream(p);
      const got = await p.evaluate(()=>{
        outfitTags = ['sporty']; resetOutfitResults();
        return {shown: outfitDisplayed.length, total: totalComboCount(),
                right: outfitDisplayed.every(c =>
                  comboPieces(c).some(x => (x.tags||[]).includes('sporty')))};
      });
      check(`deal ${deal} fills a page from a tag one piece carries`,
        got.shown === 24 && got.right && got.total > 0,
        `${got.shown} shown of ${got.total}`);
      await p.close();
    }
  }

  // ---- 6. Nothing matching is still nothing, quickly ----
  {
    const p=await open(b, 3);
    await toStream(p);
    const r = await p.evaluate(()=>{
      const t0 = performance.now();
      outfitFilters['Tops'] = {type:'none', ids:[]};
      outfitFilters['Dresses'] = {type:'none', ids:[]};
      resetOutfitResults();
      return {ms: Math.round(performance.now() - t0),
              shown: outfitDisplayed.length, total: totalComboCount()};
    });
    check('an impossible filter shows nothing rather than walking the space',
      r.shown === 0 && r.total === 0 && r.ms < 500, JSON.stringify(r));
    check('and says so', (await p.textContent('#outfit-empty-title')).trim() === 'No outfits match',
      (await p.textContent('#outfit-empty-title')).trim());
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
