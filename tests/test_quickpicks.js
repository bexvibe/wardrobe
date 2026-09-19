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

  // Jumper allows "none", so it shows both quick picks
  await openFilters(p); await p.click('.filter-chip:has-text("Jumper")'); await p.waitForTimeout(400);
  let s=await state(p);
  check('picker offers both Any and None', s.length===2 && s[0].label==='Any' && s[1].label==='None',
    JSON.stringify(s));
  check('Any shows as selected by default', s[0].active && !s[1].active, JSON.stringify(s));
  await p.screenshot({path:shot('qp-any.png')});

  await p.click('#picker-quick-picks button:has-text("None")'); await p.waitForTimeout(300);
  s=await state(p);
  check('choosing None moves the selected state', !s[0].active && s[1].active, JSON.stringify(s));
  await p.screenshot({path:shot('qp-none.png')});

  // picking a specific item clears both
  await p.click('#picker-gallery .picker-tile'); await p.waitForTimeout(300);
  s=await state(p);
  const tileChecked=await p.evaluate(()=>document.querySelectorAll('#picker-gallery .picker-selected').length);
  check('picking an item deselects Any and None', !s[0].active && !s[1].active && tileChecked===1,
    JSON.stringify(s)+` tiles=${tileChecked}`);

  // removing it returns to Any
  await p.click('#picker-gallery .picker-tile.picker-selected'); await p.waitForTimeout(300);
  s=await state(p);
  check('clearing the last item returns Any to selected', s[0].active && !s[1].active, JSON.stringify(s));

  // reopening reflects a persisted None
  await p.click('#picker-quick-picks button:has-text("None")'); await p.waitForTimeout(200);
  await p.click('.modal .sheet-back'); await p.waitForTimeout(500);
  await openFilters(p); await p.click('.filter-chip:has-text("Jumper")'); await p.waitForTimeout(400);
  s=await state(p);
  check('reopening the picker still shows None selected', !s[0].active && s[1].active, JSON.stringify(s));

  // Top can be "none" too now — that is how you ask for dresses — so it
  // offers the same pair as a layer does.
  await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
  await openFilters(p); await p.click('.filter-chip:has-text("Top")'); await p.waitForTimeout(400);
  s=await state(p);
  check('Top offers Any and None, with Any selected',
    s.length===2 && s[0].label==='Any' && s[0].active && s[1].label==='None' && !s[1].active,
    JSON.stringify(s));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
