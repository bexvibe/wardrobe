// Faves is a switch inside Outfits, not a destination beside it.
//
// What you kept is a subset of what the generator makes — the heart marks
// a combination rather than moving it somewhere else — so the two were
// never two places. They were two pages holding the same cards behind the
// same controls, and the controls had drifted apart: filters set on one
// meant nothing on the other, an outfit you had hidden went on sitting on
// Faves, and only one of them could build one.
//
// So: three destinations, a switch in the one you are on, and everything
// a page has shared between its two halves.
const { chromium } = require('playwright');
const { toFaves, toAll } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const FAVS = [
  {combo_key:'tb|seed_22|seed_11|none|seed_0|none', base:'topbottom',
   top_id:'seed_22', bottom_id:'seed_11', dress_id:null,
   jumper_id:null, jacket_id:'seed_0', shoe_id:null, extra_ids:[],
   archived_at:null, created_at:'2026-01-01'},
  {combo_key:'tb|seed_23|seed_12|none|none|none', base:'topbottom',
   top_id:'seed_23', bottom_id:'seed_12', dress_id:null,
   jumper_id:null, jacket_id:null, shoe_id:null, extra_ids:[],
   archived_at:null, created_at:'2026-01-02'},
  {combo_key:'dress|seed_32|none|none|none', base:'dress',
   top_id:null, bottom_id:null, dress_id:'seed_32',
   jumper_id:null, jacket_id:null, shoe_id:null, extra_ids:[],
   archived_at:null, created_at:'2026-01-03'},
];

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;`+
         `window.__SEED_OUTFITS=${JSON.stringify(FAVS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const dests = p => p.evaluate(()=>Array.from(
  document.querySelectorAll('#bottom-bar .bottom-btn'))
    .map(e=>e.textContent.trim().replace(/\s+/g,' ')));
const segs = p => p.evaluate(()=>Array.from(document.querySelectorAll('.nav-seg'))
  .map(e=>({id:e.id, on:e.classList.contains('on'), pressed:e.getAttribute('aria-pressed'),
            w:Math.round(e.getBoundingClientRect().width),
            h:Math.round(e.getBoundingClientRect().height)})));
const cards = p => p.evaluate(()=>
  document.querySelectorAll('#saved-gallery .outfit-card').length);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The bar ----
  {
    const p=await open(b);
    check('three destinations, not four',
      JSON.stringify(await dests(p)) === JSON.stringify(['Wardrobe','Outfits ♡','Capsules']),
      (await dests(p)).join(' | '));
    // Both ways in are on the bar from the start: what you kept is one tap
    // from the wardrobe, not a control you have to arrive somewhere to
    // find.
    const cold = await segs(p);
    check('the switch is there before you go anywhere', cold.length === 2,
      JSON.stringify(cold));
    check('with neither half lit, because you are not there yet',
      !cold[0].on && !cold[1].on);
    check('and the heart goes straight to what you kept', await (async()=>{
      await p.click('#nav-saved-btn');
      await p.waitForFunction(()=>appMode === 'saved');
      await p.waitForTimeout(1000);
      return (await segs(p))[1].on;
    })());

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    const s = await segs(p);
    check('and the word goes to everything', s.length === 2, JSON.stringify(s));
    check('which starts on everything', s[0].id === 'nav-outfits-btn' && s[0].on && !s[1].on);
    check('and the name of the destination is that half',
      (await p.textContent('#nav-outfits-btn')).trim() === 'Outfits',
      (await p.textContent('#nav-outfits-btn')).trim());
    check('and says so to a screen reader',
      s[0].pressed === 'true' && s[1].pressed === 'false');
    // Neither half may be smaller than a thumb.
    check('both halves are a full target',
      s.every(x => x.w >= 44 && x.h >= 44), JSON.stringify(s.map(x=>`${x.w}x${x.h}`)));
    check('the destination reads as one control, lit',
      await p.evaluate(()=>{
        const dest = document.querySelector('#bottom-bar .bottom-btn.nav-switch');
        return Boolean(dest) && dest.classList.contains('active') &&
               dest.querySelectorAll('.nav-seg').length === 2;
      }));
    // The pair the cards use: hollow until it is the one you are on.
    check('the kept half is hollow while you are on everything',
      (await p.textContent('#nav-saved-btn')).trim() === '♡',
      (await p.textContent('#nav-saved-btn')).trim());
    await p.click('#nav-saved-btn'); await p.waitForTimeout(1100);
    check('and fills when it is',
      (await p.textContent('#nav-saved-btn')).trim() === '♥',
      (await p.textContent('#nav-saved-btn')).trim());
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);

    // It has to fit next to two other labels on a small phone, and it is
    // the same bar wherever you are — nothing grows or shrinks underneath
    // your thumb as you move between destinations.
    const width = () => p.evaluate(()=>
      Math.round(document.getElementById('bottom-bar').getBoundingClientRect().width));
    const room = await p.evaluate(()=>Math.round(window.innerWidth - 32));
    const onAll = await width();
    check('and the bar still fits the screen', onAll <= room, `${onAll} of ${room}`);
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(700);
    check('and is the same bar on every page', (await width()) === onAll,
      `${await width()} vs ${onAll}`);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    check('with nothing pushed off the side',
      !(await p.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth)));
    await p.close();
  }

  // ---- 2. Switching, and what each half shows ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    check('All is the generated stream',
      await p.evaluate(()=>appMode === 'outfits' && outfitDisplayed.length > 2));
    check('with its lead card', await p.isVisible('#outfit-hero .outfit-card'));

    await p.click('#nav-saved-btn'); await p.waitForTimeout(1200);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    check('the heart shows the ones you kept', (await cards(p)) === 3, String(await cards(p)));
    check('and the switch moved with you',
      (await segs(p))[1].on && !(await segs(p))[0].on);
    check('the page says which half you are on',
      (await p.textContent('#saved-view h1')).trim() === 'Faves');

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    check('and back again', await p.evaluate(()=>appMode === 'outfits'));
    await p.close();
  }

  // ---- 3. One panel, carried across ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await p.evaluate(()=>{
      outfitFilters['Jackets'] = {type:'none', ids:[]};
      renderFilterControls(); renderFiltersFab(); resetOutfitResults();
    });
    await p.waitForTimeout(800);
    check('a rule set while browsing', await p.evaluate(()=>
      outfitDisplayed.length > 0 && outfitDisplayed.every(c=>!c.jacket)));

    await p.click('#nav-saved-btn'); await p.waitForTimeout(1200);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    check('is still set on the kept ones', await p.evaluate(()=>
      outfitFilters['Jackets'].type === 'none'));
    check('and narrowing them', (await cards(p)) === 2, String(await cards(p)));
    check('the chip in the panel agrees',
      await p.evaluate(()=>Array.from(
        document.querySelectorAll('#sheet-without-chips .tag-chip.active'))
          .map(e=>e.dataset.without).join(',') === 'Jackets'));

    // And Clear all clears the one set, from either side.
    await p.evaluate(()=>openFilterSheet()); await p.waitForTimeout(600);
    await p.click('#filter-sheet-clear'); await p.waitForTimeout(900);
    check('clearing from here clears it for both',
      await p.evaluate(()=>Object.keys(outfitFilters).every(k=>outfitFilters[k].type==='any')));
    check('and every kept outfit is back', (await cards(p)) === 3, String(await cards(p)));
    await p.close();
  }

  // ---- 4. Hidden means hidden ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    // Hide one of the kept ones, from the generated side.
    const key = FAVS[0].combo_key;
    await p.evaluate(k=>hideCombo(k), key);
    await p.waitForTimeout(800);
    check('it is gone from the stream',
      await p.evaluate(k=>!outfitDisplayed.some(c=>comboKey(c)===k), key));

    await p.click('#nav-saved-btn'); await p.waitForTimeout(1200);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    check('and gone from the kept ones too', (await cards(p)) === 2, String(await cards(p)));
    check('though it is still kept, so undoing the hiding brings it back',
      await p.evaluate(k=>isFavorited(k), key));

    await p.evaluate(k=>unhideCombo(k), key);
    await p.waitForTimeout(900);
    await p.evaluate(()=>renderSavedOutfits()); await p.waitForTimeout(400);
    check('which it does', (await cards(p)) === 3, String(await cards(p)));
    await p.close();
  }

  // ---- 5. Building one is reachable from either half ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    check('All offers it', await p.isVisible('#build-outfit-btn-all'));
    await p.click('#build-outfit-btn-all'); await p.waitForTimeout(800);
    check('and it opens', await p.isVisible('#builder-tabs'));
    await p.evaluate(()=>discardOutfitBuilder()); await p.waitForTimeout(500);

    await toFaves(p, 1000);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    check('so does the kept half', await p.isVisible('#build-outfit-btn'));
    await p.close();
  }

  // ---- 6. Each half keeps its own place on the page ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.evaluate(()=>window.scrollTo(0, 900)); await p.waitForTimeout(500);
    const wasAt = await p.evaluate(()=>Math.round(window.scrollY));
    check('scrolled down the stream', wasAt > 500, String(wasAt));

    await p.click('#nav-saved-btn'); await p.waitForTimeout(1200);
    check('the kept ones start at their own top',
      (await p.evaluate(()=>Math.round(window.scrollY))) === 0);

    // Near where you were rather than exactly: the lead card is picked
    // afresh on every arrival, so it can be taller or shorter than the one
    // you left, and the browser shifts the scroll to keep what you were
    // looking at still. The thing that would be wrong is landing at the
    // top, which is what the switch used to do.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    const backAt = await p.evaluate(()=>Math.round(window.scrollY));
    check('and going back puts you about where you were',
      Math.abs(backAt - wasAt) <= 200 && backAt > 300, `${backAt} vs ${wasAt}`);
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
