// The Filters sheet says whether a filter is on, and how much, without a
// wall of chips. Each row shows its value ("Any" when off). Whatever is on is
// also a removable chip at the top. Nothing prints "2 selected", and the
// chips carry no count badge: a row's value names the piece, or says
// "Tops (2)".
// And every one of them — rows, chips, Clear all, the pill, the category
// page's Clear and the foot's buttons — is a full thumb's worth of target.
const { chromium } = require('playwright');
const { toFaves, leaveSheet, openFilterSection, openFilterCategory, filterBack } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const TAGS = {seed_1:['summer','linen'], seed_2:['summer'], seed_3:['winter']};
// A handful of tags, so the Tags page has something to list.
['evening','work','holiday','wool','smart','casual','denim','knit']
  .forEach((t,i)=>{ TAGS['seed_'+(10+i)] = [t]; });

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;`+
         `window.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
  return p;
}

// The sheet never opens itself: the pill raises it.
async function openSheet(p){
  if(!(await p.evaluate(()=>filterSheetOpen()))){
    await p.click('#filters-fab'); await p.waitForTimeout(500);
  }
}

const txt = (p, sel) => p.evaluate(x=>[...document.querySelectorAll(x)].map(e=>e.textContent.replace(/\s+/g,' ').trim()), sel);
const rowValue = (p, section) => p.evaluate(sec=>{
  const el = document.querySelector(`#filter-sheet [data-filter-row="${sec}"] .capsule-pick-value`);
  return el ? el.textContent.trim() : null;
}, section);
const activeChips = p => p.evaluate(()=>Array.from(document.querySelectorAll('#filter-sheet .filter-active .filter-chip'))
  .map(e=>({label:e.textContent.replace(/\s*✕\s*$/,'').trim(), said:e.getAttribute('aria-label'), h:Math.round(e.getBoundingClientRect().height)})));
// One category row on the Pieces list, read the way you read it on screen.
const catRow = (p, cat) => p.evaluate(c=>{
  const el = document.querySelector(`#filter-sheet [data-filter-cat="${c}"]`);
  if(!el) return null;
  return {value: el.querySelector('.capsule-pick-value').textContent.trim(),
          on: el.querySelector('.capsule-pick-value').classList.contains('on'),
          h: Math.round(el.getBoundingClientRect().height)};
}, cat);
// Sheet up, on its main rows.
async function mainRows(p){
  await openSheet(p);
  if(await p.$('#filter-sheet-back')){
    while(await p.$('#filter-sheet-back')) await filterBack(p);
  }
}

