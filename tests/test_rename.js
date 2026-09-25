// Verifies renaming a piece: the edit form pre-fills, the new name is
// written to the database, and it propagates everywhere the name shows.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
// Search now lives behind an icon, in a bar that opens over the page.
async function typeSearch(page, text){
  const open = await page.evaluate(()=>document.getElementById('search-overlay').classList.contains('open'));
  if(!open){ await page.click('#search-btn'); await page.waitForTimeout(250); }
  await page.fill('#filter-search', text);
  await page.waitForTimeout(350);
}
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');

// a saved outfit whose top is seed_22, so a rename must show up here too
const SAVED=[{combo_key:'tb|seed_22|seed_11|none|none|none', base:'topbottom',
  top_id:'seed_22', bottom_id:'seed_11', dress_id:null, jumper_id:null, jacket_id:null,
  shoe_id:null, archived_at:null, created_at:new Date().toISOString()}];

const results=[];
const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__SEED_OUTFITS=${JSON.stringify(SAVED)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'wardrobe@the-archive.app'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);

  const original = await p.evaluate(()=>ITEMS.find(i=>i.id==='seed_22').name);
  const NEW_NAME = 'Favourite Black Shirt';

  // open that item's detail sheet from the list view (easier to target by name)
  await p.click('#view-toggle-btn'); await p.waitForTimeout(300);
  await p.evaluate(()=>openModal('seed_22')); await p.waitForTimeout(400);
  await p.click('.modal-actions button:has-text("Edit")'); await p.waitForTimeout(400);

  const prefilled = await p.inputValue('#form-name');
  check('edit form pre-fills the current name', prefilled===original, `"${prefilled}"`);

  await p.fill('#form-name', NEW_NAME);
  await p.click('#form-save-btn'); await p.waitForTimeout(600);

  const row = await p.evaluate(()=>window.__WARDROBE_STATE.items.find(r=>r.id==='seed_22'));
  check('new name is written to the database', row.name===NEW_NAME, `"${row.name}"`);
  check('rename does not disturb other fields',
    row.brand && row.category && row.photo, `brand="${row.brand}" cat="${row.category}"`);
  check('rename is not a soft-delete', row.archived_at===null);

  const inMemory = await p.evaluate(()=>ITEMS.find(i=>i.id==='seed_22').name);
  check('in-memory item reflects the rename', inMemory===NEW_NAME, `"${inMemory}"`);

  // Saving returns you to the piece you were editing, so the sheet comes
  // off before going back to the grid behind it.
  await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);

  // shows in the inventory list
  await typeSearch(p, 'Favourite Black');
  const titles = await p.$$eval('.name-row-title', els=>els.map(e=>e.textContent.trim()));
  check('renamed piece is findable by its new name', titles.includes(NEW_NAME), titles.join(' | '));

  // propagates into an outfit saved before the rename
  await typeSearch(p, '');
  await toFaves(p, 500);
  await p.click('#saved-gallery .outfit-card'); await p.waitForTimeout(400);
  const pieceNames = await p.$$eval('#saved-gallery .p-name', els=>els.map(e=>e.textContent.trim()));
  check('saved outfit shows the new name', pieceNames.includes(NEW_NAME), pieceNames.join(' | '));

  // survives a reload (came back from the database, not just local state)
  await p.reload(); await p.waitForTimeout(900);
  const afterReload = await p.evaluate(()=>ITEMS.find(i=>i.id==='seed_22').name);
  check('rename survives a reload', afterReload===NEW_NAME, `"${afterReload}"`);

  // empty name is rejected rather than wiping the item
  await p.evaluate(()=>openModal('seed_22')); await p.waitForTimeout(400);
  await p.click('.modal-actions button:has-text("Edit")'); await p.waitForTimeout(300);
  await p.fill('#form-name','   ');
  await p.click('#form-save-btn'); await p.waitForTimeout(400);
  const err = await p.textContent('#form-error');
  const stillNamed = await p.evaluate(()=>window.__WARDROBE_STATE.items.find(r=>r.id==='seed_22').name);
  check('blank name is refused, item keeps its name',
    /name is needed/i.test(err) && stillNamed===NEW_NAME, `error="${err.trim()}" name="${stillNamed}"`);
  await p.screenshot({path:shot('rename.png')});

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
