// Accessories belong to a combination, not to a kept outfit.
//
// There are three things you can do to a combination: keep it, hide it,
// and dress it. The first two were always marks against a combo_key in a
// table of their own; the third used to be a column on the kept outfit,
// which meant you could only dress something you had already decided to
// keep — and meant the same outfit looked different depending on which
// page you met it on.
//
// So the two properties this suite is about: dressing decides nothing
// about keeping, and an outfit wears the same accessories wherever it
// appears.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b, extra){
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;${extra||''}\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
  return p;
}

// Open the first generated outfit and put the first accessory on it.
async function dressFirst(p){
  await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(700);
  const key = await p.evaluate(()=>expandedComboKey);
  await p.click('.outfit-card.expanded .modal-actions button:has-text("accessories")');
  await p.waitForTimeout(700);
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(700);
  await p.evaluate(()=>closeModal()); await p.waitForTimeout(600);
  return key;
}

const rows = p => p.evaluate(()=>window.__WARDROBE_STATE.outfit_extras.slice());

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Dressing something you have not kept ----
  {
    const p=await open(b);
    await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(700);
    const key = await p.evaluate(()=>expandedComboKey);
    check('an outfit you have not kept is not kept', !(await p.evaluate(k=>isFavorited(k), key)));
    check('and it still offers accessories',
      await p.isVisible('.outfit-card.expanded .modal-actions button:has-text("Add accessories")'));

    await p.click('.outfit-card.expanded .modal-actions button:has-text("accessories")');
    await p.waitForTimeout(700);
    await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(700);

    check('the accessory goes on', (await p.evaluate(k=>extrasFor(k).length, key)) === 1);
    check('written against the combination',
      (await rows(p)).length === 1 && (await rows(p))[0].combo_key === key,
      JSON.stringify(await rows(p)));
    // The whole point of the move.
    check('and it did not quietly keep the outfit',
      await p.evaluate(k=>!isFavorited(k) && window.__WARDROBE_STATE.saved_outfits.length === 0, key));

    await p.evaluate(()=>closeModal()); await p.waitForTimeout(600);
    check('the card wears it', await p.evaluate(()=>
      document.querySelectorAll('.outfit-card.expanded .outfit-extras img').length === 1));
    check('the heart is still empty, because nothing was decided',
      await p.evaluate(()=>!document.querySelector('.outfit-card.expanded .outfit-fav-btn')
        .classList.contains('favorited')));
    check('and the button offers the way back in',
      await p.isVisible('.outfit-card.expanded .modal-actions button:has-text("Edit accessories")'));
    await p.close();
  }

  // ---- 2. The same outfit wears the same thing on both pages ----
  {
    const p=await open(b);
    const key = await dressFirst(p);
    await p.evaluate(k=>toggleFavoriteByKey(k), key);
    await p.waitForFunction(()=>favoriteOutfits.length === 1);
    await p.waitForTimeout(600);

    await toFaves(p, 1200);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    check('keeping it does not undress it', await p.evaluate(()=>
      document.querySelectorAll('#saved-gallery .outfit-extras img').length === 1));
    check('and nothing was copied onto the kept row',
      await p.evaluate(()=>{
        const row = window.__WARDROBE_STATE.saved_outfits[0];
        return !row.extra_ids || row.extra_ids.length === 0;
      }));

    // Take the fave away: the outfit stops being kept, stays dressed.
    await p.evaluate(k=>unfavoriteByKey(k), key);
    await p.waitForTimeout(800);
    check('un-keeping it does not undress it either',
      await p.evaluate(k=>extrasFor(k).length === 1 && !isFavorited(k), key));
    await p.close();
  }

  // ---- 3. Taking it all off removes the row rather than emptying it ----
  {
    const p=await open(b);
    const key = await dressFirst(p);
    check('one row while it is wearing something', (await rows(p)).length === 1);

    await p.click('.outfit-card.expanded .modal-actions button:has-text("accessories")');
    await p.waitForTimeout(700);
    await p.click('#extras-gallery .picker-selected'); await p.waitForTimeout(700);
    check('taking the last one off leaves no row behind',
      (await rows(p)).length === 0, JSON.stringify(await rows(p)));
    check('and the app agrees it is bare', await p.evaluate(k=>extrasFor(k).length === 0, key));
    await p.close();
  }

  // ---- 4. It survives a reload, because it is really saved ----
  {
    const p=await open(b);
    const key = await dressFirst(p);
    await p.reload(); await p.waitForTimeout(1400);
    check('the accessory is still on after a reload',
      await p.evaluate(k=>extrasFor(k).length === 1, key));
    await p.close();
  }

  // ---- 5. A database without the table says nothing about accessories ----
  {
    const p=await open(b, 'window.__NO_EXTRAS=true;');
    check('the app still loads', await p.isVisible('#outfit-gallery'));
    check('and reports the feature as missing', !(await p.evaluate(()=>extrasAvailable)));
    await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(700);
    check('so no accessories button is offered',
      !(await p.isVisible('.outfit-card.expanded .modal-actions button:has-text("accessories")')));
    check('while the rest of the card is untouched',
      await p.isVisible('.outfit-card.expanded .modal-actions button:has-text("Hide this combo")'));
    await p.close();
  }

  // ---- 6. An outfit kept when the shoe was still part of the key ----
  {
    // Its stored combo_key carries the shoe; the key this clothing would be
    // given today does not. The accessories have to be found under the key
    // it was stored with, or a migrated outfit loses them silently.
    const KEY = 'tb|seed_22|seed_11|none|none|seed_9';
    const p=await open(b,
      `window.__SEED_OUTFITS=[{combo_key:'${KEY}',base:'topbottom',` +
      `top_id:'seed_22',bottom_id:'seed_11',dress_id:null,jumper_id:null,jacket_id:null,` +
      `shoe_id:'seed_9',extra_ids:[],archived_at:null,created_at:'2026-01-01'}];` +
      `window.__SEED_EXTRAS=[{combo_key:'${KEY}',extra_ids:['seed_9']}];`);
    await toFaves(p, 1200);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    check('the stored key is not the key it would be given today',
      await p.evaluate(()=>{
        const rec = favoriteOutfits[0];
        return rec.key !== comboKey(favoriteRecordToCombo(rec));
      }));
    check('and it still wears its shoe', await p.evaluate(()=>
      document.querySelectorAll('#saved-gallery .outfit-extras img').length === 1));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
