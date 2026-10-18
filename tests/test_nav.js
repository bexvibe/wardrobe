// Navigation: three destinations, no sub-tabs, archive demoted to a link.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');

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
  check('items listed', (await shown(p)) === 83);
  // The wardrobe has no inline filter mount — only Outfits and Saved do —
  // so the category row is all that sits above its grid.
  check('the category row is the only thing above the grid',
    await vis(p,'#tabs') &&
    await p.evaluate(()=>!document.querySelector('#inventory-view [data-filter-ns]')));
  // The wardrobe has no filters of any kind: its category tabs and its
  // search do that work, and a tag filter over a grid of pieces was a third
  // way of doing the same thing.
  check('no Filters pill on the wardrobe', !(await vis(p,'#filters-fab')));
  check('and the sheet has nothing to offer there',
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

  // --- outfits: the filters are a sheet the pill raises ---
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
  check('outfits visible', await vis(p,'#outfits-view'));
  const sheetOpen = ()=>p.evaluate(()=>filterSheetOpen());
  check('the filter sheet stays down on arrival', !(await sheetOpen()));
  check('the pill is there, and says Filters',
    (await vis(p,'#filters-fab')) &&
    (await p.textContent('#filters-fab')).replace(/\s+/g,' ').trim() === 'Filters',
    (await p.textContent('#filters-fab')).trim());
  check('with no arrow on it to say which way it goes',
    await p.evaluate(()=>!document.querySelector('.filters-fab-chevron')));
  await p.click('#filters-fab'); await p.waitForTimeout(600);
  check('the pill raises it', await sheetOpen());
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

  // The page names itself and leads with a single outfit; the sheet is a
  // bottom sheet over the page, nav and pill included.
  const top = await p.evaluate(()=>{
    const head = document.querySelector('#outfits-view .page-head');
    const hero = document.querySelector('#outfit-hero .outfit-card');
    const sheet = document.getElementById('filter-sheet');
    const nav = document.getElementById('bottom-bar');
    const grid = document.getElementById('sheet-filter-grid');
    const row = document.getElementById('float-row');
    const stack = el => {
      for(let n = el; n; n = n.parentElement){
        const z = getComputedStyle(n).zIndex;
        if(z !== 'auto') return Number(z);
      }
      return 0;
    };
    const sr = sheet.getBoundingClientRect();
    const cs = getComputedStyle(sheet);
    return {
      title: head ? head.querySelector('h1').textContent.trim() : null,
      headBottom: head ? Math.round(head.getBoundingClientRect().bottom) : null,
      heroY: hero ? Math.round(hero.getBoundingClientRect().top) : null,
      sheetTop: Math.round(sr.top), sheetBottom: Math.round(sr.bottom),
      sheetLeft: Math.round(sr.left), sheetRight: Math.round(sr.right),
      sheetZ: stack(sheet), navZ: stack(nav), rowZ: stack(row),
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius,
               cs.borderBottomLeftRadius, cs.borderBottomRightRadius],
      gridTop: Math.round(grid.getBoundingClientRect().top),
      gridBottom: Math.round(grid.getBoundingClientRect().bottom),
      navTop: Math.round(nav.getBoundingClientRect().top),
      rowTop: Math.round(row.getBoundingClientRect().top),
      fold: window.innerHeight, width: window.innerWidth,
    };
  });
  check('the page opens with its own title', top.title === 'Outfits', String(top.title));
  check('a featured outfit leads the content, under the title',
    top.heroY !== null && top.heroY >= top.headBottom && top.heroY < top.fold,
    `head ends ${top.headBottom}, hero at ${top.heroY}`);
  check('the sheet is anchored to the bottom edge, full width',
    top.sheetBottom === top.fold && top.sheetLeft === 0 && top.sheetRight === top.width,
    `${top.sheetLeft}-${top.sheetRight} x ${top.sheetTop}-${top.sheetBottom} of ${top.width}x${top.fold}`);
  check('no taller than 92% of the screen',
    top.sheetTop >= top.fold * 0.08 - 1, `starts at ${top.sheetTop} of ${top.fold}`);
  check('rounded on top only',
    top.radius[0] !== '0px' && top.radius[1] !== '0px' &&
    top.radius[2] === '0px' && top.radius[3] === '0px', top.radius.join(' '));
  check('it covers the buttons that raised it and the nav bar',
    top.sheetTop < top.rowTop && top.sheetTop < top.navTop &&
    top.sheetZ > top.navZ && top.sheetZ > top.rowZ,
    `sheet z${top.sheetZ} from ${top.sheetTop}, nav z${top.navZ} at ${top.navTop}, row z${top.rowZ}`);
  check('and the pill has eased away behind it',
    await p.evaluate(()=>document.getElementById('float-row').classList.contains('away') &&
      getComputedStyle(document.getElementById('float-row')).visibility === 'hidden'));
  check('its own controls sit inside it, clear of the bottom edge',
    top.gridTop > top.sheetTop && top.gridBottom < top.fold,
    `controls ${top.gridTop}-${top.gridBottom}, sheet starts ${top.sheetTop}`);
  check('both tags and piece filters are there',
    await vis(p,'#sheet-tag-chips') && await vis(p,'#sheet-filter-grid'));

  // Filtering straight from the sheet.
  await p.click('#sheet-tag-chips .tag-chip:has-text("sporty")'); await p.waitForTimeout(800);
  check('tapping a tag in the sheet filters the results',
    (await p.evaluate(()=>outfitTags)).join()==='sporty');

  // A wheel rather than window.scrollTo: the app asks whether a finger, a
  // wheel or a key did the scrolling, because the page also moves for
  // reasons that are not you.
  const y0 = await p.evaluate(()=>Math.round(scrollY));
  await p.mouse.move(195, 100);
  await p.mouse.wheel(0, 900);
  await p.waitForTimeout(600);
  check('scrolling the page behind the sheet does not move it',
    (await p.evaluate(()=>Math.round(scrollY))) === y0, `${y0} -> ${await p.evaluate(()=>Math.round(scrollY))}`);
  check('and leaves the sheet up', await sheetOpen());

  // Putting it away, and getting it back.
  await p.click('#filter-sheet-see'); await p.waitForTimeout(600);
  check('the foot button puts the sheet away', !(await sheetOpen()));
  check('the pill takes its place', await vis(p,'#filters-fab'));
  check('and it carries the active count',
    (await p.textContent('#filters-fab')).includes('1'), (await p.textContent('#filters-fab')).trim());

  // With nothing over it, the last outfit can be scrolled clear of the nav.
  const clears = await p.evaluate(async()=>{
    // Several times: reaching the bottom loads the next page when there is
    // one, and it is the bottom of the longer page that is being asked about.
    for(let i = 0; i < 3; i++){
      window.scrollTo({top:document.body.scrollHeight});
      await new Promise(r=>setTimeout(r,400));
    }
    const cards=document.querySelectorAll('#outfit-gallery .outfit-card');
    const last=cards[cards.length-1].getBoundingClientRect();
    const nav=document.getElementById('bottom-bar').getBoundingClientRect();
    return {lastBottom:Math.round(last.bottom), navTop:Math.round(nav.top)};
  });
  check('the last outfit can be scrolled out from under the nav',
    clears.lastBottom <= clears.navTop,
    `last card ends ${clears.lastBottom}, nav starts ${clears.navTop}`);

  await p.click('#filters-fab'); await p.waitForTimeout(600);
  check('the pill brings it back', await sheetOpen());
  check('with the same state it had', await p.evaluate(()=>Boolean(document.querySelector('#sheet-tag-chips .tag-chip.active'))));
  check('and tapping the dimmed page puts it away', await (async()=>{
    await p.mouse.click(195, 30); await p.waitForTimeout(600);
    return !(await sheetOpen()) &&
      await p.evaluate(()=>!document.getElementById('float-row').classList.contains('away'));
  })());

  // --- saved is its own destination ---
  await toFaves(p, 500);
  check('saved is one tap from anywhere', await vis(p,'#saved-view') && !(await vis(p,'#outfits-view')));
  check('the faves page renders its contents', await p.evaluate(()=>{
    const cards = document.querySelectorAll('#saved-gallery .outfit-card').length;
    const empty = document.getElementById('saved-empty');
    return cards > 0 || (empty.offsetParent !== null &&
      document.getElementById('saved-empty-title').textContent.trim().length > 0);
  }));
  check('faves arrives with its filters down too', !(await sheetOpen()));

  // And the sheet is not left filtering a page you have walked away from.
  await p.click('#filters-fab'); await p.waitForTimeout(500);
  check('(the sheet is up on Faves)', await sheetOpen());
  // The sheet covers the bar, so this goes by the programmatic route.
  await p.evaluate(()=>document.getElementById('nav-capsules-btn').click());
  await p.waitForTimeout(500);
  check('capsules has nothing to filter, so the sheet goes away', !(await sheetOpen()));
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
