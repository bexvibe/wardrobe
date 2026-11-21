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
// The suite is about a wardrobe that owns no skirts, so leave the skirt out.
const seed=JSON.stringify(JSON.parse(fs.readFileSync(REPO + '/supabase/seed-items.json','utf8')).filter(r=>r.category!=='Skirts'));
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
  await plus(p);
  return p;
}

// An empty Faves page has its + in the middle rather than the header.
async function plus(p){
  await p.click(await p.isVisible('#build-outfit-btn') ? '#build-outfit-btn' : '#saved-empty-action');
  await p.waitForTimeout(800);
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

    // An empty page puts its + in the middle and takes the header's away.
    check('Faves offers a way to build one, in the middle of its empty state',
      await p.isVisible('#saved-empty-action') && !(await p.isVisible('#build-outfit-btn')));

    await p.click('#saved-empty-action'); await p.waitForTimeout(800);
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
    check('and there is no preview on the page',
      await p.evaluate(()=>!document.querySelector('.builder-preview, #builder-preview-slot')));
    await p.close();
  }

  // ---- 2. Any pieces make an outfit; tops take two ----
  {
    const p=await open(b);
    await pick(p, 'Tops', 0);
    check('one piece is already an outfit worth keeping', await saveOn(p));
    check('and the page stays without a preview',
      await p.evaluate(()=>!document.querySelector('.builder-preview')));
    const first = (await picks(p)).top;

    await pick(p, 'Tops', 1);
    const now = await picks(p);
    check('a second top goes over the first, so a shirt can be worn open',
      now.top === first && now.overtop && now.overtop !== first, JSON.stringify(now));
    check('and both tiles are ticked',
      await p.evaluate(()=>document.querySelectorAll(
        '#builder-gallery .picker-selected').length === 2));

    await p.click('#builder-gallery .picker-tile >> nth=0'); await p.waitForTimeout(500);
    const after = await picks(p);
    check('tapping the worn one takes it off, and the shirt becomes the top',
      after.top && after.top !== first && !after.overtop, JSON.stringify(after));

    await pick(p, 'Pants', 0);
    check('a top and a bottom is an outfit', await saveOn(p));
    await pick(p, 'Jackets', 0);
    check('a jacket goes over it without changing that', await saveOn(p));
    check('the draft holds all three',
      await p.evaluate(()=>['top','bottom','jacket'].every(s=>outfitDraft.picks[s])));

    // The tabs are only categories: nothing is ticked on them.
    check('no ticks on the tabs at the top',
      (await ticked(p)).length === 0 &&
      await p.evaluate(()=>!document.querySelector('#builder-tabs .tab-tick')),
      (await ticked(p)).join(', '));
    await p.close();
  }

  // ---- 3. Free to build anything, except a dress beside a top ----
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
    check('and it is a dress outfit now',
      await p.evaluate(()=>draftCombo().base === 'dress'));

    await pick(p, 'Tops', 0);
    const back = await picks(p);
    check('picking a top puts the dress back', !back.dress && back.top, JSON.stringify(back));
    check('and a top alone can be saved', await saveOn(p));

    // Stated once, over the shapes themselves.
    check('any set of pieces is an outfit, and nothing at all is not',
      await p.evaluate(()=>{
        const id = tab => itemsInTab(tab)[0].id;
        const [t, b, d, j] = ['Tops','Pants','Dresses','Jackets'].map(id);
        const empty = {top:null, overtop:null, bottom:null, dress:null, jumper:null, jacket:null};
        const shape = picks => { outfitDraft.picks = Object.assign({}, empty, picks); const c = draftCombo(); return c && c.base; };
        return shape({top:t, bottom:b}) === 'topbottom'
            && shape({dress:d}) === 'dress'
            && shape({top:t}) === 'topbottom'
            && shape({bottom:b, jacket:j}) === 'topbottom'
            && shape({jacket:j}) === 'topbottom'
            && shape({}) === null;
      }));
    check('a shirt over a top is kept in the outfit\'s key',
      await p.evaluate(()=>{
        const tops = itemsInTab('Tops');
        outfitDraft.picks = {top:tops[0].id, overtop:tops[1].id, bottom:null, dress:null, jumper:null, jacket:null};
        const k1 = comboKey(draftCombo());
        outfitDraft.picks.overtop = null;
        return k1 !== comboKey(draftCombo()) && k1.endsWith('|' + tops[1].id);
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
    check('you are back on Faves, with the outfit\'s page open',
      await p.evaluate(()=>appMode==='saved' &&
        outfitPageShowing()));
    check('so accessories are one tap away',
      await p.evaluate(k=>{
        const t = sheetTrail[sheetTrail.length-1];
        return Boolean(t) && t.sheet==='outfit' && t.id===k;
      }, key) && await p.isVisible('#outfit-page-extras'));
    await p.click('#outfit-page-back'); await p.waitForTimeout(600);
    check('and it is on the page', await p.evaluate(()=>
      document.querySelectorAll('#saved-view .outfit-card').length === 1));

    // The whole point: one record, so the heart already knows.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
    check('the same outfit is one the generator makes',
      await p.evaluate(k=>{
        let n = 0;
        for(const c of comboGenerator()){ if(comboKey(c) === k) return true; if(++n > 400000) break; }
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
    await p.click('#outfit-page-back'); await p.waitForTimeout(600);   // it opens on its page

    // Build the identical one again.
    await plus(p);
    await pick(p, 'Tops', 0);
    await pick(p, 'Pants', 0);
    check('an outfit you already kept cannot be kept again', !(await saveOn(p)));
    check('and the button says why, rather than failing at the end',
      (await p.textContent('#builder-save-btn')).trim() === 'Already faved',
      (await p.textContent('#builder-save-btn')).trim());

    await pick(p, 'Pants', 1);
    check('changing a piece makes it keepable again', await saveOn(p));
    await p.close();
  }

  // ---- 6. Backing out of a half-built one asks first ----
  {
    const p=await open(b);
    await p.click('#modal .sheet-footer .btn.secondary'); await p.waitForTimeout(600);
    check('an untouched one just closes',
      await p.evaluate(()=>!document.getElementById('confirm-backdrop').classList.contains('open') &&
        !document.getElementById('modal-backdrop').classList.contains('open')));

    await plus(p);
    await pick(p, 'Tops', 0);
    await p.click('#modal .sheet-footer .btn.secondary'); await p.waitForTimeout(600);
    check('one with a piece in it stops to ask',
      await p.evaluate(()=>document.getElementById('confirm-backdrop').classList.contains('open')));
    check('naming what would be lost',
      /outfit/i.test(await p.textContent('#confirm-body')),
      (await p.textContent('#confirm-body')).trim());

    await p.click('#confirm-stay'); await p.waitForTimeout(500);
    check('staying keeps the draft',
      await p.evaluate(()=>Boolean(outfitDraft && outfitDraft.picks.top)));
    await p.click('#modal .sheet-footer .btn.secondary'); await p.waitForTimeout(500);
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
