// The filters are a modal bottom sheet, raised by the pill and put away by
// the foot button, the dimmed page, Escape or pulling it down.
//
// What this suite is about: where the sheet sits and what it covers, what
// the pill says, the head and foot it carries, the second page a piece chip
// slides to inside the same sheet (not a sheet on a sheet), and the pull
// down. Which of the ways out leaves it up or closes it while you use it is
// test_dismiss; how it travels is test_tidy and test_touchdrag.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const TAGS={seed_0:['sporty'],seed_1:['sporty'],seed_2:['sporty','summer'],seed_3:['summer'],
            seed_4:['winter'],seed_5:['work'],seed_6:['work']};
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b, viewport){
  const p=await b.newPage({viewport:viewport||{width:390,height:844}, hasTouch:true});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1600);
  return p;
}

const isOpen = p => p.evaluate(()=>filterSheetOpen());
const raise = async p => { await p.click('#filters-fab'); await p.waitForTimeout(600); };
const fabText = p => p.evaluate(()=>document.getElementById('filters-fab').textContent.replace(/\s+/g,' ').trim());
const text = (p, sel) => p.evaluate(s=>{ const e=document.querySelector(s); return e ? e.textContent.replace(/\s+/g,' ').trim() : null; }, sel);
const clearVisible = p => p.evaluate(()=>getComputedStyle(document.getElementById('filter-sheet-clear')).visibility === 'visible');
const geom = p => p.evaluate(()=>{
  const sh = document.getElementById('filter-sheet').getBoundingClientRect();
  const row = document.getElementById('float-row').getBoundingClientRect();
  const nav = document.getElementById('bottom-bar').getBoundingClientRect();
  return {
    sheetTop: Math.round(sh.top), sheetBottom: Math.round(sh.bottom),
    sheetLeft: Math.round(sh.left), sheetRight: Math.round(sh.right),
    rowTop: Math.round(row.top), navTop: Math.round(nav.top),
    fold: window.innerHeight, wide: window.innerWidth,
  };
});

