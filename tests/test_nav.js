// Navigation: three destinations, no sub-tabs, archive demoted to a link.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
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

const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// The wardrobe stopped printing a count, so count what it actually drew.
const shown = p => p.evaluate(() =>
  document.getElementById('gallery').style.display === 'none'
    ? document.querySelectorAll('#name-list .name-row').length
    : document.querySelectorAll('#gallery .tile').length);

const vis=(p,s)=>p.isVisible(s);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify({seed_22:['sporty']})};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);

  check('bottom bar hidden behind the password screen', !(await vis(p,'#bottom-bar')));
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(500);

  // --- one navigation surface ---
  check('bottom bar visible once signed in', await vis(p,'#bottom-bar'));
  // Three now: what you kept is a state of Outfits rather than a place of
  // its own, and it is reached by the switch inside that destination.
  check('three destinations, all of them visible',
    await p.evaluate(()=>{
      const btns=Array.from(document.querySelectorAll('#bottom-bar .bottom-btn'));
      return btns.length===3 && btns.every(x=>x.offsetParent !== null);
    }),
    await p.evaluate(()=>Array.from(document.querySelectorAll('#bottom-bar .bottom-btn'))
      .map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | ')));
  check('no sub-tabs anywhere',
    await p.evaluate(()=>document.querySelectorAll('.subtabs, .subtab').length)===0);

  // --- wardrobe ---
  check('opens on the wardrobe', await vis(p,'#inventory-view'));
  check('items listed', (await shown(p)) === 80);
  // The wardrobe has no inline filter mount — only Outfits and Saved do —
  // so the category row is all that sits above its grid.
  check('the category row is the only thing above the grid',
    await vis(p,'#tabs') &&
    await p.evaluate(()=>!document.querySelector('#inventory-view [data-filter-ns]')));
  // The wardrobe has no filters of any kind: its category tabs and its
  // search do that work, and a tag filter over a grid of pieces was a third
  // way of doing the same thing.
  check('no Filters pill on the wardrobe', !(await vis(p,'#filters-fab')));
  check('and the panel has nothing to offer there',
    await p.evaluate(()=>!filterSheetHasContent() && !filterSheetOpen()));

  // --- archive is a link, not a destination ---
  check('archive link stays out of the way when nothing is archived',
    !(await vis(p,'#archive-link')));

  await p.evaluate(async ()=>{ await archiveItems([ITEMS[0].id]); render(); });
  await p.waitForTimeout(400);
  check('archive link appears once something is archived, with a count',
    await vis(p,'#archive-link') && (await p.textContent('#archive-link')).includes('Archive (1)'),
    (await p.textContent('#archive-link')).trim());

  await p.click('#archive-link'); await p.waitForTimeout(400);
  check('archive opens as its own view', await vis(p,'#archive-view') && !(await vis(p,'#inventory-view')));
  check('wardrobe stays highlighted while in the archive',
    await p.evaluate(()=>document.getElementById('nav-inventory-btn').classList.contains('active')));
  check('the Filters pill steps aside where there is nothing to filter',
    !(await vis(p,'#filters-fab')));
  await p.click('.back-link'); await p.waitForTimeout(400);
  check('back link returns to the wardrobe', await vis(p,'#inventory-view'));

  // --- outfits: the filters dock themselves, and collapse into the pill ---
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
  check('outfits visible', await vis(p,'#outfits-view'));
  const sheetOpen = ()=>p.evaluate(()=>filterSheetOpen());
  check('the filter panel opens itself on arrival', await sheetOpen());
  check('shape is the categories themselves, not a chip of its own',
    await p.evaluate(()=>{
      const labels=Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
        .map(e=>e.childNodes[0].textContent.trim());
      // The ones you own something in lead; empty ones wait at the end.
      return labels.slice(0,3).every(t => itemsInTab(t).length > 0)
        && labels.every(t => OUTFIT_TABS.includes(t))
        && !labels.includes('Shape')
        && !document.getElementById('base-topbottom-btn');
    }),
    (await p.evaluate(()=>Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
      .map(e=>e.childNodes[0].textContent.trim()).join(', '))));
  check('outfits generated', (await p.evaluate(()=>outfitDisplayed.length)) > 0,
    String(await p.evaluate(()=>outfitDisplayed.length)));
  check('and the page does not print a combination count at all',
    await p.evaluate(()=>!document.getElementById('outfit-count-line')));

  // The page names itself, leads with a single outfit, and the controls are
  // waiting at the bottom without being asked for.
  const top = await p.evaluate(()=>{
    const head = document.querySelector('#outfits-view .page-head');
    const hero = document.querySelector('#outfit-hero .outfit-card');
    const sheet = document.getElementById('filter-sheet');
    const nav = document.getElementById('bottom-bar');
    const grid = document.getElementById('sheet-filter-grid');
    return {
      title: head ? head.querySelector('h1').textContent.trim() : null,
      headBottom: head ? Math.round(head.getBoundingClientRect().bottom) : null,
      heroY: hero ? Math.round(hero.getBoundingClientRect().top) : null,
      sheetTop: Math.round(sheet.getBoundingClientRect().top),
      sheetBottom: Math.round(sheet.getBoundingClientRect().bottom),
      sheetZ: Number(getComputedStyle(sheet).zIndex),
      navZ: Number(getComputedStyle(nav).zIndex),
      gridBottom: Math.round(grid.getBoundingClientRect().bottom),
      navTop: Math.round(nav.getBoundingClientRect().top),
      fold: window.innerHeight,
    };
  });
  check('the page opens with its own title', top.title === 'Outfits', String(top.title));
  check('a featured outfit leads the content, under the title',
    top.heroY !== null && top.heroY >= top.headBottom && top.heroY < top.sheetTop,
    `head ends ${top.headBottom}, hero at ${top.heroY}, panel starts ${top.sheetTop}`);
  check('the panel is docked to the foot of the screen',
    top.sheetBottom >= top.fold - 1 && top.sheetTop > top.fold / 2,
    `${top.sheetTop}–${top.sheetBottom} of ${top.fold}`);
  check('it sits behind the nav bar rather than over it',
    top.sheetZ < top.navZ, `panel z${top.sheetZ}, nav z${top.navZ}`);
  check('and its own controls stay clear of the bar',
    top.gridBottom <= top.navTop, `controls end ${top.gridBottom}, bar starts ${top.navTop}`);
  check('both tags and piece filters are there',
    await vis(p,'#sheet-tag-chips') && await vis(p,'#sheet-filter-grid'));
  check('so the pill stays out of the way', !(await vis(p,'#filters-fab')));

  // Filtering straight from the docked panel.
  await p.click('#sheet-tag-chips .tag-chip:has-text("sporty")'); await p.waitForTimeout(800);
  check('tapping a tag in the panel filters the results',
    (await p.evaluate(()=>outfitTags)).join()==='sporty');

  // The page can still be scrolled clear of the panel — the last row is not
  // stranded underneath it.
  const clears = await p.evaluate(async()=>{
    window.scrollTo({top:document.body.scrollHeight});
    await new Promise(r=>setTimeout(r,400));
    const cards=document.querySelectorAll('#outfit-gallery .outfit-card');
    const last=cards[cards.length-1].getBoundingClientRect();
    const sheet=document.getElementById('filter-sheet').getBoundingClientRect();
    return {lastBottom:Math.round(last.bottom), sheetTop:Math.round(sheet.top)};
  });
  check('the last outfit can be scrolled out from under the panel',
    clears.lastBottom <= clears.sheetTop,
    `last card ends ${clears.lastBottom}, panel starts ${clears.sheetTop}`);
  // A wheel rather than window.scrollTo: the app asks whether a finger, a
  // wheel or a key did the scrolling, because the page also moves for
  // reasons that are not you.
  await p.mouse.move(195, 400);
  await p.mouse.wheel(0, -900);
  await p.waitForTimeout(600);
  // That scroll put the panel away by itself, which is what a scroll is for
  // now. Bring it back before testing the way it is put away by hand.
  check('scrolling the page had already closed it', !(await sheetOpen()));
  await p.click('#filters-fab'); await p.waitForTimeout(500);

  // Collapsing it, and getting it back.
  await p.click('#filter-sheet-collapse'); await p.waitForTimeout(450);
  check('the collapse button puts the panel away', !(await sheetOpen()));
  check('the pill takes its place', await vis(p,'#filters-fab'));
  check('and it carries the active count',
    (await p.textContent('#filters-fab')).includes('1'), (await p.textContent('#filters-fab')).trim());
  check('the page stops reserving room for it',
    (await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--sheet-inset').trim())) === '0px');

  await p.click('#filters-fab'); await p.waitForTimeout(450);
  check('the pill brings it back', await sheetOpen());
  check('with the same state it had', await p.evaluate(()=>Boolean(document.querySelector('#sheet-tag-chips .tag-chip.active'))));
  check('and the pill stands down again', !(await vis(p,'#filters-fab')));

  // --- saved is its own destination ---
  await toFaves(p, 500);
  check('saved is one tap from anywhere', await vis(p,'#saved-view') && !(await vis(p,'#outfits-view')));
  check('the faves page renders its contents', await p.evaluate(()=>{
    const cards = document.querySelectorAll('#saved-gallery .outfit-card').length;
    const empty = document.getElementById('saved-empty');
    return cards > 0 || (empty.offsetParent !== null &&
      document.getElementById('saved-empty-title').textContent.trim().length > 0);
  }));
  check('faves arrives with its filters down too', await sheetOpen());

  // And the panel is not left filtering a page you have walked away from.
  await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
  check('capsules has nothing to filter, so the panel goes away', !(await sheetOpen()));
  check('and no pill is offered there', !(await vis(p,'#filters-fab')));

  // --- deep link ---
  await p.click('#nav-inventory-btn'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ const t=ITEMS.find(i=>tabForItem(i)==='Tops'); findOutfitsWithPiece(t.id); });
  await p.waitForTimeout(800);
  check('"Outfits with this piece" lands on Outfits',
    await vis(p,'#outfits-view') &&
    // The destination is lit, and the switch inside it is on All.
    await p.evaluate(()=>{
      const dest = document.querySelector('#bottom-bar .bottom-btn.nav-switch');
      const all = document.getElementById('nav-outfits-btn');
      return Boolean(dest) && dest.classList.contains('active') && all.classList.contains('on');
    }));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
