// One stream of both shapes, and no shape control: the three base slots are
// the shape control. Dress → None asks for tops and bottoms, Top → None asks
// for dresses. The count line and the stream have to agree exactly, and the
// implicit rule (narrowing a slot rules its own shape in) has to hold.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const chipLabels = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
    .map(e=>e.childNodes[0].textContent.trim()));
const chipState = (p, label) => p.evaluate(l=>{
  const chip = Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
    .find(e=>e.childNodes[0].textContent.trim()===l);
  if(!chip) return null;
  // The chip no longer spells its state out — it is an outline, or filled
  // with a count, or filled with the label struck through. Read it back off
  // the attribute and put the old words on it, so the checks below still
  // read as sentences.
  const badge = chip.querySelector('.chip-count');
  return {
    state: chip.dataset.state === 'any' ? 'Any'
         : chip.dataset.state === 'none' ? 'None'
         : `${badge.textContent.trim()} selected`,
    struck: chip.classList.contains('excluded'),
    badge: badge ? badge.textContent.trim() : null,
    active: chip.classList.contains('active'),
    // Dimming a slot the shape cannot use is gone: every chip reads at
    // full strength whatever else is set.
    dimmed: chip.classList.contains('moot') || getComputedStyle(chip).opacity !== '1',
  };
}, label);
const bases = p => p.evaluate(()=>outfitDisplayed.map(c=>c.base));

// Through the real picker, the way she would: open the category, tap None,
// come back. The bottom half is three categories now — pants, shorts and
// skirts — so "no bottom at all" means saying None to each of them.
async function setSlot(p, label, choice){
  const cats = {Top:['Tops'], Bottom:['Pants','Shorts','Skirts'], Dress:['Dresses']}[label];
  for(const cat of cats){
    // A category you own nothing in has no None to choose: it is already
    // none, so the picker does not offer the choice.
    if(!(await p.evaluate(c => itemsInTab(c).length > 0, cat))) continue;
    await p.evaluate(k=>openSlotPicker(k), cat);
    await p.waitForTimeout(350);
    await p.click(`#picker-quick-picks .base-btn:has-text("${choice}")`);
    await p.waitForTimeout(250);
    await p.click('.modal .sheet-back');
    await p.waitForTimeout(500);
  }
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
  check('the wardrobe categories lead the row instead',
    await p.evaluate(()=>{
      const ls = Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
        .map(e=>e.childNodes[0].textContent.trim());
      return ls.slice(0,3).every(t => itemsInTab(t).length > 0) &&
             ls.every(t => OUTFIT_TABS.includes(t));
    }),
    (await chipLabels(p)).join(', '));
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

  // ---- 2. None on a base slot is the shape control ----
  await setSlot(p, 'Dress', 'None');
  check('Dress → None leaves tops and bottoms only',
    (await bases(p)).every(x=>x==='topbottom') && (await bases(p)).length>0);
  check('the Dress chip says so', (await chipState(p,'Dresses')).state==='None');
  check('without dimming itself, though this shape has no dress',
    !(await chipState(p,'Dresses')).dimmed);
  check('Top and Bottom read the same as ever', !(await chipState(p,'Tops')).dimmed);
  const tbOnly = await p.evaluate(()=>{
    let n=0; for(const c of comboGenerator()) n++;
    return {n, reported: totalComboCount()};
  });
  check('the count follows the narrowing', tbOnly.n === tbOnly.reported,
    `walked ${tbOnly.n}, reported ${tbOnly.reported}`);

  await setSlot(p, 'Dress', 'Any');
  await setSlot(p, 'Top', 'None');
  check('Top → None narrows the other way, to dresses',
    (await bases(p)).every(x=>x==='dress') && (await bases(p)).length>0);
  check('the Dress chip is untouched', (await chipState(p,'Dresses')).state==='Any');
  check('and Top and Bottom are not dimmed for being the narrowed pair',
    !(await chipState(p,'Tops')).dimmed && !(await chipState(p,'Pants')).dimmed);
  const drOnly = await p.evaluate(()=>{
    let n=0; for(const c of comboGenerator()) n++;
    return {n, reported: totalComboCount()};
  });
  check('the count follows that too', drOnly.n === drOnly.reported,
    `walked ${drOnly.n}, reported ${drOnly.reported}`);

  await setSlot(p, 'Bottom', 'None');
  check('Bottom → None says the same thing, not something new',
    (await bases(p)).every(x=>x==='dress'));

  await setSlot(p, 'Top', 'Any');
  await setSlot(p, 'Bottom', 'Any');
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
  check('without touching the Dress chip, in value or in weight',
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

  await p.evaluate(()=>{
    outfitFilters = emptySlotFilters();
    outfitFilters['Tops'] = {type:'none', ids:[]};
    outfitFilters['Dresses'] = {type:'none', ids:[]};
    resetOutfitResults(); renderFilterControls();
  });
  await p.waitForTimeout(700);
  check('no top and no dress leaves nothing an outfit could be',
    await p.evaluate(()=>outfitDisplayed.length===0 && totalComboCount()===0));
  // The empty page says it. Dimming three chips said it a second time, in
  // a language you had to learn first.
  check('and no chip is dimmed to explain it',
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
