const { chromium } = require('playwright');
const { filterBack } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
async function open(b, stars){
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_STARS=${stars};window.__SEED_TAGS={};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(500);
  return p;
}
(async()=>{
  const b=await chromium.launch();
  let p=await open(b,false);
  await p.evaluate(()=>openModal(ITEMS[0].id)); await p.waitForTimeout(500);
  check('without the column there is no star', !(await p.$('.photo-star')));
  await p.close();

  p=await open(b,true);
  await p.evaluate(()=>openModal(ITEMS[0].id)); await p.waitForTimeout(500);
  check('a piece card has a star', !!(await p.$('.photo-star')));
  await p.click('.photo-star'); await p.waitForTimeout(300);
  check('tapping stars it', await p.evaluate(()=>ITEMS[0].starred === true && document.querySelector('.photo-star').classList.contains('on')));
  await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
  check('the wardrobe tile wears a star', await p.evaluate(()=>!!document.querySelector('.tile .tile-star')));
  await p.evaluate(()=>{ ITEMS.forEach((i,n)=>{ i.starred = n < 40; }); });

  // Filters on the outfits page
  await p.evaluate(()=>setMode('outfits')); await p.waitForTimeout(800);
  await p.evaluate(()=>{ if(!filterSheetOpen()) document.getElementById('filters-fab').click(); }); await p.waitForTimeout(500);
  check('the filter sheet has a Starred row', await p.evaluate(()=>!!document.querySelector('[data-filter-row="stars"]')));
  await p.click('[data-filter-row="stars"]'); await p.waitForTimeout(800);
  check('it ticks on the first page, with no second page', await p.evaluate(()=>!filterSection && document.querySelector('[data-filter-row="stars"]').getAttribute('aria-pressed') === 'true'));
  check('turning it on narrows the pool to starred pieces', await p.evaluate(()=>starFilter === true && allowedPieceIds().size === 40));
  check('and every outfit shown is made of starred pieces', await p.evaluate(()=>{
    const ids = allowedPieceIds();
    return outfitDisplayed.length > 0 && outfitDisplayed.every(c => comboInCapsules(c));
  }));
  check('the pill counts it', await p.evaluate(()=>activeFilterCount() >= 1));
  check('a chip on the sheet says it is on, and removes it', await p.evaluate(()=>{
    const c = [...document.querySelectorAll('.filter-active .filter-chip')].find(x => x.textContent.includes('Starred'));
    if(!c) return false; c.click(); return starFilter === false; }));
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
  await b.close(); process.exitCode = results.every(Boolean) ? 0 : 1;
})();
