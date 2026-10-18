const { chromium } = require('playwright');
const { leaveSheet } = require('./nav');
// The filters are a sheet that never opens itself; the pill raises it.
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
// The head's Clear: not a disabled button any more, but visibility:hidden
// while there is nothing to clear on the page showing.
const head=p=>p.evaluate(()=>{
  const c=document.getElementById('filter-sheet-clear');
  return {label:c.textContent.trim(), visible:getComputedStyle(c).visibility!=='hidden',
          disabled:c.disabled,
          title:document.getElementById('filter-sheet-title').textContent.trim(),
          crumb:getComputedStyle(document.getElementById('filter-sheet-crumb')).display!=='none'
                ? document.getElementById('filter-sheet-crumb').textContent.trim() : null};
});
const foot=p=>p.evaluate(()=>({
  see:(document.getElementById('filter-sheet-see')||{}).textContent,
  back:!!document.getElementById('filter-sheet-back'),
  results:totalComboCount()}));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await prepare(p);
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await signIn(p);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(700);

  // The head holds one Clear, top right. On a category page it clears that
  // category; it is hidden (not disabled) while nothing is narrowed.
  await openFilters(p);
  let h=await head(p);
  check('the main page is titled Filters with Clear all, hidden while nothing is narrowed',
    h.title==='Filters' && h.label==='Clear all' && !h.visible && h.crumb===null, JSON.stringify(h));

  await p.click('#filter-sheet .filter-chip:has-text("Jumper")'); await p.waitForTimeout(500);
  h=await head(p);
  check('a category page is titled for the category, with a Filters crumb and a plain Clear',
    /^Jumpers?$/.test(h.title) && h.crumb==='Filters' && h.label==='Clear', JSON.stringify(h));
  check('Clear is hidden, not disabled, while nothing is narrowed',
    !h.visible && !h.disabled, JSON.stringify(h));
  check('and None is the first tile',
    await p.evaluate(()=>document.querySelector('#picker-gallery .picker-tile').classList.contains('picker-none')));
  let f=await foot(p);
  check('the foot holds Back and See N outfits, and nothing like Done',
    f.back && /^See [\d,]+ outfits?$/.test(f.see.trim()) && !/Done/.test(await p.evaluate(()=>document.getElementById('filter-sheet-foot').textContent)),
    JSON.stringify(f));
  await p.screenshot({path:shot('qp-any.png')});

  // Picking a specific item shows Clear, and the results follow at once.
  const before=f.results;
  await p.click('#picker-gallery .picker-tile:not(.picker-none)'); await p.waitForTimeout(300);
  h=await head(p); f=await foot(p);
  const tileChecked=await p.evaluate(()=>document.querySelectorAll('#picker-gallery .picker-selected').length);
  check('picking an item shows Clear', h.visible && tileChecked===1, JSON.stringify(h)+` tiles=${tileChecked}`);
  check('and the foot count is the results behind the sheet, already narrowed',
    f.results<before && f.see.replace(/[^\d]/g,'')===String(f.results), `${before} -> ${f.results} "${f.see}"`);

  // Clear in the head puts the category back to Any.
  await p.click('#filter-sheet-clear'); await p.waitForTimeout(300);
  h=await head(p);
  check('Clear returns the category to Any and hides itself',
    !h.visible && await p.evaluate(()=>activeSlotFilters().Jumpers ? activeSlotFilters().Jumpers.type==='any'
      : Object.values(activeSlotFilters()).every(x=>x.type==='any')), JSON.stringify(h));

  // Taking the last item off again also returns to Any.
  await p.click('#picker-gallery .picker-tile:not(.picker-none)'); await p.waitForTimeout(250);
  await p.click('#picker-gallery .picker-tile.picker-selected'); await p.waitForTimeout(300);
  h=await head(p);
  check('unticking the last item hides Clear again', !h.visible, JSON.stringify(h));

  // A pinned selection survives shutting the sheet and opening it again.
  await p.click('#picker-gallery .picker-tile:not(.picker-none)'); await p.waitForTimeout(250);
  await leaveSheet(p, {settle:500});
  await openFilters(p);
  h=await head(p);
  check('the sheet reopens on its main page, Clear all showing what is pinned',
    h.title==='Filters' && h.label==='Clear all' && h.visible, JSON.stringify(h));
  await p.click('#filter-sheet .filter-chip:has-text("Jumper")'); await p.waitForTimeout(500);
  check('reopening the page still shows what you pinned',
    await p.evaluate(()=>document.querySelectorAll('#picker-gallery .picker-selected').length===1));

  // The foot's Filters goes back; the chips are refreshed.
  await p.click('#filter-sheet-back'); await p.waitForTimeout(500);
  check('Filters in the foot returns to the main page with the chip on',
    await p.evaluate(()=>document.getElementById('filter-sheet-title').textContent.trim()==='Filters'
      && !document.getElementById('filter-sheet-back')
      && /Jumper/.test(document.querySelector('#filter-sheet .filter-chip.active')?.textContent||'')));

  // Every category is the same: Clear hidden until something is chosen.
  await leaveSheet(p, {settle:400});
  await openFilters(p); await p.click('#filter-sheet .filter-chip:has-text("Top")'); await p.waitForTimeout(500);
  h=await head(p);
  check('a base category has the same head', h.label==='Clear' && h.crumb==='Filters', JSON.stringify(h));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
