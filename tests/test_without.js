// Asking for an outfit that does not have something. It used to be a None
// button sitting beside Any in the piece picker — the one filter that
// narrowed by subtraction, wearing the same button as the ones that narrow
// by adding. It is its own row now, and its own kind of control: a toggle,
// like a tag, with no caret, because it opens nothing.
//
// Both rows write the same slot, so the two can never disagree: ruling a
// category out drops whatever was pinned in it, and pinning something drops
// the rule.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// Three kept outfits: one with a jacket, one bare, one dress.
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
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;`+
         `window.__SEED_OUTFITS=${JSON.stringify(FAVS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const tap = async (p, tab) => {
  await p.click(`#sheet-without-chips .tag-chip[data-without="${tab}"]`);
  await p.waitForTimeout(1000);
};
const on = p => p.evaluate(()=>Array.from(
  document.querySelectorAll('#sheet-without-chips .tag-chip.active'))
    .map(e=>e.dataset.without).sort());
const label = (p, id) => p.evaluate(i =>
  document.getElementById(i).closest('.filter-sheet-label').textContent.trim(), id);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. It is a toggle, and it looks like one ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);

    const look = await p.evaluate(()=>{
      const chip = document.querySelector('#sheet-without-chips .tag-chip');
      const piece = document.querySelector('#sheet-filter-grid .filter-chip');
      return {
        label: chip.textContent.trim(),
        caret: Boolean(chip.querySelector('.chip-caret')),
        pieceCaret: Boolean(piece.querySelector('.chip-caret')),
        pressed: chip.getAttribute('aria-pressed'),
        opens: chip.getAttribute('aria-haspopup'),
        tall: Math.round(chip.getBoundingClientRect().height),
      };
    });
    check('it names a garment, not a shelf', look.label === 'No top', look.label);
    check('no caret, because it opens nothing', !look.caret && look.pieceCaret);
    check('and it reports itself as a switch', look.pressed === 'false' && !look.opens,
      `pressed=${look.pressed} haspopup=${look.opens}`);
    check('a full thumb like every other chip', look.tall >= 44, `${look.tall}px`);

    check('only the categories worth ruling out get a chip',
      JSON.stringify(await p.evaluate(()=>Array.from(
        document.querySelectorAll('#sheet-without-chips .tag-chip'))
          .map(e=>e.dataset.without))) === JSON.stringify(['Tops','Dresses','Jumpers','Jackets']),
      (await p.evaluate(()=>Array.from(document.querySelectorAll('#sheet-without-chips .tag-chip'))
        .map(e=>e.dataset.without))).join(', '));
    check('and the picker still offers no None of its own',
      await (async()=>{
        await p.evaluate(()=>openSlotPicker('Jackets')); await p.waitForTimeout(500);
        const quick = await p.evaluate(()=>Array.from(
          document.querySelectorAll('#picker-quick-picks .base-btn')).map(e=>e.textContent.trim()));
        await p.evaluate(()=>closeModal()); await p.waitForTimeout(500);
        return JSON.stringify(quick) === JSON.stringify(['Any']);
      })());
    await p.close();
  }

  // ---- 2. It does what it says on Outfits ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
    const before = await p.evaluate(()=>totalComboCount());

    await tap(p, 'Jackets');
    check('No jacket leaves only the outfits without one',
      await p.evaluate(()=>outfitDisplayed.length > 0 && outfitDisplayed.every(c=>!c.jacket)));
    check('which is fewer than there were',
      (await p.evaluate(()=>totalComboCount())) < before,
      `${before} -> ${await p.evaluate(()=>totalComboCount())}`);
    check('and the count agrees with the stream',
      await p.evaluate(()=>{
        let n=0; for(const c of comboGenerator()){ if(comboMatchesTag(c)) n++; if(n>200000) break; }
        return n === totalComboCount();
      }));

    await tap(p, 'Dresses');
    check('No dress leaves the other shape', await p.evaluate(()=>
      outfitDisplayed.length > 0 && outfitDisplayed.every(c=>c.base==='topbottom')));
    check('both chips are on at once',
      JSON.stringify(await on(p)) === JSON.stringify(['Dresses','Jackets']),
      (await on(p)).join(', '));
    check('and the heading counts them', (await label(p,'sheet-without-count')) === 'Without (2)',
      await label(p,'sheet-without-count'));

    await tap(p, 'Jackets');
    check('tapping one again takes only that one off',
      JSON.stringify(await on(p)) === JSON.stringify(['Dresses']), (await on(p)).join(', '));
    await tap(p, 'Dresses');
    check('and the page is back to everything',
      (await p.evaluate(()=>totalComboCount())) === before &&
      (await on(p)).length === 0);
    await p.close();
  }

  // ---- 3. The two rows cannot contradict each other ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);

    // Pin a jacket, then rule jackets out: the pin goes.
    await p.evaluate(()=>{
      outfitFilters['Jackets'] = {type:'items', ids: itemsInTab('Jackets').slice(0,2).map(i=>i.id)};
      renderFilterControls(); resetOutfitResults();
    });
    await p.waitForTimeout(800);
    check('a pinned category counts under Pieces',
      (await label(p,'sheet-piece-count')) === 'Pieces (1)', await label(p,'sheet-piece-count'));
    check('and not under Without',
      (await label(p,'sheet-without-count')) === 'Without', await label(p,'sheet-without-count'));

    await tap(p, 'Jackets');
    check('ruling it out drops the pin rather than fighting it',
      await p.evaluate(()=>outfitFilters['Jackets'].type === 'none'));
    check('so the counts swap over',
      (await label(p,'sheet-piece-count')) === 'Pieces' &&
      (await label(p,'sheet-without-count')) === 'Without (1)',
      `${await label(p,'sheet-piece-count')} / ${await label(p,'sheet-without-count')}`);
    check('and the Pieces chip does not claim it',
      await p.evaluate(()=>{
        const chip = Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
          .find(e=>e.childNodes[0].textContent.trim()==='Jackets');
        return !chip.classList.contains('active') && !chip.querySelector('.chip-count');
      }));

    // And back the other way: pinning one drops the rule.
    await p.evaluate(()=>openSlotPicker('Jackets')); await p.waitForTimeout(500);
    await p.click('#picker-gallery .picker-tile'); await p.waitForTimeout(300);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(900);
    check('pinning a jacket drops the rule',
      await p.evaluate(()=>outfitFilters['Jackets'].type === 'items'));
    check('and the Without chip is off again',
      (await on(p)).length === 0, (await on(p)).join(', '));

    check('Clear all takes both kinds away', await (async()=>{
      await tap(p, 'Dresses');
      await p.click('#filter-sheet-clear'); await p.waitForTimeout(900);
      return (await on(p)).length === 0 &&
        await p.evaluate(()=>Object.keys(outfitFilters).every(k=>outfitFilters[k].type==='any'));
    })());
    await p.close();
  }

  // ---- 4. Faves asks the same question of outfits already kept ----
  {
    const p=await open(b);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(1200);
    const cards = () => p.evaluate(()=>
      document.querySelectorAll('#saved-gallery .outfit-card').length);
    check('three kept to start with', (await cards()) === 3, String(await cards()));

    await tap(p, 'Jackets');
    check('No jacket drops the one wearing one', (await cards()) === 2, String(await cards()));
    check('and the ones left really have none',
      await p.evaluate(()=>favoriteOutfits.filter(savedOutfitMatches).every(r=>!r.jacket)));

    await tap(p, 'Dresses');
    check('No dress drops the dress one too', (await cards()) === 1, String(await cards()));
    check('leaving the bare top-and-bottom one',
      await p.evaluate(()=>{
        const left = favoriteOutfits.filter(savedOutfitMatches);
        return left.length===1 && left[0].base==='topbottom' && !left[0].jacket;
      }));

    // Faves and Outfits keep their own, as with every other filter.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    check('the Outfits row is not wearing the Faves rules',
      (await on(p)).length === 0, (await on(p)).join(', '));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
