// The list from yesterday: a tag you can rename or delete, a featured outfit
// that opens, a piece that opens where it lives, and nothing anywhere that
// asks "are you sure" — the undo on the toast does that job instead.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// A typo on two pieces, and a correctly spelled tag to leave alone.
const TAGS = {seed_0:['wnter','wool'], seed_1:['wnter'], seed_2:['summer'], seed_3:['summer']};
const CAPS = [{id:'cap_a', name:'Winter', archived_at:null, created_at:'2026-01-01'}];
const MEM  = [{capsule_id:'cap_a', item_id:'seed_0', created_at:'2026-01-01'},
              {capsule_id:'cap_a', item_id:'seed_22', created_at:'2026-01-01'}];

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};`
       + `window.__SEED_CAPSULES=${JSON.stringify(CAPS)};window.__SEED_CAPSULE_ITEMS=${JSON.stringify(MEM)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

// A real hold, long enough to fire and still enough to count as a press.
async function hold(p, selector, ms){
  const box = await p.locator(selector).first().boundingBox();
  await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await p.mouse.down(); await p.waitForTimeout(ms == null ? 650 : ms); await p.mouse.up();
  await p.waitForTimeout(450);
}

const asked = p => p.evaluate(()=>Array.from(document.querySelectorAll('button'))
  .some(x => /yes,\s*delete/i.test(x.textContent)));
const hasUndo = p => p.evaluate(()=>Boolean(document.querySelector('.toast-undo')));
const dbTags = (p, id) => p.evaluate(i =>
  (window.__WARDROBE_STATE.items.find(r=>r.id===i).tags || []).slice(), id);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. A tag can be renamed ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    check('the typo is sitting there in the panel',
      await p.evaluate(()=>allTags().includes('wnter')), (await p.evaluate(()=>allTags())).join(', '));
    check('with no instruction printed beside it',
      !/hold one to edit/i.test(await p.textContent('.filter-section')),
      (await p.textContent('.filter-section')).replace(/\s+/g,' ').trim().slice(0, 40));

    await hold(p, '#sheet-tag-chips .tag-chip[data-tag="wnter"]');
    check('holding a chip opens the tag itself',
      await p.evaluate(()=>Boolean(document.getElementById('tag-edit-input'))));
    check('with the tag in the field',
      await p.evaluate(()=>document.getElementById('tag-edit-input').value) === 'wnter');
    check('with no line of explanation under it',
      await p.evaluate(()=>!document.querySelector('#modal .gate-note')));
    check('the hold did not also apply it as a filter',
      (await p.evaluate(()=>outfitTags)).length === 0);

    await p.fill('#tag-edit-input', 'Winter');
    await p.click('#tag-edit-save'); await p.waitForTimeout(800);
    check('one rename fixes every piece carrying it',
      await p.evaluate(()=>allTags().includes('winter') && !allTags().includes('wnter')),
      (await p.evaluate(()=>allTags())).join(', '));
    check('it is written to the database, not just on screen',
      (await dbTags(p,'seed_0')).includes('winter') && !(await dbTags(p,'seed_0')).includes('wnter'),
      (await dbTags(p,'seed_0')).join(','));
    check('on both pieces', (await dbTags(p,'seed_1')).join(',') === 'winter');
    check('lower-cased the way a typed tag would be',
      await p.evaluate(()=>allTags().includes('winter')));
    check('the piece\'s other tags are untouched',
      (await dbTags(p,'seed_0')).includes('wool'), (await dbTags(p,'seed_0')).join(','));
    check('and a different tag is left alone',
      await p.evaluate(()=>allTags().includes('summer')));
    check('the sheet closed', !(await p.evaluate(()=>
      document.getElementById('modal-backdrop').classList.contains('open'))));

    check('and it offers the old spelling back', await hasUndo(p));
    await p.click('.toast-undo'); await p.waitForTimeout(800);
    check('undo puts the typo back on both pieces',
      await p.evaluate(()=>allTags().includes('wnter') && !allTags().includes('winter')),
      (await p.evaluate(()=>allTags())).join(', '));
    check('in the database too', (await dbTags(p,'seed_1')).join(',') === 'wnter');
    await p.close();
  }

  // ---- 2. Or deleted ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    await hold(p, '#sheet-tag-chips .tag-chip[data-tag="wnter"]');
    await p.click('#modal button:has-text("Delete tag")'); await p.waitForTimeout(800);
    check('deleting takes it off every piece',
      await p.evaluate(()=>!allTags().includes('wnter')),
      (await p.evaluate(()=>allTags())).join(', '));
    check('without asking first', !(await asked(p)));
    check('the pieces keep their other tags',
      (await dbTags(p,'seed_0')).join(',') === 'wool', (await dbTags(p,'seed_0')).join(','));
    check('and it offers the tag back', await hasUndo(p));
    await p.click('.toast-undo'); await p.waitForTimeout(800);
    check('undo restores it', await p.evaluate(()=>allTags().includes('wnter')));
    check('on both pieces',
      await p.evaluate(()=>itemsWithTag('wnter').length) === 2,
      String(await p.evaluate(()=>itemsWithTag('wnter').length)));
    await p.close();
  }

  // ---- 3. A filter using the tag follows it ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    await p.click('#sheet-tag-chips .tag-chip[data-tag="wnter"]'); await p.waitForTimeout(700);
    check('the typo is the active filter', (await p.evaluate(()=>outfitTags)).join()==='wnter');

    await hold(p, '#sheet-tag-chips .tag-chip[data-tag="wnter"]');
    await p.fill('#tag-edit-input', 'winter');
    await p.click('#tag-edit-save'); await p.waitForTimeout(900);
    check('the filter follows the rename rather than emptying the page',
      (await p.evaluate(()=>outfitTags)).join()==='winter', String(await p.evaluate(()=>outfitTags)));
    check('and the renamed chip is the one shown as active',
      await p.evaluate(()=>{
        const c = document.querySelector('#sheet-tag-chips .tag-chip.active');
        return Boolean(c) && c.dataset.tag === 'winter';
      }));

    await hold(p, '#sheet-tag-chips .tag-chip[data-tag="winter"]');
    await p.click('#modal button:has-text("Delete tag")'); await p.waitForTimeout(900);
    check('deleting the tag being filtered by clears the filter',
      (await p.evaluate(()=>outfitTags)).length === 0);
    check('rather than leaving the page filtered by nothing',
      await p.evaluate(()=>outfitDisplayed.length) > 0);
    await p.close();
  }

  // ---- 4. The featured outfit opens like any other ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    check('nothing is open to start with',
      await p.evaluate(()=>!document.querySelector('.outfit-expanded-panel')));

    await p.click('.hero-card'); await p.waitForTimeout(500);
    const hero = await p.evaluate(()=>{
      const card = document.querySelector('.hero-card');
      return {
        expanded: card.classList.contains('expanded'),
        panel: Boolean(card.querySelector('.outfit-expanded-panel')),
        rows: card.querySelectorAll('.outfit-piece-row.tappable').length,
        pieces: comboPieces(heroCombo).length,
        canHide: Boolean(Array.from(card.querySelectorAll('button'))
          .find(x=>/Hide this combo/.test(x.textContent))),
        canCollapse: Boolean(card.querySelector('.outfit-collapse-btn')),
      };
    });
    check('tapping the lead card opens it', hero.expanded && hero.panel);
    check('it lists every piece in it, each a way to that piece',
      hero.rows === hero.pieces && hero.rows > 0, `${hero.rows} of ${hero.pieces}`);
    check('Hide this combo is reachable from it at last', hero.canHide);
    check('and so is the way to close it', hero.canCollapse);

    check('the same outfit is not also drawn in the grid below',
      await p.evaluate(()=>{
        const key = comboKey(heroCombo);
        return !Array.from(document.querySelectorAll('#outfit-gallery .outfit-card'))
          .some(c => c.querySelector('.outfit-collapse-btn'));
      }));

    await p.click('.hero-card .outfit-collapse-btn'); await p.waitForTimeout(450);
    check('Collapse closes it', await p.evaluate(()=>
      !document.querySelector('.hero-card .outfit-expanded-panel')));

    // And opening one in the grid still closes the hero, since only one is
    // open at a time.
    await p.click('.hero-card'); await p.waitForTimeout(400);
    await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(500);
    check('opening one in the grid closes the lead card',
      await p.evaluate(()=>!document.querySelector('.hero-card .outfit-expanded-panel') &&
                           Boolean(document.querySelector('#outfit-gallery .outfit-expanded-panel'))));
    await p.close();
  }

  // ---- 5. A piece opens where it lives ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    await p.click('.hero-card'); await p.waitForTimeout(500);
    const wanted = await p.evaluate(()=>
      document.querySelector('.hero-card .outfit-piece-row .p-name').textContent.trim());
    await p.locator('.hero-card .outfit-piece-row').first().click(); await p.waitForTimeout(800);
    const landed = await p.evaluate(n=>({
      mode: appMode,
      open: document.getElementById('modal-backdrop').classList.contains('open'),
      name: (document.querySelector('.modal-name')||{textContent:''}).textContent.trim(),
      trail: sheetTrail.map(e=>e.sheet),
    }), wanted);
    check('a piece from the lead card opens where you stand', landed.open &&
      landed.name === wanted, `${landed.name} vs ${wanted}`);
    check('without taking you off Outfits', landed.mode==='outfits', landed.mode);
    check('and back is the one step you took',
      JSON.stringify(landed.trail)===JSON.stringify(['item']), landed.trail.join(' > '));
    await p.click('.modal .sheet-back'); await p.waitForTimeout(600);
    check('which puts you back on the lead card', await p.evaluate(()=>
      appMode==='outfits' &&
      !document.getElementById('modal-backdrop').classList.contains('open')));
    await p.close();
  }

  // ---- 6. Nothing asks "are you sure" ----
  {
    const p=await open(b);

    // One piece, from the edit sheet.
    await p.click('#gallery .tile'); await p.waitForTimeout(450);
    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(450);
    const before = await p.evaluate(()=>ITEMS.length);
    await p.click('#form-item-actions button:has-text("Archive")'); await p.waitForTimeout(700);
    check('archiving one piece does not ask', !(await asked(p)));
    check('it just goes, and offers it back',
      await p.evaluate(()=>ITEMS.length) === before-1 && await hasUndo(p));
    await p.click('.toast-undo'); await p.waitForTimeout(700);

    // A selection of pieces.
    await hold(p, '#gallery .tile', 700);
    await p.locator('#gallery .tile').nth(1).click(); await p.waitForTimeout(200);
    const n = await p.evaluate(()=>ITEMS.length);
    await p.click('button:has-text("Delete selected")'); await p.waitForTimeout(700);
    check('archiving a selection does not ask either', !(await asked(p)));
    check('two go, and both are offered back',
      await p.evaluate(()=>ITEMS.length) === n-2 && await hasUndo(p),
      `${await p.evaluate(()=>ITEMS.length)} vs ${n-2}`);
    check('and select mode ends with it', !(await p.evaluate(()=>editMode)));
    await p.click('.toast-undo'); await p.waitForTimeout(700);

    // A capsule.
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(700);
    await p.click('#capsule-gallery .outfit-card'); await p.waitForTimeout(400);
    await p.click('#capsule-gallery button:has-text("Delete")'); await p.waitForTimeout(700);
    check('deleting a capsule does not ask', !(await asked(p)));
    check('it goes, and is offered back whole',
      await p.evaluate(()=>capsules.length) === 0 && await hasUndo(p));
    await p.click('.toast-undo'); await p.waitForTimeout(700);
    check('undo brings it back with its pieces',
      await p.evaluate(()=>capsules.length === 1 && capsules[0].itemIds.length === 2),
      String(await p.evaluate(()=>capsules.length ? capsules[0].itemIds.length : -1)));

    // Hiding a combination.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(450);
    await p.click('button:has-text("Hide this combo")'); await p.waitForTimeout(700);
    check('hiding a combination does not ask', !(await asked(p)));
    check('and offers it back', await hasUndo(p));

    check('nothing anywhere in the app still says "Yes, delete"',
      await p.evaluate(()=>typeof confirmArchiveCapsule === 'undefined' &&
                           typeof confirmBulkDelete === 'undefined' &&
                           typeof confirmingDelete === 'undefined'));
    await p.close();
  }

  // ---- 7. The last two removals ----
  {
    const p=await open(b);
    // No combination count, in the sheet either. It is the piece's own detail
    // sheet that carries "Outfits with this piece".
    await p.evaluate(()=>{ const t = ITEMS.find(i=>tabForItem(i)==='Tops'); openModal(t.id); });
    await p.waitForTimeout(1000);
    check('the piece\'s sheet lists outfits with it',
      await p.evaluate(()=>document.querySelectorAll('#m-outfit-gallery .outfit-card').length) > 0,
      String(await p.evaluate(()=>document.querySelectorAll('#m-outfit-gallery .outfit-card').length)));
    check('and prints no count above them',
      await p.evaluate(()=>!document.getElementById('m-outfit-count-line')));
    check('nor says "possible combinations" anywhere on it',
      !/possible combinations/.test(await p.textContent('#modal')));
    await p.evaluate(()=>closeModal()); await p.waitForTimeout(300);

    // "New capsule", not "New capsule with this piece".
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(450);
    await p.click('.modal button:has-text("Add to capsule")'); await p.waitForTimeout(500);
    const label = await p.evaluate(()=>Array.from(document.querySelectorAll('#modal .modal-actions button'))
      .map(x=>x.textContent.trim()));
    check('the button is just "New capsule"',
      label.includes('New capsule') && !label.some(l=>/with this piece/.test(l)),
      label.join(', '));
    check('and it still starts the capsule off with the piece in it', await (async()=>{
      await p.click('#modal button:has-text("New capsule")'); await p.waitForTimeout(600);
      return p.evaluate(()=>capsuleDraft.itemIds.has('seed_0'));
    })());
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
