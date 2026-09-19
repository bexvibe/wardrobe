const { chromium } = require('playwright');
// The filters dock at the bottom of the screen and open themselves on
// Outfits and Faves. Everywhere else the pill raises them.
async function openFilters(page){
  const open = await page.evaluate(() => filterSheetOpen());
  if(!open){ await page.click('#filters-fab'); await page.waitForTimeout(400); }
}
async function closeFilters(page){
  await page.evaluate(() => closeFilterSheet());
  await page.waitForTimeout(300);
}

const fs=require('fs'), pathmod=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(pathmod.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
// The app sits behind a password gate now, so these tests stub the backend
// and sign in, the way the rest of the suite does.
async function prepare(p){
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
}
async function signIn(p){
  await p.fill('#gate-password','correct-horse');
  await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'});
  await p.waitForTimeout(400);
}

const path=require('path');
const results=[];
const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
const state=p=>p.evaluate(()=>[...document.querySelectorAll('#picker-quick-picks button')]
  .map(b=>({label:b.textContent.trim(), active:b.classList.contains('active')})));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await prepare(p);
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await signIn(p);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(700);

  // Any is the only quick pick now. Ruling a category out altogether sat
  // beside it and was the one filter that narrowed by subtraction — a
  // different idea in the same row of buttons.
  await openFilters(p); await p.click('.filter-chip:has-text("Jumper")'); await p.waitForTimeout(400);
  let s=await state(p);
  check('the picker offers Any and nothing else',
    s.length===1 && s[0].label==='Any', JSON.stringify(s));
  check('Any shows as selected by default', s[0].active, JSON.stringify(s));
  check('and None is not on offer anywhere in the picker',
    !(await p.evaluate(()=>/\bNone\b/.test(document.querySelector('.modal').innerText))));
  await p.screenshot({path:shot('qp-any.png')});

  // Picking a specific item takes Any off.
  await p.click('#picker-gallery .picker-tile'); await p.waitForTimeout(300);
  s=await state(p);
  const tileChecked=await p.evaluate(()=>document.querySelectorAll('#picker-gallery .picker-selected').length);
  check('picking an item deselects Any', !s[0].active && tileChecked===1,
    JSON.stringify(s)+` tiles=${tileChecked}`);

  // And taking it off again returns to Any.
  await p.click('#picker-gallery .picker-tile.picker-selected'); await p.waitForTimeout(300);
  s=await state(p);
  check('clearing the last item returns Any to selected', s[0].active, JSON.stringify(s));

  // A pinned selection survives shutting the picker and opening it again.
  await p.click('#picker-gallery .picker-tile'); await p.waitForTimeout(250);
  await p.click('.modal .sheet-back'); await p.waitForTimeout(500);
  await openFilters(p); await p.click('.filter-chip:has-text("Jumper")'); await p.waitForTimeout(400);
  check('reopening the picker still shows what you pinned',
    await p.evaluate(()=>document.querySelectorAll('#picker-gallery .picker-selected').length===1));

  // Every category is the same: one quick pick, whatever it is for.
  await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
  await openFilters(p); await p.click('.filter-chip:has-text("Top")'); await p.waitForTimeout(400);
  s=await state(p);
  check('a base category offers the same one', s.length===1 && s[0].label==='Any' && s[0].active,
    JSON.stringify(s));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
