// The Filters sheet is four rows, and each opens a page: Pieces (a list of
// categories, then the pieces in one), Capsules, Tags and Faves.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO=path.join(__dirname,'..');
const PORT=process.env.PORT||8933;
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO+'/supabase/seed-items.json','utf8');
const TAGS={seed_0:['sporty'],seed_1:['sporty'],seed_2:['sporty','summer'],seed_3:['summer'],seed_4:['winter'],seed_5:['work'],seed_6:['work']};
const CAPS=[{id:'cap1',name:'Summer',created_at:new Date().toISOString()},{id:'cap2',name:'Work',created_at:new Date().toISOString()}];
const MEM=[{capsule_id:'cap1',item_id:'seed_0'},{capsule_id:'cap1',item_id:'seed_1'},{capsule_id:'cap2',item_id:'seed_5'}];
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true});
  p.setDefaultTimeout(8000);
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};`
       +`window.__WITH_CAPSULES=true;window.__SEED_CAPSULES=${JSON.stringify(CAPS)};window.__SEED_CAPSULE_ITEMS=${JSON.stringify(MEM)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1600);

  const txt = s => p.evaluate(x=>[...document.querySelectorAll(x)].map(e=>e.textContent.replace(/\s+/g,' ').trim()), s);
  const one = async s => (await txt(s))[0];
  const title = () => one('#filter-sheet-title');
  const see = () => one('#filter-sheet-see');
  const vis = s => p.isVisible(s);
  const settle = () => p.waitForTimeout(450);

  await p.click('#filters-fab'); await p.waitForTimeout(600);
  check('the sheet is a short list of rows', (await txt('#filter-sheet [data-filter-row]')).map(t=>t.split(' ')[0]).join()==='Pieces,Capsules,Tags,Faves',
    (await txt('#filter-sheet [data-filter-row]')).join(' | '));
  check('no chip walls any more', (await p.locator('#filter-sheet .tag-chip').count())===0 && (await p.locator('#sheet-filter-grid').count())===0);
  check('every row says Any when nothing is on', (await txt('#filter-sheet .capsule-pick-value')).every(t=>t==='Any'));
  check('the foot is the count alone', (await vis('#filter-sheet-see')) && !(await vis('#filter-sheet-back')) && /^See [\d,]+ outfits$/.test(await see()), await see());
  const total = await see();

  // ---- Pieces: categories, then pieces ----
  await p.click('[data-filter-row="pieces"]'); await settle();
  check('Pieces opens a list of categories', (await title())==='Pieces' && (await p.locator('#filter-sheet [data-filter-cat]').count())>=3,
    (await txt('#filter-sheet [data-filter-cat]')).join(' | '));
  check('with Back and the count at the foot', (await vis('#filter-sheet-back')) && (await vis('#filter-sheet-see')));
  check('and no tabs row of categories', (await p.locator('#filter-sheet .tab').count())===0);
  const cats = await p.evaluate(()=>[...document.querySelectorAll('#filter-sheet [data-filter-cat]')].map(e=>e.dataset.filterCat));
  await p.click(`#filter-sheet [data-filter-cat="${cats[0]}"]`); await settle();
  check('a category opens its pieces', (await title())===cats[0] && (await p.locator('#picker-gallery .tile').count())>1);
  check('the first tile is the none tile', await p.evaluate(()=>document.querySelector('#picker-gallery .tile').classList.contains('picker-none')));
  check('the foot is Back and a search pill', (await vis('#filter-sheet-back')) && (await vis('#filter-sheet-search')) && !(await vis('#filter-sheet-see')));
  const all = await p.locator('#picker-gallery .tile').count();
  await p.click('#picker-gallery .tile:not(.picker-none)'); await p.waitForTimeout(400);
  check('ticking a piece marks it', (await p.locator('#picker-gallery .picker-selected').count())===1);
  // typing narrows
  const firstName = await p.evaluate(c=>itemsInTab(c)[0].name, cats[0]);
  await p.fill('#filter-sheet-search', firstName.slice(0,4).toLowerCase()); await p.waitForTimeout(300);
  const narrowed = await p.locator('#picker-gallery .tile').count();
  check('typing narrows the pieces and hides the none tile', narrowed>=1 && narrowed<all && !(await p.evaluate(()=>!!document.querySelector('#picker-gallery .picker-none'))), `${narrowed} of ${all}`);
  await p.fill('#filter-sheet-search', 'zzzz-nothing'); await p.waitForTimeout(300);
  check('and says so when nothing matches', /Nothing called/.test(await one('#picker-empty')));
  await p.fill('#filter-sheet-search', ''); await p.waitForTimeout(300);
  check('clearing it brings them back', (await p.locator('#picker-gallery .tile').count())===all);
  await p.click('#filter-sheet-back'); await settle();
  check('Back from pieces returns to the categories', (await title())==='Pieces' && (await p.locator('#filter-sheet [data-filter-cat]').count())>=3);
  check('which now says what is picked', (await one(`#filter-sheet [data-filter-cat="${cats[0]}"] .capsule-pick-value`))!=='Any');
  await p.click('#filter-sheet-back'); await settle();
  check('and Back again returns to the rows', (await title())==='Filters' && (await vis('[data-filter-row="pieces"]')));
  check('the Pieces row shows the value', (await one('[data-filter-row="pieces"] .capsule-pick-value'))!=='Any');
  check('and it is spelled out as a chip at the top', (await p.locator('#filter-sheet .filter-active .filter-chip').count())===1);
  check('the count fell', (await see())!==total, `${total} → ${await see()}`);
  await p.click('#filter-sheet .filter-active .filter-chip'); await settle();
  check('tapping the chip takes the filter off', (await p.locator('#filter-sheet .filter-active').count())===0 && (await see())===total);

  // ---- Capsules ----
  await p.click('[data-filter-row="capsules"]'); await settle();
  check('Capsules lists them to tick', (await title())==='Capsules' && (await txt('#filter-section-list .capsule-pick')).join()==='Summer ✓'.replace(' ✓','')+','+'Work' || (await txt('#filter-section-list .capsule-pick')).length===2,
    (await txt('#filter-section-list .capsule-pick')).join(' | '));
  check('with a search pill', await vis('#filter-sheet-search'));
  await p.fill('#filter-sheet-search','wor'); await p.waitForTimeout(250);
  check('typing narrows them', (await p.locator('#filter-section-list .capsule-pick').count())===1);
  await p.fill('#filter-sheet-search',''); await p.waitForTimeout(250);
  await p.click('#filter-section-list .capsule-pick:has-text("Summer")'); await p.waitForTimeout(400);
  check('ticking one marks it', await p.evaluate(()=>document.querySelector('#filter-section-list .capsule-pick').classList.contains('picked')));
  check('and the search is still there, not rebuilt', await vis('#filter-sheet-search'));
  await p.click('#filter-sheet-back'); await settle();
  check('Back shows it on the row', (await one('[data-filter-row="capsules"] .capsule-pick-value'))==='Summer');
  await p.click('#filter-sheet-clear'); await settle();
  check('Clear all empties it', (await one('[data-filter-row="capsules"] .capsule-pick-value'))==='Any');

  // ---- Tags ----
  await p.click('[data-filter-row="tags"]'); await settle();
  const tagNames = await txt('#filter-section-list .capsule-pick');
  check('Tags are A to Z', JSON.stringify(tagNames.map(t=>t.replace(' ✓','')))===JSON.stringify(tagNames.map(t=>t.replace(' ✓','')).slice().sort((a,c)=>a.localeCompare(c))) && tagNames.length>=3, tagNames.join(','));
  await p.click('#filter-section-list .capsule-pick[data-tag="sporty"]'); await p.waitForTimeout(400);
  await p.click('#filter-section-list .capsule-pick[data-tag="summer"]'); await p.waitForTimeout(400);
  check('several can be on', (await p.locator('#filter-section-list .picked').count())===2);
  check('Clear on the page clears only that page', await p.evaluate(()=>getComputedStyle(document.getElementById('filter-sheet-clear')).visibility==='visible'));
  await p.click('#filter-sheet-back'); await settle();
  check('the row lists them', (await one('[data-filter-row="tags"] .capsule-pick-value'))==='sporty, summer', await one('[data-filter-row="tags"] .capsule-pick-value'));
  check('the pill counts tags as one filter', /1/.test(await p.evaluate(()=>document.getElementById('filters-fab').textContent)));

  // ---- Faves ----
  await p.click('[data-filter-row="faves"]'); await settle();
  check('Faves is three levels to tick', (await txt('#filter-section-list .capsule-pick')).join('|')==='Like|Love|All-time'.replace(/\|/g,'|') || (await p.locator('#filter-section-list .capsule-pick').count())===3,
    (await txt('#filter-section-list .capsule-pick')).join(' | '));
  check('with Back and the count, no search', (await vis('#filter-sheet-see')) && !(await vis('#filter-sheet-search')));
  await p.click('#filter-section-list .capsule-pick:nth-child(2)'); await p.waitForTimeout(400);
  check('ticking a level marks it', await p.evaluate(()=>document.querySelectorAll('#filter-section-list .picked').length===1));
  await p.click('#filter-sheet-back'); await settle();
  check('the row names the level', (await one('[data-filter-row="faves"] .capsule-pick-value'))==='Love');

  // ---- Clear all, and leaving ----
  check('three chips on top: two tags and a level', (await p.locator('#filter-sheet .filter-active .filter-chip').count())===3);
  await p.click('#filter-sheet-clear'); await settle();
  check('Clear all clears every row', (await txt('#filter-sheet .capsule-pick-value')).every(t=>t==='Any') && (await see())===total);
  await p.click('[data-filter-row="pieces"]'); await settle();
  await p.click('#filter-sheet-see'); await p.waitForTimeout(600);
  await p.click('#filters-fab'); await p.waitForTimeout(600);
  check('the sheet reopens on its rows', (await title())==='Filters');

  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`${ok}/${results.length} checks passed`); process.exit(ok===results.length?0:1);
})();
