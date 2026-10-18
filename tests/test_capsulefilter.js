// The Capsules row in the filters: outfits drawn only from the chosen capsules.
const { chromium } = require('playwright');
const { toFaves, toAll } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const CAPS=[{id:'cap_a',name:'Alpha',archived_at:null,created_at:'2026-01-01'},
            {id:'cap_b',name:'Beta',archived_at:null,created_at:'2026-01-02'}];
const MEMBERS=[{capsule_id:'cap_a',item_id:'seed_22'},{capsule_id:'cap_a',item_id:'seed_11'},
               {capsule_id:'cap_b',item_id:'seed_12'}];
const SAVED=[
  {combo_key:'tb|seed_22|seed_11|none|none|none', base:'topbottom', top_id:'seed_22', bottom_id:'seed_11', dress_id:null, jumper_id:null, jacket_id:null, shoe_id:null, archived_at:null, created_at:'2026-01-01'},
  {combo_key:'tb|seed_22|seed_12|none|none|none', base:'topbottom', top_id:'seed_22', bottom_id:'seed_12', dress_id:null, jumper_id:null, jacket_id:null, shoe_id:null, archived_at:null, created_at:'2026-01-02'},
  {combo_key:'tb|seed_23|seed_12|none|none|none', base:'topbottom', top_id:'seed_23', bottom_id:'seed_12', dress_id:null, jumper_id:null, jacket_id:null, shoe_id:null, archived_at:null, created_at:'2026-01-03'},
];

async function open(b){
  const p = await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  const pre = `window.__SEED_ITEMS=${seed};window.__SEED_CAPSULES=${JSON.stringify(CAPS)};`
    + `window.__SEED_CAPSULE_ITEMS=${JSON.stringify(MEMBERS)};window.__SEED_OUTFITS=${JSON.stringify(SAVED)};`;
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript', body:`${pre}\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(500);
  return p;
}
const chips = p => p.evaluate(() => [...document.querySelectorAll('#sheet-capsule-chips .filter-chip')]
  .map(c => ({t:c.textContent.trim(), on:c.classList.contains('active')})));
const tap = async (p, name) => {
  await p.evaluate(n => [...document.querySelectorAll('#sheet-capsule-chips .filter-chip')]
    .find(c => c.textContent.trim() === n).click(), name);
  await p.waitForTimeout(500);
};
const dealt = p => p.evaluate(() => outfitDisplayed.map(c => comboPieces(c).map(x => x.id)));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await open(b);
  await toAll(p);
  // The sheet never raises itself: it is down on arrival, the pill raises it.
  check('the filter sheet is closed on arrival', !(await p.evaluate(() => filterSheetOpen())));
  await p.click('#filters-fab'); await p.waitForTimeout(400);
  check('the Filters pill raises it', await p.evaluate(() => filterSheetOpen()));

  const first = await p.evaluate(() => document.querySelector('#filter-sheet-body .filter-section .filter-sheet-label').textContent);
  check('Capsules is the first row of the sheet', first.startsWith('Capsules'), first);
  check('one chip per capsule', JSON.stringify((await chips(p)).map(c=>c.t))==='["Alpha","Beta"]');

  await tap(p,'Alpha');
  let ids = await dealt(p);
  check('Alpha on: chip is active', (await chips(p))[0].on);
  check('Alpha on: only Alpha pieces are dealt', ids.length>0 && ids.every(c=>c.every(x=>['seed_22','seed_11'].includes(x))), JSON.stringify(ids.slice(0,3)));

  await tap(p,'Beta');
  ids = await dealt(p);
  const all3 = ['seed_22','seed_11','seed_12'];
  check('Alpha + Beta: pieces mix across both', ids.length>0 && ids.every(c=>c.every(x=>all3.includes(x)))
    && ids.some(c=>c.includes('seed_12')), JSON.stringify(ids.slice(0,4)));

  // The sheet dims the page and covers the nav, so leave it before switching.
  await p.click('#filter-sheet-see'); await p.waitForTimeout(500);
  await toFaves(p);
  await p.click('#filters-fab'); await p.waitForTimeout(400);
  check('Faves keeps the capsules on', (await chips(p)).every(c=>c.on));
  let n = await p.evaluate(() => document.querySelectorAll('#saved-gallery .outfit-card').length);
  check('Faves: both capsules → outfits 1 and 2', n===2, String(n));
  await tap(p,'Beta');
  n = await p.evaluate(() => document.querySelectorAll('#saved-gallery .outfit-card').length);
  check('Faves: Alpha only → outfit 1', n===1, String(n));
  await tap(p,'Alpha');
  n = await p.evaluate(() => document.querySelectorAll('#saved-gallery .outfit-card').length);
  check('Tap again clears the filter', n===3 && (await chips(p)).every(c=>!c.on), String(n));

  await tap(p,'Alpha');
  await p.evaluate(() => clearFilters()); await p.waitForTimeout(400);
  check('Clear all removes capsule filter', (await chips(p)).every(c=>!c.on));

  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  process.exit(ok===results.length?0:1);
})();
