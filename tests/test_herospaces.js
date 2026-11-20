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

async function open(b, popup = true){
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
  if(popup){ await p.click('#outfit-hero .hero-feature'); await p.waitForTimeout(500); }
  return p;
}
const heroKey = p => p.evaluate(()=>comboKey(heroCombo));
const gridKeys = p => p.evaluate(()=>[...document.querySelectorAll('#outfit-gallery .outfit-card')].map(e=>e.dataset.key).join(','));
// Deal until the hero is the shape wanted.
async function dealUntil(p, test, tries=200){
  for(let i=0;i<tries;i++){
    if(await p.evaluate(test)) return true;
    await p.click('#hero-pop-shuffle'); await p.waitForTimeout(80);
  }
  return false;
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- the shape ----
  {
    const p=await open(b);
    check('the hero is a plain outfit card with no panel text', await p.evaluate(()=>
      !!document.querySelector('#outfit-hero .outfit-card.hero-feature') &&
      !document.querySelector('#outfit-hero .hero-title, #outfit-hero .hero-sub')));
    check('and it shows a padlock on its pieces', await p.evaluate(()=>
      document.querySelectorAll('#outfit-hero .hero-badge').length >= 2));
    check('and the grid has one', (await p.textContent('#gallery-title')).trim() === 'More combos');
    check('and a dress-free hero with both layers has jacket, jumper, top and bottom spaces',
      (await dealUntil(p, ()=>heroCombo.base !== 'dress' && heroCombo.jacket && heroCombo.jumper, 600)) &&
      await p.evaluate(()=>['jacket','jumper','top','bottom'].every(s=>document.querySelector('#hero-pop .hero-slot.'+s))));
    check('jacket and jumper share the first layer, then top, then bottom', await p.evaluate(()=>{
      const y = s => Math.round(document.querySelector('#hero-pop .hero-slot.'+s).getBoundingClientRect().top);
      return y('jacket') === y('jumper') && y('top') > y('jacket') && y('bottom') > y('top');
    }));
    check('there is no shoes space', await p.evaluate(()=>!document.querySelector('#hero-pop .hero-slot.shoes')));
    check('a dress takes the place of the top and bottom',
      (await dealUntil(p, ()=>heroCombo.base === 'dress')) &&
      await p.evaluate(()=>!document.querySelector('#hero-pop .hero-slot.top') && !document.querySelector('#hero-pop .hero-slot.bottom') &&
                           !!document.querySelector('#hero-pop .hero-slot.dress')));
    // a shirt over a tee: two pieces in the top space, side by side
    check('a shirt over a tee sits side by side, not on top of each other',
      (await dealUntil(p, ()=>heroCombo.base !== 'dress' && heroCombo.overtop, 400)) &&
      await p.evaluate(()=>{
        const imgs = [...document.querySelectorAll('#hero-pop .hero-slot.top img')].map(i => i.getBoundingClientRect());
        return imgs.length === 2 && imgs[0].right <= imgs[1].left + 1;
      }));
    check('and nothing is captioned', await p.evaluate(()=>!document.querySelector('#hero-pop .hero-slot .cap, .hero-caption')));

    // an optional layer the outfit doesn't have is not shown at all
    check('an empty optional space is left out',
      (await dealUntil(p, ()=>!heroCombo.jumper)) &&
      await p.evaluate(()=>!document.querySelector('#hero-pop .hero-slot.jumper')));
    await p.close();
  }

  // ---- shuffle on All deals the hero and nothing else ----
  {
    const p=await open(b);
    const grid = await gridKeys(p), seedBefore = await p.evaluate(()=>sessionSeed);
    let changed = 0;
    for(let i=0;i<5;i++){ const h = await heroKey(p); await p.click('#hero-pop-shuffle'); await p.waitForTimeout(150);
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
    await p.click('#hero-pop .hero-slot.jacket .hero-lock'); await p.waitForTimeout(500);
    check('locking a jacket pins that one piece',
      await p.evaluate(i=>outfitFilters['Jackets'].type === 'items' && outfitFilters['Jackets'].ids.join() === i, id));
    check('the outfit stays, because locking is keeping it', (await heroKey(p)) === before);
    check('and the space shows locked', await p.evaluate(()=>document.querySelector('#hero-pop .hero-slot.jacket').classList.contains('locked') &&
      document.querySelector('#hero-pop .hero-slot.jacket .hero-lock').getAttribute('aria-pressed') === 'true'));
    check('the filters button counts it', (await p.textContent('#filters-fab .filters-fab-count')).trim() === '1');

    // locking the empty jumper locks it as none
    await p.evaluate(()=>lockHeroSlot('jumper')); await p.waitForTimeout(500);
    check('locking an empty space locks it as none',
      await p.evaluate(()=>outfitFilters['Jumpers'].type === 'none'));
    check('and the count follows', (await p.textContent('#filters-fab .filters-fab-count')).trim() === '2');

    // shuffle holds what is locked
    let held = true;
    for(let i=0;i<6;i++){ await p.click('#hero-pop-shuffle'); await p.waitForTimeout(120);
      held = held && await p.evaluate(i2=>heroCombo.jacket && heroCombo.jacket.id === i2 && !heroCombo.jumper, id); }
    check('Shuffle keeps a locked jacket and a locked-none jumper', held);
    check('and the grid below follows the locks', await p.evaluate(i2=>outfitDisplayed.every(c=>c.jacket && c.jacket.id===i2 && !c.jumper), id));

    // unlocking
    await p.click('#hero-pop .hero-slot.jacket .hero-lock'); await p.waitForTimeout(500);
    check('tapping a lock again lets go of it',
      await p.evaluate(()=>outfitFilters['Jackets'].type === 'any'));
    await p.close();
  }

  // ---- tapping a space opens its filters ----
  {
    const p=await open(b);
    await dealUntil(p, ()=>heroCombo.base !== 'dress' && heroCombo.jacket);
    await p.click('#hero-pop .hero-slot.jacket .hero-slot-open'); await p.waitForTimeout(900);
    check('tapping the jacket opens Filters on Jackets',
      await p.evaluate(()=>filterSheetOpen() && filterPage === 'Jackets'));
    check('and it is the same sheet, with a Back',
      !!(await p.$('#filter-sheet-back')));
    check('and the popup is still open underneath', await p.evaluate(()=>heroPopOpen));
    await p.click('#filter-sheet-back'); await p.waitForTimeout(700);
    check('Back goes back to the popup, not the list of categories',
      await p.evaluate(()=>!filterSheetOpen() && filterPage === null && heroPopOpen &&
        document.getElementById('hero-pop-wrap').classList.contains('open')));
    await dealUntil(p, ()=>heroCombo.base !== 'dress');
    await p.click('#hero-pop .hero-slot.bottom .hero-slot-open'); await p.waitForTimeout(900);
    check('the bottom opens the category of the piece in it',
      await p.evaluate(()=>filterPage === tabForItem(heroCombo.bottom)));
    await p.click('#filter-sheet-see'); await p.waitForTimeout(700);
    check('See N outfits also returns to the popup', await p.evaluate(()=>!filterSheetOpen() && heroPopOpen));
    await p.close();
  }

  // ---- the popup itself ----
  {
    const p=await open(b, false);
    check('the page shows a preview with no live controls', await p.evaluate(()=>
      !!document.querySelector('#outfit-hero .hero-feature') &&
      !document.querySelector('#outfit-hero .hero-lock, #outfit-hero .hero-slot-open')));
    check('the popup is shut until asked for', await p.evaluate(()=>
      !heroPopOpen && !document.getElementById('hero-pop-wrap').classList.contains('open')));
    await p.click('#outfit-hero .hero-feature'); await p.waitForTimeout(500);
    check('tapping the hero opens it', await p.evaluate(()=>heroPopOpen));
    check('it has no title, subtitle or Done', await p.evaluate(()=>
      !document.querySelector('#hero-pop .hero-title, #hero-pop .hero-sub') &&
      ![...document.querySelectorAll('#hero-pop button')].some(b => b.textContent.trim() === 'Done')));
    check('it sits in the middle of the screen', await p.evaluate(()=>{
      const r = document.getElementById('hero-pop').getBoundingClientRect();
      return Math.abs((r.top + r.bottom)/2 - innerHeight/2) <= 6 && Math.abs((r.left + r.right)/2 - innerWidth/2) <= 2;
    }));
    check('and Back and Shuffle share the bar', await p.evaluate(()=>{
      const b = document.getElementById('hero-pop-back').getBoundingClientRect();
      const s2 = document.getElementById('hero-pop-shuffle').getBoundingClientRect();
      return Math.abs(b.top - s2.top) <= 2 && b.right <= s2.left;
    }));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    check('Escape puts it away', await p.evaluate(()=>!heroPopOpen));
    await p.click('#outfit-hero .hero-feature'); await p.waitForTimeout(500);
    await p.click('#hero-pop-back'); await p.waitForTimeout(500);
    check('Back closes it', await p.evaluate(()=>!heroPopOpen));
    await p.click('#outfit-hero .hero-feature'); await p.waitForTimeout(400);
    await p.mouse.click(195, 12); await p.waitForTimeout(500);
    check('tapping outside closes it', await p.evaluate(()=>!heroPopOpen));
    await p.close();
  }

  // ---- where Filters and Shuffle live ----
  {
    const p=await open(b, false);
    check('on All Shuffle floats at the bottom and deals the card in place', await p.evaluate(()=>
      getComputedStyle(document.getElementById('shuffle-fab')).display !== 'none'));
    {
      const before = await heroKey(p);
      await p.click('#shuffle-fab'); await p.waitForTimeout(500);
      check('tapping it deals a new hero without opening the popup',
        (await heroKey(p)) !== before && await p.evaluate(()=>!heroPopOpen));
    }
    check('the outfit card on the page is larger than the grid cards', await p.evaluate(()=>{
      const a = document.querySelector('#outfit-hero .outfit-card').getBoundingClientRect();
      const g = document.querySelector('#outfit-gallery .outfit-card').getBoundingClientRect();
      return a.width > g.width + 20;
    }));
    check('the popup keeps one height and Back and Shuffle stay put through a deal', await p.evaluate(()=>{
      openHeroPopup();
      return true;
    }) && await (async()=>{
      await p.waitForTimeout(500);
      const m = () => p.evaluate(()=>{
        const r = document.getElementById('hero-pop').getBoundingClientRect();
        const s = document.getElementById('hero-pop-shuffle').getBoundingClientRect();
        return [r.height, s.top].map(Math.round).join(',');
      });
      const seen = new Set([await m()]);
      for(let i=0;i<25;i++){ await p.click('#hero-pop-shuffle'); await p.waitForTimeout(60); seen.add(await m()); }
      const same = seen.size === 1;
      await p.evaluate(()=>closeHeroPopup()); await p.waitForTimeout(500);
      return same;
    })());
    // Filters stays in view with focus on it while its sheet is up, so keys
    // that scroll must not move the page behind.
    await p.click('#filters-fab'); await p.waitForTimeout(700);
    const y0 = await p.evaluate(()=>Math.round(scrollY));
    await p.keyboard.press('PageDown'); await p.waitForTimeout(300);
    check('with Filters focused and its sheet up, PageDown leaves the page where it is',
      (await p.evaluate(()=>Math.round(scrollY))) === y0);
    await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    await toFaves(p, 1100);
    check('on Faves Filters floats too', await p.evaluate(()=>{
      const f = document.getElementById('filters-fab');
      return f.parentElement.id === 'float-row';
    }));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
