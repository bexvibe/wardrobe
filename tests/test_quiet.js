// A toast earns its place when it carries an undo you could not perform
// yourself, or reports something you cannot see. It does not earn it by
// narrating a change you just watched happen under your thumb.
//
// The two pickers are the clearest case: a tile or a row ticks where you
// tapped it, and the same tap takes it off again. Favouriting is the same —
// the heart fills on the card you tapped. Taking a fave away is the one
// asymmetric case, because on Faves the card goes with it and there is
// nothing left to tap.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const SAVED=[{combo_key:'tb|seed_22|seed_11|none|none|none', base:'topbottom',
  top_id:'seed_22', bottom_id:'seed_11', dress_id:null, jumper_id:null, jacket_id:null,
  shoe_id:null, extra_ids:[], archived_at:null, created_at:'2026-01-01'}];

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;`+
         `window.__SEED_OUTFITS=${JSON.stringify(SAVED)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

const toastUp = p => p.evaluate(()=>{
  const t = document.getElementById('toast');
  return {shown: t.classList.contains('show'), said: t.textContent.trim()};
});
const hush = p => p.evaluate(()=>{
  document.getElementById('toast').classList.remove('show');
});

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The accessories picker says nothing ----
  {
    const p=await open(b);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    await p.click('#saved-gallery .outfit-card'); await p.waitForTimeout(500);
    await p.click('#saved-gallery .modal-actions button'); await p.waitForTimeout(600);

    await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(700);
    const after = await toastUp(p);
    check('adding an accessory raises no toast', !after.shown, after.said);
    check('because the tile says it instead',
      await p.evaluate(()=>document.querySelectorAll('#extras-gallery .picker-selected').length===1));
    check('and it really was added',
      await p.evaluate(()=>extrasFor(favoriteOutfits[0].key).length===1));

    await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(700);
    check('taking it off is just as quiet', !(await toastUp(p)).shown);
    check('and the tick goes with it',
      await p.evaluate(()=>document.querySelectorAll('#extras-gallery .picker-selected').length===0 &&
                           extrasFor(favoriteOutfits[0].key).length===0));
    await p.close();
  }

  // ---- 2. The capsule picker, which is the same control ----
  {
    const p=await open(b);
    await p.evaluate(async()=>{ await saveCapsule({ id:null, name:'Winter', itemIds:[] }); });
    await p.waitForTimeout(500);
    await p.evaluate(()=>{ openModal('seed_0'); }); await p.waitForTimeout(600);
    await p.click('.modal-actions .btn:has-text("Add to capsule")'); await p.waitForTimeout(700);

    await p.click('.capsule-pick'); await p.waitForTimeout(700);
    check('ticking a capsule raises no toast', !(await toastUp(p)).shown);
    check('because the row ticks where you tapped it',
      await p.evaluate(()=>document.querySelector('.capsule-pick').classList.contains('picked')));
    check('and the piece really is in it',
      await p.evaluate(()=>capsules[0].itemIds.includes('seed_0')));

    await p.click('.capsule-pick'); await p.waitForTimeout(700);
    check('and unticking it is the way back, silently',
      !(await toastUp(p)).shown &&
      await p.evaluate(()=>!capsules[0].itemIds.includes('seed_0')));
    await p.close();
  }

  // ---- 3. Favouriting fills a heart; that is the whole message ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn');
    await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await hush(p);

    // One that is not already kept — the fixture starts with one on, and
    // tapping that heart would be taking it away rather than adding it.
    const was = await p.evaluate(()=>favoriteOutfits.length);
    await p.evaluate(()=>{
      const btn = Array.from(document.querySelectorAll('.outfit-gallery .outfit-fav-btn'))
        .find(b => !b.classList.contains('favorited'));
      (btn || document.querySelector('.outfit-gallery .outfit-fav-btn')).click();
    });
    await p.waitForFunction(n=>favoriteOutfits.length === n + 1, was);
    await p.waitForTimeout(400);
    check('keeping an outfit raises no toast', !(await toastUp(p)).shown,
      (await toastUp(p)).said);
    check('because the heart fills where you tapped',
      await p.evaluate(()=>document.querySelectorAll(
        '.outfit-gallery .outfit-fav-btn.favorited').length > 0));

    // Taking one away on Faves is the asymmetric one: the card goes too, so
    // there is nothing left to tap and the undo has to live somewhere.
    await p.click('#nav-saved-btn'); await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    await hush(p);
    await p.click('#saved-gallery .outfit-fav-btn'); await p.waitForTimeout(800);
    const gone = await toastUp(p);
    check('taking a fave away does raise one', gone.shown, gone.said);
    check('and it carries the undo, because the card has gone with it',
      await p.evaluate(()=>Boolean(document.querySelector('.toast-undo'))));
    await p.close();
  }

  // ---- 4. The ones that report what you cannot see are untouched ----
  {
    const p=await open(b);
    // Archiving a piece: it leaves the grid for a page you are not on.
    await p.click('#gallery .tile'); await p.waitForTimeout(700);
    await p.click('.modal-actions .btn:has-text("Edit")'); await p.waitForTimeout(700);
    await p.click('#form-item-actions .btn:has-text("Archive")'); await p.waitForTimeout(900);
    const archived = await toastUp(p);
    check('archiving still says so', archived.shown && /Archive/i.test(archived.said),
      archived.said);
    check('and still offers it back',
      await p.evaluate(()=>Boolean(document.querySelector('.toast-undo'))));
    await p.close();
  }

  // ---- 5. No picker anywhere narrates itself ----
  {
    // The rule, stated once against the source: nothing that toggles a
    // tile or a row in a picker may raise a toast. If a third picker is
    // added, this is where it gets caught.
    const src = fs.readFileSync(REPO + '/index.html', 'utf8');
    const togglers = ['toggleOutfitExtra', 'toggleItemCapsule', 'toggleSlotItem'];
    const noisy = togglers.filter(name => {
      const at = src.indexOf(`function ${name}(`);
      if(at < 0) return false;
      const body = src.slice(at, src.indexOf('\n}', at));
      return body.includes('showToast');
    });
    check('no picker toggle raises a toast', noisy.length === 0,
      noisy.join(', ') || 'toggleOutfitExtra, toggleItemCapsule, toggleSlotItem');
    // And the one that writes the accessories has no undo plumbing left.
    check('and the undo it used to carry is gone with it',
      !src.includes('undoLabel'));
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
