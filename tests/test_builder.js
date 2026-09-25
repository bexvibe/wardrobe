// Keeping an outfit you already had in mind, rather than finding one.
//
// The point of it is that there is no second kind of record: the builder
// makes a combo of the same shape the generator makes, so it has the same
// combo_key, so it IS the generated outfit. Nothing is synced — the heart
// on Outfits comes up filled by itself when that combination surfaces.
//
// That only holds while the builder can make nothing the generator cannot,
// which is what most of this suite is about.
//
// It is the capsule editor's sheet: category tabs, a grid of tiles, tap to
// pick. The one difference is arity — a capsule takes as many pieces as you
// like, an outfit takes one from each place — so a second tap in the same
// category has to move the tick rather than add to it.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await toFaves(p, 900);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
  await p.click('#build-outfit-btn'); await p.waitForTimeout(800);
  return p;
}

// Tap the nth tile on a category's tab, the way a thumb would.
async function pick(p, tab, n){
  await p.click(`#builder-tabs .tab:text-is("${tab}")`);
  await p.waitForTimeout(400);
  await p.click(`#builder-gallery .picker-tile >> nth=${n || 0}`);
  await p.waitForTimeout(500);
}
const picks  = p => p.evaluate(()=>outfitDraft.picks);
const saveOn = p => p.evaluate(()=>!document.getElementById('builder-save-btn').disabled);
const ticked = p => p.evaluate(()=>Array.from(document.querySelectorAll('#builder-tabs .tab'))
  .filter(t=>t.querySelector('.tab-tick')).map(t=>t.textContent.trim().replace(/\s*✓$/,'')));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The way in, and the sheet it opens ----
  {
    const p=await b.newPage({viewport:{width:390,height:900}});
    p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
    p.setDefaultTimeout(8000);
    await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
      body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;\n${fake}`}));
    await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
      body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
    await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
    await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
    await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
    await toFaves(p, 900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);

    check('Faves offers a way to build one', await p.isVisible('#build-outfit-btn'));
    check('and its empty state offers the same thing, where you would look',
      await p.isVisible('#saved-empty-action'));

    await p.click('#build-outfit-btn'); await p.waitForTimeout(800);
    check('it opens over Faves rather than taking you elsewhere',
      await p.evaluate(()=>appMode === 'saved' &&
        document.getElementById('modal-backdrop').classList.contains('open')));

    // The same sheet the capsule editor uses, so it is already learned.
    check('a category row and a grid of pieces, as when adding to a capsule',
      await p.evaluate(()=>Boolean(document.querySelector('#builder-tabs .tab')) &&
        document.querySelectorAll('#builder-gallery .picker-tile').length > 0));
    check('one tab per place an outfit has something, no All',
      JSON.stringify(await p.evaluate(()=>Array.from(
        document.querySelectorAll('#builder-tabs .tab')).map(e=>e.textContent.trim())))
        === JSON.stringify(['Tops','Pants','Dresses','Jumpers','Jackets']),
      (await p.evaluate(()=>Array.from(document.querySelectorAll('#builder-tabs .tab'))
        .map(e=>e.textContent.trim()))).join(', '));
    check('and the row sticks under the header as you scroll',
      await p.evaluate(()=>document.getElementById('builder-tabs')
        .classList.contains('stuck-row')));
    check('nothing to keep yet', !(await saveOn(p)));
    check('and no preview of an outfit that is not one',
      await p.evaluate(()=>!document.querySelector('.builder-preview')));
    await p.close();
  }

  // ---- 2. One from each place, and only one ----
  {
    const p=await open(b);
    await pick(p, 'Tops', 0);
    check('one piece does not make an outfit', !(await saveOn(p)));
    check('but it is already drawn, so you can see what you have',
      await p.evaluate(()=>Boolean(document.querySelector('.builder-preview img'))));
    const first = (await picks(p)).top;

    await pick(p, 'Tops', 1);
    const second = (await picks(p)).top;
    check('a second top replaces the first rather than joining it',
      second && second !== first, `${first} -> ${second}`);
    check('and only one tile is ticked',
      await p.evaluate(()=>document.querySelectorAll(
        '#builder-gallery .picker-selected').length === 1));

    await p.click('#builder-gallery .picker-tile >> nth=1'); await p.waitForTimeout(500);
    check('tapping the ticked one takes it off, as in the other pickers',
      !(await picks(p)).top);

    await pick(p, 'Tops', 0);
    await pick(p, 'Pants', 0);
    check('a top and a bottom is an outfit', await saveOn(p));
    await pick(p, 'Jackets', 0);
    check('a jacket goes over it without changing that', await saveOn(p));
    check('the draft holds all three',
      await p.evaluate(()=>['top','bottom','jacket'].every(s=>outfitDraft.picks[s])));

    // What you picked two tabs ago is still visible from here.
    check('every category you have taken from is ticked on its tab',
      JSON.stringify(await ticked(p)) === JSON.stringify(['Tops','Pants','Jackets']),
      (await ticked(p)).join(', '));
    await p.close();
  }

  // ---- 3. It cannot make a shape the generator cannot ----
  {
    const p=await open(b);
    await pick(p, 'Tops', 0);
    await pick(p, 'Pants', 0);
    await pick(p, 'Jackets', 0);

    await pick(p, 'Dresses', 0);
    const after = await picks(p);
    check('picking a dress puts the top and the bottom back',
      !after.top && !after.bottom && after.dress, JSON.stringify(after));
    check('but keeps what goes over either', Boolean(after.jacket));
    check('the tabs say so too',
      JSON.stringify(await ticked(p)) === JSON.stringify(['Dresses','Jackets']),
      (await ticked(p)).join(', '));
    check('and it is a dress outfit now',
      await p.evaluate(()=>draftCombo().base === 'dress'));

    await pick(p, 'Tops', 0);
    const back = await picks(p);
    check('picking a top puts the dress back', !back.dress && back.top, JSON.stringify(back));
    check('which is not an outfit again until it has a bottom', !(await saveOn(p)));

    // Stated once, over the shapes themselves.
    check('so every shape it can build is one the generator knows',
      await p.evaluate(()=>{
        const id = tab => itemsInTab(tab)[0].id;
        const [t, b, d, j] = ['Tops','Pants','Dresses','Jackets'].map(id);
        const shape = picks => { outfitDraft.picks = picks; const c = draftCombo(); return c && c.base; };
        return shape({top:t, bottom:b, dress:null, jumper:null, jacket:null}) === 'topbottom'
            && shape({top:null, bottom:null, dress:d, jumper:null, jacket:null}) === 'dress'
            && shape({top:t, bottom:null, dress:null, jumper:null, jacket:null}) === null
            && shape({top:null, bottom:b, dress:null, jumper:null, jacket:j}) === null;
      }));
    await p.close();
  }

  // ---- 4. Keeping one, and what it is once kept ----
  {
    const p=await open(b);
    await pick(p, 'Tops', 0);
    await pick(p, 'Pants', 0);
    const key = await p.evaluate(()=>comboKey(draftCombo()));

    await p.click('#builder-save-btn');
    await p.waitForFunction(()=>favoriteOutfits.length === 1);
    await p.waitForTimeout(700);

    check('it is kept', await p.evaluate(k=>isFavorited(k), key));
    check('written as a saved outfit, not as something new',
      await p.evaluate(k=>{
        const rows = window.__WARDROBE_STATE.saved_outfits;
        return rows.length===1 && rows[0].combo_key===k && rows[0].archived_at===null;
      }, key));
    check('the sheet is gone and you are back on Faves',
      await p.evaluate(()=>appMode==='saved' &&
        !document.getElementById('modal-backdrop').classList.contains('open')));
    check('with the card open, so accessories are one tap away',
      await p.evaluate(k=>expandedSavedKey===k, key));
    check('and it is on the page', await p.evaluate(()=>
      document.querySelectorAll('#saved-gallery .outfit-card').length === 1));

    // The whole point: one record, so the heart already knows.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
    check('the same outfit is one the generator makes',
      await p.evaluate(k=>{
        let n = 0;
        for(const c of comboGenerator()){ if(comboKey(c) === k) return true; if(++n > 60000) break; }
        return false;
      }, key));
    check('and its heart is filled without anything being told to fill it',
      await p.evaluate(k=>isFavorited(k), key));
    await p.close();
  }

  // ---- 5. It will not keep the same outfit twice ----
  {
    const p=await open(b);
    await pick(p, 'Tops', 0);
    await pick(p, 'Pants', 0);
    await p.click('#builder-save-btn');
    await p.waitForFunction(()=>favoriteOutfits.length === 1);
    await p.waitForTimeout(700);

    // Build the identical one again.
    await p.click('#build-outfit-btn'); await p.waitForTimeout(800);
    await pick(p, 'Tops', 0);
    await pick(p, 'Pants', 0);
    check('an outfit you already kept cannot be kept again', !(await saveOn(p)));
    check('and the button says why, rather than failing at the end',
      (await p.textContent('#builder-save-btn')).trim() === 'Already kept',
      (await p.textContent('#builder-save-btn')).trim());

    await pick(p, 'Pants', 1);
    check('changing a piece makes it keepable again', await saveOn(p));
    await p.close();
  }

  // ---- 6. Backing out of a half-built one asks first ----
  {
    const p=await open(b);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(600);
    check('an untouched one just closes',
      await p.evaluate(()=>!document.getElementById('confirm-backdrop').classList.contains('open') &&
        !document.getElementById('modal-backdrop').classList.contains('open')));

    await p.click('#build-outfit-btn'); await p.waitForTimeout(800);
    await pick(p, 'Tops', 0);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(600);
    check('one with a piece in it stops to ask',
      await p.evaluate(()=>document.getElementById('confirm-backdrop').classList.contains('open')));
    check('naming what would be lost',
      /outfit/i.test(await p.textContent('#confirm-body')),
      (await p.textContent('#confirm-body')).trim());

    await p.click('#confirm-stay'); await p.waitForTimeout(500);
    check('staying keeps the draft',
      await p.evaluate(()=>Boolean(outfitDraft && outfitDraft.picks.top)));
    await p.click('.modal .sheet-back'); await p.waitForTimeout(500);
    await p.click('#confirm-go'); await p.waitForTimeout(700);
    check('leaving throws it away and keeps nothing',
      await p.evaluate(()=>outfitDraft === null && favoriteOutfits.length === 0));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
