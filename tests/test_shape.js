// One stream of both shapes, and no shape control: the base slots are the
// shape control. Pinning a top asks for tops and bottoms, pinning a dress
// asks for dresses — narrowing a slot rules its own shape in, and that is
// the only way shape is chosen now that ruling a category out is gone.
// The count line and the stream have to agree exactly.
const { chromium } = require('playwright');
const { leaveSheet, openFilterSection } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// The sheet is a list of rows now. Pieces opens the categories, and each
// category row says what is picked in it ("Any" when nothing is). These open
// the sheet, read the list, and put it away again.
async function onCategoryList(p, fn){
  await p.click('#filters-fab'); await p.waitForTimeout(500);
  await openFilterSection(p, 'pieces');
  const r = await fn();
  await leaveSheet(p, {settle:600});
  return r;
}
const chipLabels = p => onCategoryList(p, () => p.evaluate(()=>
  Array.from(document.querySelectorAll('#filter-sheet [data-filter-cat]')).map(e=>e.dataset.filterCat)));
const chipState = (p, label) => onCategoryList(p, () => p.evaluate(l=>{
  const row = document.querySelector(`#filter-sheet [data-filter-cat="${l}"]`);
  if(!row) return null;
  const value = row.querySelector('.capsule-pick-value').textContent.trim();
  return {
    // The row's value stands in for the old state: Any, or what is picked.
    state: value,
    value,
    active: value !== 'Any',
    // Every row reads at full strength whatever else is set.
    dimmed: row.classList.contains('moot') || getComputedStyle(row).opacity !== '1',
  };
}, label));
const bases = p => p.evaluate(()=>outfitDisplayed.map(c=>c.base));

// Through the real category page, the way she would: open the category, tap
// the first piece in it (the results behind the sheet follow at once), go
// back to the main page with the foot's Filters, then put the sheet away.
// Pinning is the only narrowing there is.
async function pin(p, cat){
  await p.evaluate(k=>(filterSheetOpen()||openFilterSheet(),openFilterPage(k)), cat);
  await p.waitForTimeout(400);
  await p.click('#picker-gallery .picker-tile:not(.picker-none)');
  await p.waitForTimeout(250);
  await p.click('#filter-sheet-back');
  await p.waitForTimeout(500);
  await leaveSheet(p, {settle:700});
}