// Through the category page, the way she would: open it, Clear in the head,
// Back to the category list. The sheet is left open on that list.
async function clearSlot(p, key){
  await openSheet(p);
  await p.evaluate(k => openFilterPage(k), key);
  await p.waitForTimeout(450);
  await p.click(`#filter-sheet-clear`);
  await p.waitForTimeout(250);
  await p.click('#filter-sheet-back');
  await p.waitForTimeout(500);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Nothing set: every row says Any, no chips on top ----
  {
    const p=await open(b);
    await openSheet(p);
    const vals = await txt(p, '#filter-sheet [data-filter-row] .capsule-pick-value');
    check('every row starts on Any', vals.length>=2 && vals.every(v=>v==='Any'), vals.join(' | '));
    check('and no chip is on at the top', (await activeChips(p)).length===0);
    check('and no chip carries a count badge',
      (await p.locator('#filter-sheet .chip-count').count())===0);
    check('nor a caret',
      (await p.locator('#filter-sheet .chip-caret').count())===0);
    check('nor "selected"',
      !(await p.evaluate(()=>/selected/i.test(
        document.getElementById('filter-sheet').innerText))));
    await openFilterSection(p, 'pieces');
    const cats = await txt(p, '#filter-sheet [data-filter-cat] .capsule-pick-value');
    check('and every category row says Any too', cats.length>=3 && cats.every(v=>v==='Any'), cats.join(' | '));
    await p.close();
  }

  // ---- 2. Pinning pieces: the row says how many, the chip says so too ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,3).map(i=>i.id)};
      renderFilterControls(); renderFiltersFab();
    });
    await p.waitForTimeout(400);
    await openSheet(p);
    check('the Pieces row carries the count in words that name it',
      (await rowValue(p,'pieces'))==='Tops (3)', await rowValue(p,'pieces'));
    const chips = await activeChips(p);
    const pinned = await p.evaluate(()=>itemsInTab('Tops').slice(0,3).map(i=>i.name));
    check('and each piece is a removable chip at the top, by name, with no badge',
      chips.length===3 && chips.map(c=>c.label).join()===pinned.join() && !chips.some(c=>/selected/i.test(c.label)),
      JSON.stringify(chips));
    check('each says what tapping it does, to a screen reader too',
      chips.every((c,i)=>/^Remove/.test(c.said) && c.said.includes(pinned[i])), chips.map(c=>c.said).join(' | '));
    await openFilterSection(p, 'pieces');
    const c = await catRow(p, 'Tops');
    check('the category row carries the count as its value', c.value==='Tops (3)' && c.on, JSON.stringify(c));
    check('and the value follows the number pinned', await (async()=>{
      await p.evaluate(()=>{
        outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,1).map(i=>i.id)};
        renderFilterControls();
      });
      await p.waitForTimeout(300);
      return (await catRow(p,'Tops')).value === await p.evaluate(()=>itemsInTab('Tops')[0].name);
    })());
    check('and one that is off says Any', (await catRow(p, 'Dresses')).value==='Any' && !(await catRow(p,'Dresses')).on);
    await p.close();
  }

  // ---- 3. Any is the way back ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      outfitFilters['Dresses'] = {type:'items', ids:itemsInTab('Dresses').slice(0,2).map(i=>i.id)};
      renderFilterControls();
      resetOutfitResults();   // the rows redraw on their own; the stream does not
    });
    await p.waitForTimeout(900);
    await openSheet(p);
    await openFilterSection(p, 'pieces');
    const on = await catRow(p, 'Dresses');
    check('a narrowed category is marked and counted', on.on && on.value === 'Dresses (2)',
      JSON.stringify(on));
    check('and pinning a dress is what asks for a dress outfit',
      await p.evaluate(()=>outfitDisplayed.length > 0 &&
        outfitDisplayed.every(o => o.base === 'dress')));

    await clearSlot(p, 'Dresses');
    const off = await catRow(p, 'Dresses');
    check('Any returns it to a plain row with no count',
      !off.on && off.value === 'Any', JSON.stringify(off));
    await p.close();
  }

  // ---- 4. Clear all puts the whole list back ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,2).map(i=>i.id)};
      outfitFilters['Jackets'] = {type:'items', ids:itemsInTab('Jackets').slice(0,1).map(i=>i.id)};
      renderFilterControls(); renderFiltersFab();
    });
    await p.waitForTimeout(400);
    await openSheet(p);
    check('three chips are on at the top: two tops and a jacket', (await activeChips(p)).length===3);
    await p.click('#filter-sheet-clear'); await p.waitForTimeout(700);
    check('and Clear all leaves nothing on or chipped',
      (await activeChips(p)).length===0 &&
      (await txt(p, '#filter-sheet [data-filter-row] .capsule-pick-value')).every(v=>v==='Any'));
    await p.close();
  }

  // ---- 5. Every target in the sheet is 44px ----
  {
    const p=await open(b);
    // Clear all only shows once there is something to clear.
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,2).map(i=>i.id)};
      renderFilterControls(); renderFiltersFab();
    });
    await p.waitForTimeout(400);
    await openSheet(p);
    const sizes = await p.evaluate(()=>{
      const h = el => el ? Math.round(el.getBoundingClientRect().height) : null;
      return {
        rows: Array.from(document.querySelectorAll('#filter-sheet [data-filter-row]')).map(h),
        chips: Array.from(document.querySelectorAll('#filter-sheet .filter-active .filter-chip')).map(h),
        clear: h(document.getElementById('filter-sheet-clear')),
        see: h(document.getElementById('filter-sheet-see')),
      };
    });
    check('every row is at least 44px tall',
      sizes.rows.length > 0 && sizes.rows.every(n=>n>=44), JSON.stringify(sizes.rows));
    check('every chip on top too',
      sizes.chips.length > 0 && sizes.chips.every(n=>n>=44), JSON.stringify(sizes.chips));
    check('Clear all is not a 21px sliver', sizes.clear>=44, String(sizes.clear));
    check('and neither is the count at the foot', sizes.see>=44, String(sizes.see));

    // The head is the 44px of its Clear and no more, so the rows are not
    // pushed down the screen.
    const head = await p.evaluate(()=>
      Math.round(document.querySelector('.filter-sheet-head').getBoundingClientRect().height));
    check('and the head is no taller than the Clear it holds', head <= 48, `${head}px`);

    // The Tags page: tick rows.
    await openFilterSection(p, 'tags');
    const ticks = await p.evaluate(()=>Array.from(document.querySelectorAll('#filter-section-list .capsule-pick'))
      .map(e=>Math.round(e.getBoundingClientRect().height)));
    check('every tag row is at least 44px too', ticks.length>0 && ticks.every(n=>n>=44), JSON.stringify(ticks));
    await filterBack(p);

    // The category list.
    await openFilterSection(p, 'pieces');
    const cats = await p.evaluate(()=>Array.from(document.querySelectorAll('#filter-sheet [data-filter-cat]'))
      .map(e=>Math.round(e.getBoundingClientRect().height)));
    check('and every category row', cats.length>0 && cats.every(n=>n>=44), JSON.stringify(cats));
    await leaveSheet(p, {settle:600});
    // (Measured with the sheet down: while it is up the pill eases away
    // behind it.)
    const fab = await p.evaluate(()=>{
      const r = document.getElementById('filters-fab').getBoundingClientRect();
      return {h:Math.round(r.height), w:Math.round(r.width)};
    });
    check('the pill that raises the sheet is a full target', fab.h>=44 && fab.w>=44, JSON.stringify(fab));
    await p.click('#filters-fab'); await p.waitForTimeout(500);

    await openFilterCategory(p, 'Tops');
    const page = await p.evaluate(()=>{
      const h = id => Math.round(document.getElementById(id).getBoundingClientRect().height);
      return {clear:h('filter-sheet-clear'), back:h('filter-sheet-back'), search:h('filter-sheet-search'),
              head:Math.round(document.querySelector('.filter-sheet-head').getBoundingClientRect().height)};
    });
    check('on a category page Clear, Back and the search pill are 44px as well',
      page.clear>=44 && page.back>=44 && page.search>=44, JSON.stringify(page));
    await p.close();
  }

  // ---- 6. Faves reads the same way ----
  {
    const p=await open(b);
    await toFaves(p, 1200);
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,4).map(i=>i.id)};
      renderFilterControls(); renderFiltersFab();
    });
    await p.waitForTimeout(400);
    await openSheet(p);
    const row = await p.evaluate(()=>{
      const el = document.querySelector('#filter-sheet [data-filter-row="pieces"]');
      return {value: el.querySelector('.capsule-pick-value').textContent.trim(),
              h: Math.round(el.getBoundingClientRect().height)};
    });
    check('the same row, the same count, on Faves',
      row.value==='Tops (4)' && row.h>=44, JSON.stringify(row));
    check('and the same four chips at the top', (await activeChips(p)).length===4);
    check('and no "selected" there either',
      !(await p.evaluate(()=>/selected/i.test(
        document.getElementById('filter-sheet').innerText))));
    await p.close();
  }

  // ---- 7. Fully round, like every other chip in the app ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,2).map(i=>i.id)};
      renderFilterControls(); renderFiltersFab();
    });
    await openSheet(p);
    const radii = await p.evaluate(()=>{
      const r = el => el ? getComputedStyle(el).borderTopLeftRadius : null;
      return {
        chip: r(document.querySelector('#filter-sheet .filter-active .filter-chip')),
        // The shapes it is meant to match.
        wardrobeTab: r(document.querySelector('#tabs .tab')),
        navBtn: r(document.querySelector('.bottom-btn')),
        fab: r(document.getElementById('filters-fab')),
      };
    });
    const round = v => parseFloat(v) >= 22;   // half of a 44px chip
    check('a chip on top is fully round', round(radii.chip), radii.chip);
    check('the same corner the wardrobe tabs, the nav and the pill use',
      round(radii.wardrobeTab) && round(radii.navBtn) && round(radii.fab),
      JSON.stringify(radii));
    await p.close();
  }

  // ---- 8. A sheet that is down is out of reach ----
  {
    const p=await open(b);
    // It never opens itself, so it is already down on arrival.
    check('the sheet does not open itself on arrival', !(await p.evaluate(()=>filterSheetOpen())));

    check('the closed sheet is inert',
      await p.evaluate(()=>document.getElementById('filter-sheet').hasAttribute('inert')));
    check('and inert is a thing this browser honours',
      await p.evaluate(()=>'inert' in HTMLElement.prototype));

    // Tab all the way round the page: nothing inside the sheet is a stop.
    const landed = [];
    for(let i=0;i<25;i++){
      await p.keyboard.press('Tab');
      landed.push(await p.evaluate(()=>{
        const a = document.activeElement;
        if(!a || a === document.body) return 'body';
        return document.getElementById('filter-sheet').contains(a)
          ? 'IN THE SHEET: ' + (a.id || a.className) : (a.id || a.tagName);
      }));
    }
    check('no tab stop lands inside it', !landed.some(l=>l.startsWith('IN THE SHEET')),
      landed.filter(l=>l.startsWith('IN THE SHEET')).join(', ') || landed.slice(0,6).join(', '));
    // The pill is the one control near the sheet that must stay reachable.
    check('the pill that opens it is still reachable',
      await p.evaluate(()=>{
        const fab = document.getElementById('filters-fab');
        fab.focus();
        return document.activeElement === fab && !fab.hasAttribute('inert');
      }));

    // Open it and the whole sheet is back in reach.
    await p.click('#filters-fab'); await p.waitForTimeout(600);
    check('opening it hands it back',
      !(await p.evaluate(()=>document.getElementById('filter-sheet').hasAttribute('inert'))));
    check('and its controls take focus again',
      await p.evaluate(()=>{
        const c = document.querySelector('#filter-sheet [data-filter-row]');
        c.focus();
        return document.activeElement === c;
      }));

    // Closing while focus is in there does not strand it off-screen.
    await p.evaluate(()=>{ document.querySelector('#filter-sheet [data-filter-row]').focus();
                           closeFilterSheet(); });
    await p.waitForTimeout(500);
    check('closing with focus inside hands it to the pill, not into the dark',
      await p.evaluate(()=>{
        const a = document.activeElement;
        return !document.getElementById('filter-sheet').contains(a) &&
               a.id === 'filters-fab';
      }),
      await p.evaluate(()=>document.activeElement.id || document.activeElement.tagName));
    await p.close();
  }

  // ---- 12. The rows say what is on ----
  {
    const p=await open(b);
    // The value on a row stands where the count in the heading used to:
    // nothing on is "Any", and what is on is named.
    const rows = async () => { await mainRows(p); return {
      tags: await rowValue(p,'tags'), pieces: await rowValue(p,'pieces') }; };

    const rest = await rows();
    check('nothing on means the row says Any', rest.tags === 'Any', rest.tags);
    check('and so is the other one', rest.pieces === 'Any', rest.pieces);

    await p.evaluate(()=>{ outfitTags = ['summer']; renderFilterControls(); });
    await p.waitForTimeout(400);
    check('one tag makes the row say it', (await rows()).tags === 'summer', (await rows()).tags);
    check('and leaves Pieces alone', (await rows()).pieces === 'Any');

    await p.evaluate(()=>{ outfitTags = ['summer','linen']; renderFilterControls(); });
    await p.waitForTimeout(400);
    check('two tags reads both', (await rows()).tags === 'summer, linen', (await rows()).tags);

    const expect = await p.evaluate(()=>{
      const tabs = filterTabs();
      outfitFilters[tabs[0]] = {type:'items', ids: itemsInTab(tabs[0]).slice(0,3).map(i=>i.id)};
      outfitFilters[tabs[1]] = {type:'items', ids: itemsInTab(tabs[1]).slice(0,1).map(i=>i.id)};
      renderFilterControls();
      return [slotSummary(tabs[0]), slotSummary(tabs[1])];
    });
    await p.waitForTimeout(400);
    // Two categories narrowed, whatever number of pieces is pinned inside
    // them — the row names each.
    check('Pieces names the categories narrowed, not every piece pinned',
      (await rows()).pieces === expect.join(', '), `${(await rows()).pieces} vs ${expect.join(', ')}`);

    // The point of it: it says so even when what is on is long.
    check('and the value is in view, inside the sheet',
      await p.evaluate(()=>{
        const v = document.querySelector('#filter-sheet [data-filter-row="pieces"] .capsule-pick-value').getBoundingClientRect();
        const sheet = document.getElementById('filter-sheet').getBoundingClientRect();
        return v.left >= sheet.left && v.right <= sheet.right;
      }));

    await p.click('#filter-sheet-clear'); await p.waitForTimeout(700);
    const after = await rows();
    check('Clear all takes both away',
      after.tags === 'Any' && after.pieces === 'Any', JSON.stringify(after));
    await p.close();
  }

  // ---- 13. One value, over both halves of the switch ----
  {
    const p=await open(b);
    await p.evaluate(()=>{ outfitTags = ['summer','linen']; renderFilterControls(); renderFiltersFab(); });
    await p.waitForTimeout(400);
    const value = async () => { await mainRows(p); const v = await rowValue(p,'tags'); await leaveSheet(p); return v; };
    check('two tags on, two named', (await value()) === 'summer, linen', await value());

    await toFaves(p, 1100);
    check('and still the same after the switch', (await value()) === 'summer, linen', await value());

    // Dropping one from this side drops it for both, because there is only
    // one of it.
    await p.evaluate(()=>{ outfitTags = ['summer']; renderFilterControls(); renderFiltersFab(); });
    await p.waitForTimeout(400);
    check('dropping one leaves one', (await value()) === 'summer', await value());
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    check('on the other side too', (await value()) === 'summer', await value());
    await p.close();
  }

  // ---- 15. Everything you tap is a thumb wide ----
  {
    const p=await open(b);
    const small = await p.evaluate(()=>{
      const out = [];
      const look = (sel, what) => document.querySelectorAll(sel).forEach(el => {
        const r = el.getBoundingClientRect();
        if(r.height && r.height < 44) out.push(`${what}: ${Math.round(r.height)}px`);
      });
      look('#tabs .tab', 'wardrobe category');
      look('.page-head .icon-btn', 'header icon');
      look('.bottom-btn', 'nav destination');
      return out;
    });
    check('the wardrobe head and its categories are all 44px', small.length === 0,
      small.join(', '));

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(700);
    const fab = await p.evaluate(()=>{
      const f = document.getElementById('filters-fab').getBoundingClientRect();
      const bar = document.getElementById('bottom-bar').getBoundingClientRect();
      return {h: Math.round(f.height), gap: Math.round(bar.top - f.bottom)};
    });
    check('so is the filters pill', fab.h >= 44, `${fab.h}px`);
    // The nav grew when its buttons did; the pill has to move up with it
    // or the two end up touching.
    check('and it still stands clear of the nav', fab.gap >= 10, `${fab.gap}px`);
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
