// The featured outfit as spaces: jacket and jumper on one layer, then the
// top, then the bottom (or a dress). Each space opens Filters on its
// category and can be locked, and a lock is nothing more than the filter
// for that one piece. Shuffle on All deals the hero and nothing else.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  if(await p.isVisible('#gate-login')){
    await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  }
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
  return p;
}
const heroKey = p => p.evaluate(()=>comboKey(heroCombo));
const gridKeys = p => p.evaluate(()=>[...document.querySelectorAll('#outfit-gallery .outfit-card')].map(e=>e.dataset.key).join(','));
// Deal until the hero is the shape wanted.
async function dealUntil(p, test, tries=200){
  for(let i=0;i<tries;i++){
    if(await p.evaluate(test)) return true;
    await p.click('#shuffle-fab'); await p.waitForTimeout(80);
  }
  return false;
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- the shape ----
  {
    const p=await open(b);
    check('the hero has a title', (await p.textContent('#outfit-hero .hero-title')).trim() === 'Try this');
    check('and the grid has one', (await p.textContent('#gallery-title')).trim() === 'More combos');
    check('and a dress-free hero has jacket, jumper, top and bottom spaces',
      (await dealUntil(p, ()=>heroCombo.base !== 'dress')) &&
      await p.evaluate(()=>['jacket','jumper','top','bottom'].every(s=>document.querySelector('.hero-slot.'+s))));
    check('jacket and jumper share the first layer, then top, then bottom', await p.evaluate(()=>{
      const y = s => Math.round(document.querySelector('.hero-slot.'+s).getBoundingClientRect().top);
      return y('jacket') === y('jumper') && y('top') > y('jacket') && y('bottom') > y('top');
    }));
    check('there is no shoes space', await p.evaluate(()=>!document.querySelector('.hero-slot.shoes')));
    check('a dress takes the place of the top and bottom',
      (await dealUntil(p, ()=>heroCombo.base === 'dress')) &&
      await p.evaluate(()=>!document.querySelector('.hero-slot.top') && !document.querySelector('.hero-slot.bottom') &&
                           !!document.querySelector('.hero-slot.dress')));
    check('and nothing is captioned', await p.evaluate(()=>!document.querySelector('.hero-slot .cap, .hero-caption')));

    // an empty optional space says what it is
    check('a space with nothing in it says so',
      (await dealUntil(p, ()=>!heroCombo.jumper)) &&
      (await p.textContent('.hero-slot.jumper .hero-none')).trim() === 'No jumper');
    await p.close();
  }

  // ---- shuffle on All deals the hero and nothing else ----
  {
    const p=await open(b);
    const grid = await gridKeys(p), seedBefore = await p.evaluate(()=>sessionSeed);
    let changed = 0;
    for(let i=0;i<5;i++){ const h = await heroKey(p); await p.click('#shuffle-fab'); await p.waitForTimeout(150);
      if((await heroKey(p)) !== h) changed++; }
    check('Shuffle deals the hero again', changed >= 4, `${changed} of 5 changed`);
    check('and the grid is exactly as it was', (await gridKeys(p)) === grid);
    check('and the page is not reshuffled', (await p.evaluate(()=>sessionSeed)) === seedBefore);
    await p.close();
  }

  // ---- locking is filtering ----
  {
    const p=await open(b);
    await dealUntil(p, ()=>heroCombo.base !== 'dress' && heroCombo.jacket && !heroCombo.jumper && !heroCombo.overtop);
    const id = await p.evaluate(()=>heroCombo.jacket.id);
    const before = await heroKey(p);
    await p.click('.hero-slot.jacket .hero-lock'); await p.waitForTimeout(500);
    check('locking a jacket pins that one piece',
      await p.evaluate(i=>outfitFilters['Jackets'].type === 'items' && outfitFilters['Jackets'].ids.join() === i, id));
    check('the outfit stays, because locking is keeping it', (await heroKey(p)) === before);
    check('and the space shows locked', await p.evaluate(()=>document.querySelector('.hero-slot.jacket').classList.contains('locked') &&
      document.querySelector('.hero-slot.jacket .hero-lock').getAttribute('aria-pressed') === 'true'));
    check('the filters button counts it', (await p.textContent('#filters-fab .filters-fab-count')).trim() === '1');

    // locking the empty jumper locks it as none
    await p.click('.hero-slot.jumper .hero-lock'); await p.waitForTimeout(500);
    check('locking an empty space locks it as none',
      await p.evaluate(()=>outfitFilters['Jumpers'].type === 'none'));
    check('and the count follows', (await p.textContent('#filters-fab .filters-fab-count')).trim() === '2');

    // shuffle holds what is locked
    let held = true;
    for(let i=0;i<6;i++){ await p.click('#shuffle-fab'); await p.waitForTimeout(120);
      held = held && await p.evaluate(i2=>heroCombo.jacket && heroCombo.jacket.id === i2 && !heroCombo.jumper, id); }
    check('Shuffle keeps a locked jacket and a locked-none jumper', held);
    check('and the grid below follows the locks', await p.evaluate(i2=>outfitDisplayed.every(c=>c.jacket && c.jacket.id===i2 && !c.jumper), id));

    // unlocking
    await p.click('.hero-slot.jacket .hero-lock'); await p.waitForTimeout(500);
    check('tapping a lock again lets go of it',
      await p.evaluate(()=>outfitFilters['Jackets'].type === 'any'));
    await p.close();
  }

  // ---- tapping a space opens its filters ----
  {
    const p=await open(b);
    await dealUntil(p, ()=>heroCombo.base !== 'dress' && heroCombo.jacket);
    await p.click('.hero-slot.jacket .hero-slot-open'); await p.waitForTimeout(900);
    check('tapping the jacket opens Filters on Jackets',
      await p.evaluate(()=>filterSheetOpen() && filterPage === 'Jackets'));
    check('and it is the same sheet, with a Back to the list',
      !!(await p.$('#filter-sheet-back')));
    await p.click('#filter-sheet-back'); await p.waitForTimeout(600);
    check('Back goes to the list of categories', await p.evaluate(()=>filterPage === null));
    await p.click('#filter-sheet-see'); await p.waitForTimeout(600);
    await dealUntil(p, ()=>heroCombo.base !== 'dress');
    await p.click('.hero-slot.bottom .hero-slot-open'); await p.waitForTimeout(900);
    check('the bottom opens the category of the piece in it',
      await p.evaluate(()=>filterPage === tabForItem(heroCombo.bottom)));
    await p.close();
  }

  // ---- where Filters and Shuffle live ----
  {
    const p=await open(b);
    check('on All Filters is up in the header with an icon', await p.evaluate(()=>{
      const f = document.getElementById('filters-fab');
      return f.parentElement.id === 'all-icon-row' && !!f.querySelector('.filters-fab-icon') &&
             getComputedStyle(f).display !== 'none';
    }));
    check('and Shuffle is alone in the floating row', await p.evaluate(()=>
      document.getElementById('float-row').children.length === 1));
    await toFaves(p, 1100);
    check('on Faves Filters floats again, without the icon', await p.evaluate(()=>{
      const f = document.getElementById('filters-fab');
      return f.parentElement.id === 'float-row' && !f.querySelector('.filters-fab-icon');
    }));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
