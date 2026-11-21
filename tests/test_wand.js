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
    // On All the wand floats at the bottom and deals the featured card in place.
    check('on All Shuffle floats at the bottom', await shown(p));
    check('and Filters sits up by New fave', await p.evaluate(()=>{
      const f = document.getElementById('filters-fab');
      return f.parentElement.id === 'outfit-tabs' && getComputedStyle(f).display !== 'none';
    }));
    await p.click('#outfit-hero .hero-feature'); await p.waitForTimeout(600);
    check('it says what it is, in the popup',
      (await p.textContent('#hero-pop-shuffle')).trim() === 'Shuffle');
    check('and draws the wand rather than typing one',
      await p.evaluate(()=>Boolean(document.querySelector('#hero-pop-shuffle .wand path'))));
    check('in the one colour the app allows itself',
      await p.evaluate(()=>getComputedStyle(document.getElementById('hero-pop-shuffle')).backgroundColor === 'rgb(117, 102, 148)'));
    check('a full thumb', await p.evaluate(()=>document.getElementById('hero-pop-shuffle').getBoundingClientRect().height >= 44));
    await p.evaluate(()=>closeHeroPopup()); await p.waitForTimeout(500);

    await toFaves(p, 1100);
    const keptCards = await p.evaluate(()=>document.querySelectorAll('#saved-view .outfit-card').length);
    check('the wand is over what you kept, when there is any',
      (await shown(p)) === (keptCards > 0), `${keptCards} cards`);
    if(keptCards > 0){
      // As on All: Filters up by New fave, Shuffle floating on its own.
      check('on Faves Filters sits up by New fave too', await p.evaluate(()=>
        document.getElementById('filters-fab').parentElement.id === 'saved-tabs'));
      check('and Shuffle floats on its own', await p.evaluate(()=>
        document.getElementById('shuffle-fab').parentElement.id === 'float-row'));
      const before = await p.evaluate(()=>comboKey(heroCombo));
      await p.click('#shuffle-fab'); await p.waitForTimeout(800);
      check('and deals another fave as the featured one',
        keptCards < 2 || (await p.evaluate(()=>comboKey(heroCombo))) !== before);
    }
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

    // From further down the page: dealing should bring you to what it dealt.
    await p.evaluate(()=>window.scrollTo(0, 600)); await p.waitForTimeout(300);
    await p.click('#outfit-hero .hero-feature'); await p.waitForTimeout(600);
    await p.click('#hero-pop-shuffle'); await p.waitForTimeout(800);

    check('on All it deals the hero again',
      (await p.evaluate(()=>heroCombo && comboKey(heroCombo))) !== heroBefore,
      `${heroBefore} -> ${await p.evaluate(()=>heroCombo && comboKey(heroCombo))}`);
    check('and leaves the grid where it was',
      JSON.stringify(await stream(p)) === JSON.stringify(before));
    check('without reshuffling the whole page', (await p.evaluate(()=>sessionSeed)) === seedBefore);
    check('out of the same wardrobe',
      (await p.evaluate(()=>totalComboCount())) === totalBefore);
    check('and the new hero is kept for the rest of the visit',
      await p.evaluate(()=>{ const k = readStoredHero(); return !!k && comboKey(k) === comboKey(heroCombo); }));
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
    await p.click('#outfit-hero .hero-feature'); await p.waitForTimeout(600);
    await p.click('#hero-pop-shuffle'); await p.waitForTimeout(1000);
    check('a filter survives the shuffle',
      await p.evaluate(()=>outfitFilters['Jackets'].type === 'none'));
    check('and the new hero still has no jacket',
      (await p.evaluate(()=>totalComboCount())) === narrowed &&
      await p.evaluate(()=>!heroCombo.jacket));

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