// And Any is the way back from it.
async function unpin(p, cat){
  await p.evaluate(k=>(filterSheetOpen()||openFilterSheet(),openFilterPage(k)), cat);
  await p.waitForTimeout(400);
  await p.click('#filter-sheet-clear');
  await p.waitForTimeout(250);
  await p.click('#filter-sheet-back');
  await p.waitForTimeout(500);
  await leaveSheet(p, {settle:700});
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(500);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);

  // ---- 1. No shape control of any kind ----
  check('the top+bottom vs dress toggle is gone',
    await p.evaluate(()=>!document.getElementById('base-topbottom-btn') && !document.getElementById('base-dress-btn')));
  check('and so is the Shape chip that replaced it',
    !(await chipLabels(p)).includes('Shape'), (await chipLabels(p)).join(', '));
  const cats = await chipLabels(p);
  check('the wardrobe categories fill the list instead',
    await p.evaluate(ls => ls.slice(0,3).every(t => itemsInTab(t).length > 0) &&
             ls.every(t => OUTFIT_TABS.includes(t)), cats),
    cats.join(', '));
  check('every category starts on Any',
    (await chipState(p,'Tops')).state==='Any' &&
    (await chipState(p,'Pants')).state==='Any' &&
    (await chipState(p,'Dresses')).state==='Any');
  check('and none of them is dimmed',
    !(await chipState(p,'Tops')).dimmed && !(await chipState(p,'Dresses')).dimmed);

  // The count and the generator must agree. Walk the generator exhaustively
  // and compare with what the page reports.
  const truth = await p.evaluate(()=>{
    let n=0, tb=0, dr=0;
    for(const c of comboGenerator()){ n++; if(c.base==='topbottom') tb++; else dr++; }
    return {n, tb, dr, reported: totalComboCount()};
  });
  check('the count matches the stream exactly, both shapes summed',
    truth.n === truth.reported, `walked ${truth.n}, reported ${truth.reported}`);
  check('both shapes are actually in the stream',
    truth.tb > 0 && truth.dr > 0, `${truth.tb} top+bottom, ${truth.dr} dress`);

  const firstPage = await bases(p);
  check('the first page shows both shapes, not all of one',
    firstPage.includes('topbottom') && firstPage.includes('dress'),
    `${firstPage.filter(x=>x==='topbottom').length} top+bottom, ${firstPage.filter(x=>x==='dress').length} dress on page 1`);

  // ---- 2. Pinning a base slot is the shape control ----
  await pin(p, 'Dresses');
  check('pinning a dress leaves dress outfits only',
    (await bases(p)).every(x=>x==='dress') && (await bases(p)).length>0);
  check('the Dresses row says so, naming the dress picked',
    (await chipState(p,'Dresses')).value === await p.evaluate(()=>slotSummary('Dresses')) && (await chipState(p,'Dresses')).active,
    JSON.stringify(await chipState(p,'Dresses')));
  check('without dimming itself or anything else',
    !(await chipState(p,'Dresses')).dimmed && !(await chipState(p,'Tops')).dimmed);
  const drOnly = await p.evaluate(()=>{
    let n=0; for(const c of comboGenerator()) n++;
    return {n, reported: totalComboCount()};
  });
  check('the count follows the narrowing', drOnly.n === drOnly.reported,
    `walked ${drOnly.n}, reported ${drOnly.reported}`);

  await unpin(p, 'Dresses');
  await pin(p, 'Tops');
  check('pinning a top narrows the other way, to tops and bottoms',
    (await bases(p)).every(x=>x==='topbottom') && (await bases(p)).length>0);
  check('the Dresses row is untouched', (await chipState(p,'Dresses')).state==='Any');
  check('and nothing is dimmed for being the narrowed pair',
    !(await chipState(p,'Tops')).dimmed && !(await chipState(p,'Pants')).dimmed);
  const tbOnly = await p.evaluate(()=>{
    let n=0; for(const c of comboGenerator()) n++;
    return {n, reported: totalComboCount()};
  });
  check('the count follows that too', tbOnly.n === tbOnly.reported,
    `walked ${tbOnly.n}, reported ${tbOnly.reported}`);

  await pin(p, 'Pants');
  check('pinning a bottom as well says the same shape, not a new one',
    (await bases(p)).every(x=>x==='topbottom'));

  await unpin(p, 'Tops');
  await unpin(p, 'Pants');
  check('back to Any everywhere restores both shapes', await p.evaluate(()=>{
    const s=new Set(outfitDisplayed.map(c=>c.base)); return s.has('topbottom') && s.has('dress');
  }));

  // ---- 3. The implicit rule still holds ----
  await p.evaluate(()=>{
    outfitFilters['Tops'] = {type:'items', ids:[ITEMS.find(i=>tabForItem(i)==='Tops').id]};
    resetOutfitResults(); renderFilterControls();
  });
  await p.waitForTimeout(700);
  check('asking for a particular top rules dresses out on its own',
    (await bases(p)).every(x=>x==='topbottom'));
  check('without touching the Dresses row, in value or in weight',
    (await chipState(p,'Dresses')).state==='Any' && !(await chipState(p,'Dresses')).dimmed);

  await p.evaluate(()=>{
    outfitFilters['Tops'] = anyFilter();
    outfitFilters['Dresses'] = {type:'items', ids:[ITEMS.find(i=>tabForItem(i)==='Dresses').id]};
    resetOutfitResults(); renderFilterControls();
  });
  await p.waitForTimeout(700);
  check('and asking for a particular dress rules top+bottom out',
    (await bases(p)).every(x=>x==='dress'));

  // ---- 4. Contradictions are empty, not wrong ----
  await p.evaluate(()=>{
    outfitFilters['Tops'] = {type:'items', ids:[ITEMS.find(i=>tabForItem(i)==='Tops').id]};
    resetOutfitResults();
  });
  await p.waitForTimeout(700);
  check('a top and a dress at once is honestly empty',
    await p.evaluate(()=>outfitDisplayed.length===0 && totalComboCount()===0));

  // The empty page says it. Dimming three chips said it a second time, in
  // a language you had to learn first.
  check('and no row is dimmed to explain it',
    !(await chipState(p,'Tops')).dimmed && !(await chipState(p,'Pants')).dimmed &&
    !(await chipState(p,'Dresses')).dimmed);

  // ---- 5. Clear all ----
  await p.evaluate(()=>{ appMode='outfits'; clearFilters(); }); await p.waitForTimeout(700);
  check('Clear all puts every slot back to Any',
    await p.evaluate(()=>Object.keys(outfitFilters).every(k=>outfitFilters[k].type==='any')));
  check('and both shapes are back', await p.evaluate(()=>{
    const s=new Set(outfitDisplayed.map(c=>c.base)); return s.has('topbottom') && s.has('dress');
  }));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
