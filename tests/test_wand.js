// Deal again, now.
//
// The order is dealt once a visit, which is right for not being handed the
// same outfit twice while you scroll — but it means that if the first
// screen does nothing for you, you are stuck with it until tomorrow. The
// wand is the way out: a new hand on demand.
//
// It belongs only to the half that deals. What you kept is a list you
// made, and shuffling your own decisions is not a feature.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const FAVS = [{combo_key:'tb|seed_22|seed_11|none|none|none', base:'topbottom',
  top_id:'seed_22', bottom_id:'seed_11', dress_id:null, jumper_id:null,
  jacket_id:null, shoe_id:null, extra_ids:[], archived_at:null, created_at:'2026-01-01'}];

async function open(b, items){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${items === undefined ? seed : items};window.__WITH_CAPSULES=true;`+
         `window.__SEED_OUTFITS=${JSON.stringify(FAVS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const shown = p => p.evaluate(()=>
  getComputedStyle(document.getElementById('shuffle-fab')).display !== 'none');
const box = p => p.evaluate(()=>{
  const r = document.getElementById('shuffle-fab').getBoundingClientRect();
  return {w:Math.round(r.width), h:Math.round(r.height),
          top:Math.round(r.top), bottom:Math.round(r.bottom),
          right:Math.round(window.innerWidth - r.right)};
});
const stream = p => p.evaluate(()=>outfitDisplayed.slice(0, 8).map(c=>comboKey(c)));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Where it is, and where it is not ----
  {
    const p=await open(b);
    check('nothing to deal on the wardrobe, so no wand', !(await shown(p)));

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
    check('it is there on the half that deals', await shown(p));
    const r = await box(p);
    check('a full thumb', r.w >= 44 && r.h >= 44, `${r.w}x${r.h}`);
    check('at the right edge, out of the middle where the pill is',
      r.right === 16, `${r.right}px from the right`);
    check('and it says what it does to a screen reader',
      (await p.getAttribute('#shuffle-fab', 'aria-label')) === 'Shuffle the outfits');

    // The panel's chips run to its foot, so the wand has to be above them.
    const open1 = await p.evaluate(()=>{
      const sheet = document.getElementById('filter-sheet').getBoundingClientRect();
      const fab = document.getElementById('shuffle-fab').getBoundingClientRect();
      return {sheetTop: Math.round(sheet.top), fabBottom: Math.round(fab.bottom),
              open: filterSheetOpen()};
    });
    check('with the filters open it sits above them, not over them',
      open1.open && open1.fabBottom <= open1.sheetTop, JSON.stringify(open1));

    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(700);
    const shut = await box(p);
    check('and it comes back down when they collapse',
      shut.bottom > open1.fabBottom, `${shut.bottom} vs ${open1.fabBottom}`);
    check('level with the filters pill', await p.evaluate(()=>{
      const fab = document.getElementById('shuffle-fab').getBoundingClientRect();
      const pill = document.getElementById('filters-fab').getBoundingClientRect();
      return Math.abs(fab.bottom - pill.bottom) <= 2;
    }));
    check('and clear of the nav', await p.evaluate(()=>{
      const fab = document.getElementById('shuffle-fab').getBoundingClientRect();
      const bar = document.getElementById('bottom-bar').getBoundingClientRect();
      return bar.top - fab.bottom >= 8;
    }));

    await toFaves(p, 1100);
    check('no wand over what you kept', !(await shown(p)));
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(900);
    check('nor over capsules', !(await shown(p)));
    await p.close();
  }

  // ---- 2. What it does ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(600);

    const before = await stream(p);
    const seedBefore = await p.evaluate(()=>sessionSeed);
    const totalBefore = await p.evaluate(()=>totalComboCount());
    const heroBefore = await p.evaluate(()=>heroCombo && comboKey(heroCombo));

    await p.click('#shuffle-fab'); await p.waitForTimeout(1000);

    check('it deals a different hand',
      JSON.stringify(await stream(p)) !== JSON.stringify(before),
      `${before[0]} -> ${(await stream(p))[0]}`);
    check('from a new seed', (await p.evaluate(()=>sessionSeed)) !== seedBefore);
    check('out of the same wardrobe',
      (await p.evaluate(()=>totalComboCount())) === totalBefore);
    check('the lead card is dealt again too',
      (await p.evaluate(()=>heroCombo && comboKey(heroCombo))) !== heroBefore,
      `${heroBefore} -> ${await p.evaluate(()=>heroCombo && comboKey(heroCombo))}`);
    check('and the new hand is kept for the rest of the visit',
      await p.evaluate(()=>String(sessionSeed) === sessionStorage.getItem('wardrobe-session-seed')));

    // The point of it is the outfits you have not seen.
    check('it takes you back to the top',
      (await p.evaluate(()=>Math.round(window.scrollY))) === 0);
    await p.close();
  }

  // ---- 3. It deals rather than discards ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(600);

    // A filter set before the shuffle is still set after it: dealing again
    // is not clearing what you asked for.
    await p.evaluate(()=>{ outfitFilters['Jackets'] = {type:'none', ids:[]};
                           renderFilterControls(); resetOutfitResults(); });
    await p.waitForTimeout(800);
    const narrowed = await p.evaluate(()=>totalComboCount());
    await p.click('#shuffle-fab'); await p.waitForTimeout(1000);
    check('a filter survives the shuffle',
      await p.evaluate(()=>outfitFilters['Jackets'].type === 'none'));
    check('and still narrows the new hand',
      (await p.evaluate(()=>totalComboCount())) === narrowed &&
      await p.evaluate(()=>outfitDisplayed.every(c=>!c.jacket)));

    // What you kept is untouched by any of it.
    check('nothing was kept or unkept', await p.evaluate(()=>favoriteOutfits.length === 1));
    await p.close();
  }

  // ---- 4. Nothing to deal ----
  {
    const p=await open(b, '[]');
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    check('an empty wardrobe offers no wand', !(await shown(p)));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
