// Opening a piece from Faves, Outfits or a capsule should not throw you onto
// the Wardrobe. The sheet opens over the tab you are reading, back brings
// you back to it, and anything the sheet leads to unwinds one step at a
// time. And the "outfits with this piece" list inside a sheet stops
// borrowing the Outfits page's filters, which it used to wipe.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const TAGS={seed_0:['winter'], seed_22:['summer']};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;`+
         `window.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const sheetUp = p => p.evaluate(()=>
  document.getElementById('modal-backdrop').classList.contains('open'));
const formUp = p => p.evaluate(()=>
  document.getElementById('form-backdrop').classList.contains('open'));
const trail = p => p.evaluate(()=>sheetTrail.map(e=>e.sheet));
// Whichever sheet is actually up: the other backdrop still holds a back
// button, hidden behind it.
const back = async p => {
  const sel = (await formUp(p)) ? '#form-backdrop .sheet-back' : '.modal .sheet-back';
  await p.click(sel);
  await p.waitForTimeout(600);
};

// Keep one outfit so Faves has something on it.
async function keepOne(p){
  await p.click('#nav-outfits-btn');
  await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
  await p.waitForTimeout(900);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
  await p.click('.outfit-gallery .outfit-fav-btn');
  await p.waitForFunction(()=>favoriteOutfits.length === 1);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. A piece opened from Faves stays on Faves ----
  {
    const p=await open(b);
    await keepOne(p);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    const wasTab = await p.evaluate(()=>activeTab);
    await p.click('#saved-gallery .outfit-card'); await p.waitForTimeout(500);
    // Expanding the card lengthens the page, so where you are standing is
    // read after that, immediately before stepping into the sheet.
    await p.evaluate(()=>window.scrollTo({top:120})); await p.waitForTimeout(400);
    const wasAt = await p.evaluate(()=>Math.round(window.scrollY));
    await p.locator('#saved-gallery .outfit-piece-row').first().click();
    await p.waitForTimeout(700);

    check('the piece opened', await sheetUp(p));
    check('and you are still on Faves, not the Wardrobe',
      await p.evaluate(()=>appMode === 'saved'), await p.evaluate(()=>appMode));
    check('the wardrobe was not moved to the piece\'s category either',
      (await p.evaluate(()=>activeTab)) === wasTab, await p.evaluate(()=>activeTab));
    check('one step on the trail', JSON.stringify(await trail(p))===JSON.stringify(['item']),
      (await trail(p)).join(' > '));

    await back(p);
    check('back puts the sheet away', !(await sheetUp(p)));
    check('and leaves you on Faves', await p.evaluate(()=>appMode === 'saved'));
    check('at the same place on it',
      Math.abs((await p.evaluate(()=>Math.round(window.scrollY))) - wasAt) <= 3,
      `${wasAt} -> ${await p.evaluate(()=>Math.round(window.scrollY))}`);
    check('with the card still open',
      await p.evaluate(()=>Boolean(expandedSavedKey)));
    await p.close();
  }

  // ---- 2. Deeper steps unwind one at a time ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(800);
    // A piece from the wardrobe, opened over the Capsules page.
    const id = await p.evaluate(()=>ITEMS.find(i=>tabForItem(i)==='Tops').id);
    await p.evaluate(i=>openPieceSheet(i), id); await p.waitForTimeout(700);
    check('a piece can be opened over Capsules too',
      await sheetUp(p) && await p.evaluate(()=>appMode==='capsules'));

    await p.click('.modal .modal-actions .btn:has-text("Edit")'); await p.waitForTimeout(700);
    check('Edit goes a step deeper', await formUp(p) && !(await sheetUp(p)));
    check('and the trail says how you got there',
      JSON.stringify(await trail(p))===JSON.stringify(['item','form']),
      (await trail(p)).join(' > '));

    await back(p);
    check('backing out of the form returns to the piece, not to a page',
      await sheetUp(p) && !(await formUp(p)));
    check('one step left on the trail',
      JSON.stringify(await trail(p))===JSON.stringify(['item']));

    await p.click('.modal .modal-actions .btn:has-text("Add to capsule")');
    await p.waitForTimeout(700);
    check('Add to capsule is another step',
      JSON.stringify(await trail(p))===JSON.stringify(['item','capsules']),
      (await trail(p)).join(' > '));
    await p.click('.modal .modal-actions .btn:has-text("New capsule")');
    await p.waitForTimeout(700);
    check('and a new capsule from there is a third',
      JSON.stringify(await trail(p))===JSON.stringify(['item','capsules','capsule']),
      (await trail(p)).join(' > '));

    await back(p);
    check('back from the capsule lands on the capsule picker',
      Boolean(await p.evaluate(()=>document.getElementById('capsule-picks'))));
    await back(p);
    check('back again lands on the piece',
      Boolean(await p.evaluate(()=>document.querySelector('.modal .modal-photo'))));
    await back(p);
    check('and once more is out, onto the page you started from',
      !(await sheetUp(p)) && await p.evaluate(()=>appMode==='capsules'));
    check('with nothing left on the trail', (await trail(p)).length === 0);
    await p.close();
  }

  // ---- 3. A piece listed under another piece's outfits ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(500);
    await p.locator('#outfit-gallery .outfit-piece-row').first().click();
    await p.waitForTimeout(900);
    const first = await p.evaluate(()=>sheetTrail[0].id);

    // Now tap a different piece from this sheet's own outfit list.
    const rows = await p.locator('#m-outfit-gallery .outfit-card').count();
    check('the sheet lists outfits with this piece', rows > 0, String(rows));
    // Which card in that list is expanded is whatever the page behind it
    // had open, which may not be in this list at all — so open one here
    // deliberately rather than hoping.
    await p.evaluate(()=>{
      const shut = document.querySelector('#m-outfit-gallery .outfit-card:not(.expanded)');
      if(shut) shut.click();
    });
    await p.waitForTimeout(600);
    const other = await p.evaluate(id => {
      const rows = Array.from(document.querySelectorAll(
        '#m-outfit-gallery .outfit-card.expanded .outfit-piece-row'));
      const row = rows.find(r => !(r.getAttribute('onclick')||'').includes(id));
      if(row) row.click();
      return Boolean(row);
    }, first);
    await p.waitForTimeout(800);
    if(other){
      check('tapping another piece from it goes deeper, not sideways',
        JSON.stringify(await trail(p))===JSON.stringify(['item','item']),
        (await trail(p)).join(' > '));
      await back(p);
      check('and back returns to the piece you came from',
        (await p.evaluate(()=>sheetTrail[sheetTrail.length-1].id)) === first &&
        await sheetUp(p));
    } else {
      check('tapping another piece from it goes deeper, not sideways', false,
        'no second piece to tap');
    }

    // Tapping the piece you are already on takes you back up to it.
    await p.evaluate(()=>{ document.getElementById('modal-backdrop').scrollTop = 500; });
    await p.waitForTimeout(300);
    await p.evaluate(id=>openPieceSheet(id), await p.evaluate(()=>sheetTrail[sheetTrail.length-1].id));
    await p.waitForTimeout(700);
    check('tapping the piece you are already on scrolls up, it does not stack',
      (await trail(p)).length === 1 &&
      (await p.evaluate(()=>document.getElementById('modal-backdrop').scrollTop)) < 100,
      `${(await trail(p)).length} deep, at ${await p.evaluate(()=>document.getElementById('modal-backdrop').scrollTop)}`);
    await p.close();
  }

  // ---- 4. The sheet stops eating the Outfits page's filters ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    await p.evaluate(()=>{ outfitFilters['Jackets'] = {type:'none', ids:[]};
                           renderFilterControls(); renderFiltersFab(); resetOutfitResults(); });
    await p.waitForTimeout(800);
    const set = await p.evaluate(()=>JSON.stringify(outfitFilters));
    check('the page is narrowed', await p.evaluate(()=>outfitFilters['Jackets'].type==='none'));

    // Open any piece from the wardrobe, which draws "outfits with this piece".
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(700);
    await p.click('#gallery .tile'); await p.waitForTimeout(900);
    check('the sheet drew its own outfit list',
      await p.evaluate(()=>Object.values(modalFilters).some(f=>f.type==='items')));
    check('and it is not the page\'s set of filters',
      (await p.evaluate(()=>JSON.stringify(outfitFilters))) === set,
      await p.evaluate(()=>JSON.stringify(outfitFilters)));

    await back(p);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    check('so the Outfits page still has what you left it with',
      await p.evaluate(()=>outfitFilters['Jackets'].type==='none' &&
        OUTFIT_TABS.filter(t=>outfitFilters[t].type==='items').length === 0),
      await p.evaluate(()=>JSON.stringify(outfitFilters)));
    check('and the pill still counts one, not a filter you never set',
      (await p.textContent('#filters-fab')).includes('1'),
      await p.textContent('#filters-fab'));
    await p.close();
  }

  // ---- 5. A tag on the page does not narrow a sheet's list either ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    await p.evaluate(()=>setOutfitTag('winter')); await p.waitForTimeout(900);
    check('the page is tagged', await p.evaluate(()=>outfitTags.join() === 'winter'));

    await p.click('#nav-inventory-btn'); await p.waitForTimeout(700);
    // A piece with no tag at all: under the old rule its own outfit list
    // would have been narrowed to outfits carrying someone else's tag.
    const plainId = await p.evaluate(()=>{
      const i = ITEMS.find(x => tabForItem(x)==='Tops' && !(x.tags||[]).length);
      return i ? i.id : null;
    });
    await p.evaluate(id=>openPieceSheet(id), plainId); await p.waitForTimeout(1000);
    check('an untagged piece still lists the outfits it is in',
      (await p.locator('#m-outfit-gallery .outfit-card').count()) > 0,
      String(await p.locator('#m-outfit-gallery .outfit-card').count()));
    check('and the page keeps its tag',
      await p.evaluate(()=>outfitTags.join() === 'winter'));
    await p.close();
  }

  // ---- 6. Nothing broke on the way in from the wardrobe itself ----
  {
    const p=await open(b);
    await p.evaluate(()=>window.scrollTo({top:900})); await p.waitForTimeout(500);
    const wasAt = await p.evaluate(()=>Math.round(window.scrollY));
    // Tapped through the page rather than by Playwright, which would scroll
    // the tile into view first and move the very thing being measured.
    await p.evaluate(()=>{
      const tile = Array.from(document.querySelectorAll('#gallery .tile'))
        .find(t => { const r = t.getBoundingClientRect();
                     return r.top > 100 && r.bottom < innerHeight; });
      tile.click();
    });
    await p.waitForTimeout(700);
    check('a tile still opens its piece', await sheetUp(p));
    await back(p);
    check('and back leaves you where you were in the grid',
      !(await sheetUp(p)) &&
      Math.abs((await p.evaluate(()=>Math.round(window.scrollY))) - wasAt) <= 3,
      `${wasAt} -> ${await p.evaluate(()=>Math.round(window.scrollY))}`);

    // "Find outfits with this" still takes you to the Outfits page on purpose.
    await p.click('#gallery .tile'); await p.waitForTimeout(700);
    const pieceId = await p.evaluate(()=>sheetTrail[0].id);
    await p.evaluate(id=>findOutfitsWithPiece(id), pieceId); await p.waitForTimeout(1200);
    check('asking for outfits with a piece does still take you there',
      await p.evaluate(()=>appMode==='outfits'), await p.evaluate(()=>appMode));
    check('with the page pinned to that piece, as you asked',
      await p.evaluate(id=>OUTFIT_TABS.some(t=>outfitFilters[t].type==='items' &&
        outfitFilters[t].ids[0]===id), pieceId));
    check('and no trail left pointing back into a sheet',
      (await trail(p)).length === 0 && !(await sheetUp(p)));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