// Drag from a point, by dy, in steps.
async function drag(p, from, dy, dx){
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  const steps = 8;
  for(let i = 1; i <= steps; i++){
    await p.mouse.move(from.x + ((dx||0) * i) / steps, from.y + (dy * i) / steps);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
  await p.waitForTimeout(600);
}
const onSheet = (p, down) => p.evaluate(d=>{
  const r = document.getElementById('filter-sheet').getBoundingClientRect();
  return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + d)};
}, down === undefined ? 20 : down);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Where it sits ----
  {
    const p=await open(b);
    check('it is not up on arrival', !(await isOpen(p)));
    const shut = await geom(p);
    check('down, it is below the fold', shut.sheetTop >= shut.fold, `starts ${shut.sheetTop} of ${shut.fold}`);
    check('and out of the conversation (inert) so Tab cannot land in it',
      await p.evaluate(()=>document.getElementById('filter-sheet').hasAttribute('inert')));
    check('no dimming on the page while it is down',
      await p.evaluate(()=>{
        const c = getComputedStyle(document.getElementById('filter-backdrop'));
        return c.visibility === 'hidden' && c.pointerEvents === 'none';
      }));

    await raise(p);
    const g = await geom(p);
    check('raised, it is anchored to the bottom edge', g.sheetBottom === g.fold, `ends ${g.sheetBottom} of ${g.fold}`);
    check('and runs the full width of a phone', g.sheetLeft === 0 && g.sheetRight === g.wide,
      `${g.sheetLeft}-${g.sheetRight} of ${g.wide}`);
    check('no taller than 92% of the screen', g.sheetTop >= Math.floor(g.fold * 0.08) - 1,
      `starts ${g.sheetTop}, 8% of ${g.fold} is ${Math.round(g.fold*0.08)}`);
    check('and covers the floating buttons and the nav bar',
      g.sheetTop < g.rowTop && g.sheetTop < g.navTop, `sheet ${g.sheetTop}, row ${g.rowTop}, nav ${g.navTop}`);
    check('rounded on its top corners only', await p.evaluate(()=>{
      const c = getComputedStyle(document.getElementById('filter-sheet'));
      return c.borderTopLeftRadius === '18px' && c.borderTopRightRadius === '18px' &&
             c.borderBottomLeftRadius === '0px' && c.borderBottomRightRadius === '0px';
    }));
    check('it is a dialog, in the document and no longer inert', await p.evaluate(()=>{
      const s = document.getElementById('filter-sheet');
      return s.getAttribute('role') === 'dialog' && !s.hasAttribute('inert');
    }));
    check('the page behind is dimmed, over the nav and the pill', await p.evaluate(()=>{
      const bd = document.getElementById('filter-backdrop');
      const c = getComputedStyle(bd);
      const alpha = parseFloat((c.backgroundColor.match(/[\d.]+(?=\)$)/)||[0])[0]);
      const z = n => Number(getComputedStyle(n).zIndex);
      return c.position === 'fixed' && alpha > 0 && z(bd) === 110 &&
        z(bd) > z(document.getElementById('bottom-bar')) && z(bd) > z(document.getElementById('float-row'));
    }));
    check('the head and the foot are there',
      await p.evaluate(()=>Boolean(document.querySelector('.filter-sheet-top')) &&
        Boolean(document.getElementById('filter-sheet-foot')) &&
        Boolean(document.querySelector('.filter-sheet-top .filter-sheet-clear, .filter-sheet-top #filter-sheet-clear'))));
    check('titled Filters', (await text(p, '#filter-sheet-title')) === 'Filters');
    check('no second chevron or collapse button inside it',
      await p.evaluate(()=>!document.querySelector('.filter-sheet-collapse')));
    check('and it opens on its main page, with tags and pieces',
      await p.evaluate(()=>filterPage === null &&
        Boolean(document.getElementById('sheet-tag-chips')) &&
        Boolean(document.getElementById('sheet-filter-grid'))));
    await p.close();

    // A wider screen: a sheet, not a slab.
    const w = await open(b, {width:1100, height:800});
    await raise(w);
    const wg = await geom(w);
    check('on a wide screen it stops at 640px and stays centred',
      wg.sheetRight - wg.sheetLeft === 640 && wg.sheetLeft === (wg.wide - 640) / 2 &&
      wg.sheetBottom === wg.fold,
      `${wg.sheetLeft}-${wg.sheetRight} of ${wg.wide}`);
    await w.close();
  }

  // ---- 2. The pill ----
  {
    const p=await open(b);
    check('it says Filters', (await fabText(p)) === 'Filters', await fabText(p));
    check('with its icon', await p.evaluate(()=>Boolean(document.querySelector('#filters-fab .filters-fab-icon'))));
    check('and no count badge while nothing is filtered',
      await p.evaluate(()=>!document.querySelector('#filters-fab .filters-fab-count')));
    check('not yet expanded to a screen reader',
      (await p.getAttribute('#filters-fab','aria-expanded')) === 'false');
    await raise(p);
    check('still says Filters with the sheet up, never Hide filters', (await fabText(p)) === 'Filters', await fabText(p));
    check('expanded to a screen reader',
      (await p.getAttribute('#filters-fab','aria-expanded')) === 'true');
    check('its row has eased away behind the sheet',
      await p.evaluate(()=>document.getElementById('float-row').classList.contains('away')));

    await p.click('#sheet-tag-chips .tag-chip'); await p.waitForTimeout(500);
    await p.click('#filter-sheet-see'); await p.waitForTimeout(600);
    check('the row is back and the pill carries a count of 1',
      await p.evaluate(()=>!document.getElementById('float-row').classList.contains('away') &&
        document.querySelector('#filters-fab .filters-fab-count')?.textContent.trim() === '1'));
    check('and is no longer expanded',
      (await p.getAttribute('#filters-fab','aria-expanded')) === 'false');
    await p.close();
  }

  // ---- 3. Pulling it down ----
  {
    const p=await open(b);
    await raise(p);
    check('a pull down from the sheet puts it away', await (async()=>{
      await drag(p, await onSheet(p), 160);
      return !(await isOpen(p));
    })());

    await raise(p);
    check('a short one does not — that is a twitch, not a gesture',
      await (async()=>{ await drag(p, await onSheet(p), 24); return isOpen(p); })());
    check('and it is left where it started, not half pushed down',
      await p.evaluate(()=>{
        const el = document.getElementById('filter-sheet');
        return el.style.transform === '' && !el.classList.contains('dragging') &&
          el.getBoundingClientRect().bottom === window.innerHeight;
      }));
    check('the dimming comes back to full too',
      await p.evaluate(()=>!document.getElementById('filter-backdrop').style.getPropertyValue('--dim')));

    // The chip rows inside scroll sideways, and a thumb never travels in a
    // straight line. A drag that starts across belongs to the row.
    check('a sideways drag on the chips leaves it alone', await (async()=>{
      const at = await p.evaluate(()=>{
        const r = document.querySelector('#sheet-filter-grid').getBoundingClientRect();
        return {x: Math.round(r.left + 150), y: Math.round(r.top + r.height/2)};
      });
      await drag(p, at, 18, -84);
      return isOpen(p);
    })());

    check('a drag up does nothing at all', await (async()=>{
      await drag(p, await onSheet(p, 90), -70);
      return isOpen(p);
    })());
    await p.close();
  }

  // ---- 3b. Dragging it is not a tap on what is under your finger ----
  {
    const p=await open(b);
    await raise(p);
    const before = await p.evaluate(()=>outfitTags.slice());
    // Start the drag on a tag chip and pull the whole sheet down.
    const chip = await p.evaluate(()=>{
      const c = document.querySelector('#sheet-tag-chips .tag-chip');
      if(!c) return null;
      const r = c.getBoundingClientRect();
      return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};
    });
    if(chip){
      await drag(p, chip, 200);
      check('dragging from a chip closes the sheet', !(await isOpen(p)));
      check('without the chip counting as tapped',
        JSON.stringify(await p.evaluate(()=>outfitTags.slice())) === JSON.stringify(before),
        JSON.stringify(await p.evaluate(()=>outfitTags.slice())));
    } else {
      check('dragging from a chip closes the sheet', true, 'no tags in this wardrobe');
      check('without the chip counting as tapped', true, 'no tags in this wardrobe');
    }
    await p.close();
  }

  // ---- 4. The head and the foot on the main page ----
  {
    const p=await open(b);
    await raise(p);
    check('nothing to clear, so Clear all is out of sight but still in the head',
      !(await clearVisible(p)) && (await text(p, '#filter-sheet-clear')) === 'Clear all');
    check('the foot offers to show the outfits, with a count',
      /^See [\d,]+ outfits?$/.test(await text(p, '#filter-sheet-see')), await text(p, '#filter-sheet-see'));
    check('and its count is the one the generator will walk',
      await p.evaluate(()=>document.getElementById('filter-sheet-count').textContent.replace(/,/g,'') ===
        String(filterResultCount()) && filterResultCount() === totalComboCount()));
    check('no way-back button on the main page',
      await p.evaluate(()=>!document.getElementById('filter-sheet-back')));
    check('Clear all is on the right of the head, level with the title', await p.evaluate(()=>{
      const t=document.getElementById('filter-sheet-title').getBoundingClientRect();
      const c=document.getElementById('filter-sheet-clear').getBoundingClientRect();
      return t.left < 60 && c.right > 300 && Math.abs((t.top+t.bottom)/2 - (c.top+c.bottom)/2) < 3;
    }));

    const n0 = await p.evaluate(()=>filterResultCount());
    await p.click('#sheet-tag-chips .tag-chip:has-text("sporty")'); await p.waitForTimeout(700);
    check('a tag applies at once: Clear all appears', await clearVisible(p));
    const n1 = await p.evaluate(()=>filterResultCount());
    check('and the count in the foot follows it', n1 < n0 &&
      (await text(p, '#filter-sheet-see')).includes(n1.toLocaleString('en-US')),
      `${n0} -> ${n1}: ${await text(p, '#filter-sheet-see')}`);
    await p.click('#filter-sheet-clear'); await p.waitForTimeout(600);
    check('Clear all takes it off again, and hides itself',
      !(await clearVisible(p)) && (await p.evaluate(()=>outfitTags.length === 0)));
    check('the sheet stays up after clearing', await isOpen(p));
    await p.close();
  }

  // ---- 5. A piece chip slides to a page of its own, in the same sheet ----
  {
    const p=await open(b);
    await raise(p);
    check('the removed machinery is gone',
      await p.evaluate(()=>typeof openSlotPicker === 'undefined' &&
        typeof closePickerAndApply === 'undefined' &&
        !document.getElementById('picker-quick-picks') &&
        !document.getElementById('picker-backdrop')));
    check('and the chips no longer promise a popup',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
        .every(c => !c.hasAttribute('aria-haspopup'))));
    const key = await p.evaluate(()=>
      document.querySelector('#sheet-filter-grid .filter-chip').childNodes[0].textContent.trim());
    check('it starts with no pieces page up', await p.evaluate(()=>!document.getElementById('picker-gallery')));

    await p.click('#sheet-filter-grid .filter-chip'); await p.waitForTimeout(800);
    check('tapping the first piece chip switches the same sheet to its page',
      await p.evaluate(k=>filterPage === k && filterSheetOpen() &&
        document.querySelectorAll('.filter-backdrop.open, .modal-backdrop.open').length === 1, key));
    check('with a gallery of tiles: one for none, then every piece in the category',
      await p.evaluate(k=>document.querySelectorAll('#picker-gallery .picker-tile').length === 1 + itemsInTab(k).length &&
        document.querySelectorAll('#picker-gallery .picker-none').length === 1, key));
    check('titled for the category, with Filters as the crumb above it',
      (await text(p, '#filter-sheet-title')) === key && (await text(p, '#filter-sheet-crumb')) === 'Filters',
      `${await text(p, '#filter-sheet-title')} / ${await text(p, '#filter-sheet-crumb')}`);
    check('the tags and chips of the main page are gone from it',
      await p.evaluate(()=>!document.getElementById('sheet-tag-chips') && !document.getElementById('sheet-filter-grid')));
    check('Clear says just Clear, and is out of sight with nothing chosen',
      (await text(p, '#filter-sheet-clear')) === 'Clear' && !(await clearVisible(p)));
    check('the foot has the way back to the left of the See button', await p.evaluate(()=>{
      const back = document.getElementById('filter-sheet-back'), see = document.getElementById('filter-sheet-see');
      return Boolean(back) && back.textContent.trim() === 'Filters' &&
        back.getBoundingClientRect().right <= see.getBoundingClientRect().left + 1;
    }));
    check('and no quick-picks row, no empty note', await p.evaluate(()=>
      !document.getElementById('picker-quick-picks') &&
      getComputedStyle(document.getElementById('picker-empty')).display === 'none'));

    // Piece taps apply to the results immediately.
    const before = await p.evaluate(()=>({n: filterResultCount(), shown: outfitDisplayed.length}));
    await p.click('#picker-gallery .picker-tile:not(.picker-none)'); await p.waitForTimeout(900);
    const after = await p.evaluate(k=>({
      type: outfitFilters[k].type, ids: outfitFilters[k].ids.length,
      n: filterResultCount(), count: Number(document.getElementById('filter-sheet-count')
        ? document.getElementById('filter-sheet-count').textContent.replace(/,/g,'') : -1),
      selected: document.querySelectorAll('#picker-gallery .picker-selected:not(.picker-none)').length,
      badge: document.querySelector('#filters-fab .filters-fab-count')?.textContent.trim(),
      open: filterSheetOpen(), page: filterPage,
    }), key);
    check('a tapped piece is chosen right away', after.type === 'items' && after.ids === 1 && after.selected === 1, JSON.stringify(after));
    check('the results behind it already follow, before the sheet is left',
      after.n !== before.n, `${before.n} -> ${after.n}`);
    check('the foot count follows too', after.count === after.n || after.n === 0, JSON.stringify(after));
    check('Clear appears', await clearVisible(p));
    check('and the pill\'s badge', after.badge === '1', String(after.badge));
    check('the sheet is still on that page', after.open && after.page === key);

    // A second piece joins it; tapping a chosen one takes it off again.
    await p.click('#picker-gallery .picker-tile:not(.picker-none):not(.picker-selected)'); await p.waitForTimeout(600);
    check('a second piece joins the first',
      await p.evaluate(k=>outfitFilters[k].ids.length === 2, key));
    await p.click('#picker-gallery .picker-selected:not(.picker-none)'); await p.waitForTimeout(600);
    check('tapping a chosen piece takes it off',
      await p.evaluate(k=>outfitFilters[k].ids.length === 1, key));

    // The "none" tile.
    await p.click('#picker-gallery .picker-none'); await p.waitForTimeout(600);
    check('the first tile asks for outfits without this category',
      await p.evaluate(k=>outfitFilters[k].type === 'none' &&
        document.querySelector('#picker-gallery .picker-none').classList.contains('picker-selected'), key));

    // Clear on a page clears that category only.
    await p.evaluate(()=>{ outfitTags = ['sporty']; });
    await p.click('#filter-sheet-clear'); await p.waitForTimeout(600);
    check('Clear on the page clears that category and nothing else',
      await p.evaluate(k=>outfitFilters[k].type === 'any' && outfitTags.join() === 'sporty', key));
    check('and then hides itself', !(await clearVisible(p)));
    await p.evaluate(()=>{ outfitTags = []; });

    // Back.
    await p.click('#picker-gallery .picker-tile:not(.picker-none)'); await p.waitForTimeout(600);
    await p.click('#filter-sheet-back'); await p.waitForTimeout(800);
    check('the way back returns to the main page of the same sheet',
      await p.evaluate(()=>filterPage === null && filterSheetOpen() &&
        Boolean(document.getElementById('sheet-filter-grid')) && !document.getElementById('picker-gallery')));
    check('where that chip now shows as active',
      await p.evaluate(()=>document.querySelector('#sheet-filter-grid .filter-chip').classList.contains('active')));
    check('and the head is Filters / Clear all again',
      (await text(p, '#filter-sheet-title')) === 'Filters' && (await text(p, '#filter-sheet-clear')) === 'Clear all' &&
      await clearVisible(p));

    // Out from a page.
    await p.click('#sheet-filter-grid .filter-chip'); await p.waitForTimeout(800);
    await p.click('#filter-sheet-see'); await p.waitForTimeout(700);
    check('See N outfits on a page closes the whole sheet', !(await isOpen(p)));
    await raise(p);
    check('and it comes back on the main page, not the page it was on',
      await p.evaluate(()=>filterPage === null && Boolean(document.getElementById('sheet-filter-grid'))));
    await p.click('#sheet-filter-grid .filter-chip'); await p.waitForTimeout(800);
    await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    check('Escape on a page closes the whole sheet too', !(await isOpen(p)));
    await p.close();
  }

  // ---- 6. A piece page on Faves ----
  {
    const p=await open(b);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(1000);
    await raise(p);
    check('Faves has the same sheet, with Clear all and a See button',
      (await text(p, '#filter-sheet-title')) === 'Filters' &&
      (await text(p, '#filter-sheet-clear')) === 'Clear all' &&
      /^(See [\d,]+ outfits?|No outfits match)$/.test(await text(p, '#filter-sheet-see')),
      await text(p, '#filter-sheet-see'));
    await p.click('#sheet-filter-grid .filter-chip'); await p.waitForTimeout(800);
    check('and its piece chips slide to a page too',
      await p.evaluate(()=>filterPage !== null && Boolean(document.getElementById('picker-gallery')) &&
        Boolean(document.getElementById('filter-sheet-back'))));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
