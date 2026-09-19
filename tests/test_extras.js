// Putting accessories on a saved outfit. Outfits generate from clothes
// alone, so shoes, hats and the rest go on afterwards, on one you have
// already decided to keep — and an outfit can carry as many as it needs,
// where it used to hold exactly one pair of shoes.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
// A saved outfit with nothing on it, exactly what the generator produces.
const SAVED=[{combo_key:'tb|seed_22|seed_11|none|none|none', base:'topbottom',
  top_id:'seed_22', bottom_id:'seed_11', dress_id:null, jumper_id:null, jacket_id:null,
  shoe_id:null, extra_ids:[], archived_at:null, created_at:new Date().toISOString()}];
const KEY='tb|seed_22|seed_11|none|none|none';
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
const row=p=>p.evaluate(k=>window.__WARDROBE_STATE.saved_outfits.find(r=>r.combo_key===k), KEY);
const onCard=p=>p.evaluate(()=>document.querySelectorAll('#saved-gallery .outfit-extras > *').length);
// The card stays expanded after a change, so only click when it is collapsed.
async function ensureExpanded(p){
  const open = await p.evaluate(()=>Boolean(document.querySelector('#saved-gallery .outfit-card.expanded')));
  if(!open){ await p.click('#saved-gallery .outfit-card'); await p.waitForTimeout(400); }
}
async function openPicker(p){
  await ensureExpanded(p);
  await p.click('#saved-gallery .modal-actions button'); await p.waitForTimeout(450);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__SEED_OUTFITS=${JSON.stringify(SAVED)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);
  await p.click('#nav-saved-btn'); await p.waitForTimeout(600);

  check('a saved outfit starts with nothing on it', (await onCard(p))===0);

  // ---- 1. What the button says, and what it opens ----
  await p.click('#saved-gallery .outfit-card'); await p.waitForTimeout(450);
  check('the expanded panel offers to add accessories',
    await p.isVisible('#saved-gallery button:has-text("+ Add accessories")'));
  check('and there is only the one button, not one per kind of thing',
    await p.evaluate(()=>document.querySelectorAll('#saved-gallery .modal-actions button').length)===1);
  await p.screenshot({path:shot('e-1-add.png')});

  await openPicker(p);
  const tabs = await p.evaluate(()=>Array.from(document.querySelectorAll('#extras-tabs .tab')).map(e=>e.textContent.trim()));
  check('the picker is every category an outfit is NOT built from',
    tabs.length > 0 && tabs.every(t => !['Tops','Pants','Shorts','Skirts','Dresses','Jumpsuits','Jumpers','Jackets'].includes(t)),
    tabs.join(', '));
  check('shoes among them', tabs.includes('Shoes'), tabs.join(', '));
  check('and hats', tabs.includes('Hats'));
  check('it opens on the first of them',
    await p.evaluate(()=>document.querySelector('#extras-tabs .tab').classList.contains('active')));
  check('showing that category and nothing else',
    await p.evaluate(()=>document.querySelectorAll('#extras-gallery .picker-tile').length ===
      ITEMS.filter(i=>shelfForItem(i)==='Shoes').length));
  // A piece with no photo yet is still a thing you own, so it is offered.
  check('a piece without a photo is still reachable here',
    await p.evaluate(()=>ITEMS.some(i=>shelfForItem(i)==='Accessories' && !i.photo) &&
      itemsOnShelf('Accessories').some(i=>!i.photo)));
  await p.screenshot({path:shot('e-2-picker.png')});

  // ---- 2. One tap is the change ----
  const firstShoe = await p.evaluate(()=>itemsOnShelf('Shoes')[0].id);
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(600);
  let r = await row(p);
  check('a tap writes it straight to the list', JSON.stringify(r.extra_ids)===JSON.stringify([firstShoe]),
    JSON.stringify(r.extra_ids));
  check('nothing was asked first', await p.evaluate(()=>
    !document.getElementById('confirm-backdrop').classList.contains('open')));
  // No toast: the tile ticks under your thumb, and the same tap takes it
  // off. Saying so as well was the app describing what you just watched.
  check('and nothing is announced, because you can see it',
    await p.evaluate(()=>!document.querySelector('.toast.show')));
  check('it is ticked in the picker',
    await p.evaluate(()=>document.querySelectorAll('#extras-gallery .picker-selected').length)===1);
  check('combo_key is left alone, so the heart stays filled in Outfits',
    r.combo_key===KEY);

  // ---- 3. Several at once, which is the point ----
  await p.click('#extras-tabs .tab:has-text("Hats")'); await p.waitForTimeout(400);
  const firstHat = await p.evaluate(()=>itemsOnShelf('Hats')[0].id);
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(600);
  r = await row(p);
  check('a hat goes on alongside the shoes, it does not replace them',
    r.extra_ids.length===2 && r.extra_ids.includes(firstShoe) && r.extra_ids.includes(firstHat),
    JSON.stringify(r.extra_ids));
  check('switching category kept the shoes ticked on their own tab',
    await (async()=>{
      await p.click('#extras-tabs .tab:has-text("Shoes")'); await p.waitForTimeout(400);
      return (await p.evaluate(()=>document.querySelectorAll('#extras-gallery .picker-selected').length))===1;
    })());

  await p.click('.modal .sheet-back'); await p.waitForTimeout(600);
  check('both show on the card', (await onCard(p))===2, String(await onCard(p)));
  check('and both are listed among its pieces',
    await p.evaluate(()=>{
      const names = Array.from(document.querySelectorAll('#saved-gallery .outfit-piece-row .p-name'))
        .map(e=>e.textContent.trim());
      const want = favoriteOutfits[0].extras.map(id=>itemById(id).name);
      return want.every(n=>names.includes(n));
    }));
  check('the button now reads as the way back in',
    await p.isVisible('#saved-gallery button:has-text("Edit accessories")'));
  check('and it said "add" while there were none to edit',
    await p.evaluate(()=>{
      const was = favoriteOutfits[0].extras.slice();
      favoriteOutfits[0].extras = [];
      renderSavedOutfits();
      const said = document.querySelector('#saved-gallery .modal-actions button').textContent.trim();
      favoriteOutfits[0].extras = was;
      renderSavedOutfits();
      return said === '+ Add accessories';
    }));
  await p.screenshot({path:shot('e-3-attached.png')});

  // ---- 4. Tapping again takes it off ----
  await openPicker(p);
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(600);
  r = await row(p);
  check('tapping a ticked piece takes it off', r.extra_ids.length===1 && r.extra_ids[0]===firstHat,
    JSON.stringify(r.extra_ids));
  check('quietly, again', await p.evaluate(()=>!document.querySelector('.toast.show')));
  // The undo is the tap itself.
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(700);
  r = await row(p);
  check('and tapping once more puts it back', r.extra_ids.length===2,
    JSON.stringify(r.extra_ids));
  check('and the picker shows it back on straight away',
    await p.evaluate(()=>document.querySelectorAll('#extras-gallery .picker-selected').length)===1);

  // Take everything off again.
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(600);
  await p.click('#extras-tabs .tab:has-text("Hats")'); await p.waitForTimeout(400);
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(600);
  await p.click('.modal .sheet-back'); await p.waitForTimeout(600);
  r = await row(p);
  check('an outfit can be stripped back to bare', r.extra_ids.length===0, JSON.stringify(r.extra_ids));
  check('the row disappears with them', (await onCard(p))===0);
  check('and the outfit itself survives it all',
    r.archived_at===null && r.top_id==='seed_22' && r.combo_key===KEY);

  // ---- 5. It is really saved ----
  await openPicker(p);
  await p.click('#extras-gallery .picker-tile'); await p.waitForTimeout(600);
  await p.reload(); await p.waitForTimeout(1000);
  await p.click('#nav-saved-btn'); await p.waitForTimeout(600);
  check('what you put on survives a reload', (await onCard(p))===1, String(await onCard(p)));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
