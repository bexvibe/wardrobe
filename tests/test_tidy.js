// This round of tidying: no filters on the wardrobe, a filter panel that
// comes up once a visit rather than every trip, tags folded to two rows and
// ordered by use, a capsule's layers cascading, the pieces no capsule has
// claimed, and a piece's capsules editable from the piece itself.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// summer on four pieces, winter on three, then a long tail of one each —
// enough to both order by use and overflow two rows.
const TAGS = {
  seed_0:['winter','wool'], seed_1:['winter'], seed_2:['summer'], seed_3:['summer','linen'],
  seed_4:['work'], seed_5:['evening'], seed_6:['sporty'], seed_7:['holiday'],
  seed_8:['weekend'], seed_9:['summer'], seed_10:['winter'], seed_11:['summer'],
  seed_12:['smart'], seed_13:['casual'], seed_14:['layering'], seed_15:['denim'],
  seed_16:['knit'], seed_17:['cotton'], seed_18:['silk'], seed_19:['vintage'],
};
const CAPS = [{id:'cap_a', name:'Winter', archived_at:null, created_at:'2026-01-01'}];
// A jacket, a top and a bottom, so the cascade has three layers to show.
const MEM = [
  {capsule_id:'cap_a', item_id:'seed_0',  created_at:'2026-01-01'},
  {capsule_id:'cap_a', item_id:'seed_22', created_at:'2026-01-01'},
  {capsule_id:'cap_a', item_id:'seed_11', created_at:'2026-01-01'},
];

async function open(b, opts){
  const o = opts || {};
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;`
       + `window.__SEED_TAGS=${JSON.stringify(o.tags || TAGS)};`
       + `window.__SEED_CAPSULES=${JSON.stringify(o.capsules || CAPS)};`
       + `window.__SEED_CAPSULE_ITEMS=${JSON.stringify(o.members || MEM)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

const sheetOpen = p => p.evaluate(()=>filterSheetOpen());
const visibleTags = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#sheet-tag-chips .tag-chip'))
    .filter(c=>!c.hidden).map(c=>c.textContent.trim()));
const foldedCount = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#sheet-tag-chips .tag-chip')).filter(c=>c.hidden).length);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The wardrobe has no filters ----
  {
    const p=await open(b);
    check('no Filters pill on the wardrobe', !(await p.isVisible('#filters-fab')));
    check('and the panel has nothing to offer there',
      !(await p.evaluate(()=>filterSheetHasContent())) && !(await sheetOpen(p)));
    check('the wardrobe shows everything despite twenty tags existing',
      await p.evaluate(()=>visibleFilteredItems('').length) === 80);
    check('nothing is left of the old wardrobe tag filter',
      await p.evaluate(()=>typeof setInventoryTag === 'undefined' &&
                           typeof window.inventoryTag === 'undefined'));
    await p.close();
  }

  // ---- 2. The panel comes up once a visit, not every time ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    check('it comes down by itself the first time you arrive', await sheetOpen(p));

    await p.click('#nav-inventory-btn'); await p.waitForTimeout(500);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(800);
    check('and stays down on the next trip back', !(await sheetOpen(p)));
    check('the pill is there to raise it', await p.isVisible('#filters-fab'));
    await p.click('#filters-fab'); await p.waitForTimeout(450);
    check('and raising it by hand still works', await sheetOpen(p));

    // Faves has its own once, independent of Outfits.
    await p.click('#nav-saved-btn'); await p.waitForTimeout(800);
    check('Faves gets its own first time', await sheetOpen(p));
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(800);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(800);
    check('and only the once', !(await sheetOpen(p)));

    // A new visit starts over.
    await p.reload(); await p.waitForTimeout(1200);
    const q=await open(b);
    await q.click('#nav-outfits-btn'); await q.waitForTimeout(900);
    check('a fresh visit gets the panel again', await sheetOpen(q));
    await q.close();
    await p.close();
  }

  // ---- 2b. The pill: centred on the nav, and the two states are one motion ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    await p.click('#filter-sheet-collapse'); await p.waitForTimeout(600);

    const placed = await p.evaluate(()=>{
      const f = document.getElementById('filters-fab').getBoundingClientRect();
      const n = document.getElementById('bottom-bar').getBoundingClientRect();
      return {
        fabMid: Math.round((f.left + f.right) / 2),
        navMid: Math.round((n.left + n.right) / 2),
        gap: Math.round(n.top - f.bottom),
        h: Math.round(f.height),
        w: Math.round(f.width),
      };
    });
    // It used to sit right-aligned, overshooting the nav's right edge by
    // 16px and lining up with nothing.
    check('the pill is centred on the nav bar', placed.fabMid === placed.navMid,
      `${placed.fabMid} vs ${placed.navMid}`);
    check('and sits just above it, not on it', placed.gap > 4 && placed.gap < 40,
      `${placed.gap}px`);
    check('it is a pill, not a bar', placed.w < 200, `${placed.w}x${placed.h}`);
    check('and a thumb-sized one', placed.h >= 40, `${placed.h}px`);

    // Opening and closing is one motion: the panel travels while the pill
    // is still on its way out, and the other way round.
    const flight = async (go) => {
      await p.evaluate(go);
      const frames = [];
      for(let i = 0; i < 3; i++){
        await p.waitForTimeout(70);
        frames.push(await p.evaluate(()=>({
          o: Number(parseFloat(getComputedStyle(document.getElementById('filters-fab')).opacity).toFixed(2)),
          y: Math.round(new DOMMatrix(getComputedStyle(
               document.getElementById('filter-sheet')).transform).m42),
        })));
      }
      await p.waitForTimeout(500);
      return frames;
    };

    const opening = await flight(()=>openFilterSheet());
    check('opening, the panel is still travelling while the pill is still there',
      opening.some(f => f.y > 0 && f.o > 0.2), JSON.stringify(opening));
    check('and the pill is on its way out the whole time, not gone at once',
      opening[0].o < 1 && opening[0].o > 0.5, JSON.stringify(opening.map(f=>f.o)));

    const closing = await flight(()=>closeFilterSheet());
    check('closing, the pill is coming back while the panel is still going',
      closing.some(f => f.y > 0 && f.o > 0.5), JSON.stringify(closing));

    check('both halves share one curve and one duration', await p.evaluate(()=>{
      const root = getComputedStyle(document.documentElement);
      const ms = root.getPropertyValue('--sheet-ease-ms').trim();
      const sheet = getComputedStyle(document.getElementById('filter-sheet'));
      const fab = getComputedStyle(document.getElementById('filters-fab'));
      return ms !== '' &&
             sheet.transitionDuration.includes('0.26s') &&
             fab.transitionDuration.includes('0.26s');
    }));
    check('and stand still for anyone who asked for less movement', await (async()=>{
      const q = await b.newPage({viewport:{width:390,height:844}, reducedMotion:'reduce'});
      await q.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
        body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
      await q.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
        body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
      await q.goto('http://localhost:8933/index.html'); await q.waitForTimeout(400);
      if(await q.isVisible('#gate-login')){
        await q.fill('#gate-password','correct-horse'); await q.click('#gate-submit');
      }
      await q.waitForSelector('#app-root',{state:'visible'}); await q.waitForTimeout(700);
      const still = await q.evaluate(()=>
        getComputedStyle(document.getElementById('filter-sheet')).transitionDuration);
      await q.close();
      return still.includes('0s');
    })());

    // A filter being on says so without the pill going black.
    await p.click('#filters-fab'); await p.waitForTimeout(500);
    await p.click('#sheet-tag-chips .tag-chip'); await p.waitForTimeout(700);
    await p.click('#filter-sheet-collapse'); await p.waitForTimeout(600);
    const on = await p.evaluate(()=>{
      const f = document.getElementById('filters-fab');
      const c = getComputedStyle(f);
      const badge = f.querySelector('.filters-fab-count');
      const lum = s => { const [r,g,bl] = s.match(/\d+/g).map(Number); return (r+g+bl)/3; };
      return {
        bg: c.backgroundColor, bgLum: lum(c.backgroundColor),
        ring: c.borderTopColor,
        badge: badge ? badge.textContent.trim() : null,
      };
    });
    check('an active filter shows as a count, not a black pill',
      on.badge === '1' && on.bgLum > 180, `${on.bg} badge=${on.badge}`);
    // The wash alone carries it. A darker ring on top was a second, louder
    // way of saying the same thing.
    check('and no outline drawn round it to say it twice',
      on.ring === 'rgb(220, 220, 220)', on.ring);
    await p.close();
  }

  // ---- 3. Tags: one row that scrolls, most used first ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);

    const row = await p.evaluate(()=>{
      const el = document.getElementById('sheet-tag-chips');
      const chips = Array.from(el.children);
      return {
        n: chips.length,
        rows: new Set(chips.map(c => c.offsetTop)).size,
        scrolls: el.scrollWidth > el.clientWidth,
        overflow: Math.round(el.scrollWidth - el.clientWidth),
        wraps: getComputedStyle(el).flexWrap,
        order: chips.map(c => c.textContent.trim()),
      };
    });
    check('every tag is there, none folded away', row.n === 17, String(row.n));
    check('on one row', row.rows === 1, `${row.rows} rows`);
    check('that scrolls sideways for the rest', row.scrolls && row.wraps === 'nowrap',
      `${row.overflow}px past the edge`);
    check('and no control to open before you can read them',
      await p.evaluate(()=>!document.getElementById('sheet-tag-more')));

    // Which is why the order matters more than it did: what you reach for
    // most has to be the part you can see without scrolling.
    check('the two tags on the most pieces lead the row',
      row.order[0] === 'summer' && row.order[1] === 'winter', row.order.slice(0,4).join(', '));
    check('the rest are alphabetical, so the order is stable',
      row.order.slice(2).join(',') === row.order.slice(2).slice().sort().join(','),
      row.order.slice(2, 8).join(', '));

    // A tag only reachable by scrolling still filters.
    const last = row.order[row.order.length - 1];
    await p.evaluate(t => {
      const chip = document.querySelector(`#sheet-tag-chips .tag-chip[data-tag="${t}"]`);
      chip.scrollIntoView({ inline: 'center' });
    }, last);
    await p.waitForTimeout(300);
    await p.click(`#sheet-tag-chips .tag-chip[data-tag="${last}"]`); await p.waitForTimeout(700);
    check('a tag you had to scroll to still filters',
      (await p.evaluate(()=>outfitTags)).join() === last, `${await p.evaluate(()=>outfitTags)} vs ${last}`);
    await p.close();
  }

  // ---- 4. The pieces row, and what belongs in it ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    const onOutfits = await p.evaluate(()=>{
      const el = document.getElementById('sheet-filter-grid');
      return {
        labels: Array.from(el.children).map(c => c.childNodes[0].textContent.trim()),
        scrolls: el.scrollWidth > el.clientWidth,
      };
    });
    check('the pieces row scrolls sideways too', onOutfits.scrolls);
    // Every one of them, in the wardrobe's order — except that a category
    // you own nothing in waits at the end rather than sitting between two
    // you reach for. test_order covers the rule itself.
    check('every category an outfit is built from',
      onOutfits.labels.length === 8 &&
      await p.evaluate(ls => ls.every(t => OUTFIT_TABS.includes(t)), onOutfits.labels),
      onOutfits.labels.join(', '));
    check('the ones you own something in leading',
      await p.evaluate(ls => {
        const owned = ls.map(t => itemsInTab(t).length > 0);
        return owned.every((o, i) => i === 0 || owned[i-1] >= o);
      }, onOutfits.labels),
      onOutfits.labels.join(', '));

    // Shoes, hats and accessories are not what an outfit is generated from,
    // so a chip for them could only ever filter nothing. They go on a kept
    // outfit by hand instead.
    // A chip that is not filtering anything should not look filled. At rest
    // it is its outline and no more; filled always means on.
    // Pinned, not ruled out: a category ruled out belongs to the Without
    // row now, and the Pieces chip deliberately does not claim it.
    const chipStates = await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids: itemsInTab('Tops').slice(0,1).map(i=>i.id)};
      renderFilterControls();
      const g = el => { const c=getComputedStyle(el);
        return {bg:c.backgroundColor, border:c.borderTopColor, weight:c.fontWeight}; };
      const all = Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'));
      const r = {on: g(all.find(e=>e.classList.contains('active'))),
                 off: g(all.find(e=>!e.classList.contains('active')))};
      outfitFilters['Tops'] = {type:'any', ids:[]};
      renderFilterControls();
      return r;
    });
    check('a chip filtering nothing is transparent, not filled',
      /rgba\(0, 0, 0, 0\)|transparent/.test(chipStates.off.bg), chipStates.off.bg);
    // Filled versus outlined is the whole difference. A ring as well was
    // saying it twice, so the selected chip has none.
    check('and one that is filtering is filled, with no ring',
      chipStates.on.bg !== chipStates.off.bg &&
      /rgba\(0, 0, 0, 0\)|transparent/.test(chipStates.on.border),
      JSON.stringify(chipStates));

    check('and nothing an outfit is not generated from',
      !['Shoes','Hats','Accessories','Swimwear'].some(t => onOutfits.labels.includes(t)),
      onOutfits.labels.join(', '));

    await p.click('#nav-saved-btn'); await p.waitForTimeout(800);
    const onFaves = await p.evaluate(()=>
      Array.from(document.getElementById('sheet-filter-grid').children)
        .map(c => c.childNodes[0].textContent.trim()));
    check('Faves offers the same row as Outfits',
      JSON.stringify(onFaves) === JSON.stringify(onOutfits.labels),
      onFaves.join(', '));
    await p.close();
  }

  // ---- 5. A capsule's layers cascade ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(800);
    const bands = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#capsule-gallery .capsule-band')).map(row =>
        Array.from(row.children).map(c => {
          const item = ITEMS.find(i => i.photo === c.getAttribute('src'));
          return item ? tabForItem(item) : '?';
        })));
    check('each layer gets its own row',
      bands.every(r => new Set(r).size === 1), JSON.stringify(bands));
    const order = bands.map(r => r[0]);
    check('jackets, then tops, then the bottom — as they go on',
      JSON.stringify(order) === JSON.stringify(['Jackets','Tops','Pants']),
      order.join(' → '));
    check('a jacket and a top are no longer side by side',
      !bands.some(r => r.includes('Jackets') && r.includes('Tops')));
    await p.close();
  }

  // ---- 6. What no capsule has claimed ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(800);
    const loose = await p.evaluate(()=>({
      shown: document.getElementById('loose-section').style.display,
      tiles: document.querySelectorAll('#loose-gallery .tile').length,
      claimed: capsules.reduce((n,c)=>n+c.itemIds.length, 0),
      total: ITEMS.length,
      belowCapsules: document.getElementById('loose-section').getBoundingClientRect().top
                   > document.getElementById('capsule-gallery').getBoundingClientRect().top,
    }));
    check('the leftovers are listed', loose.shown === 'block' && loose.tiles > 0,
      `${loose.tiles} tiles`);
    check('exactly the pieces no capsule holds',
      loose.tiles === loose.total - loose.claimed,
      `${loose.tiles} vs ${loose.total} - ${loose.claimed}`);
    check('and at the bottom of the page, under the capsules', loose.belowCapsules);
    check('none of the capsule\'s own pieces is among them',
      await p.evaluate(()=>{
        const claimed = new Set(capsules.flatMap(c=>c.itemIds));
        return Array.from(document.querySelectorAll('#loose-gallery .tile'))
          .every(t => !claimed.has(t.dataset.id));
      }));

    // Tapping one opens it, so the list is a way in rather than a wall.
    await p.click('#loose-gallery .tile'); await p.waitForTimeout(500);
    check('tapping one opens the piece',
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open')));
    await p.close();
  }

  // ---- 7. A piece's capsules, from the piece ----
  {
    const p=await open(b);
    // seed_0 is in Winter; the first tile in Jackets is it.
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(500);
    check('the sheet says which capsules the piece is in',
      await p.evaluate(()=>{
        const dt = Array.from(document.querySelectorAll('.detail-facts dt'))
          .find(e=>e.textContent.trim()==='Capsules');
        return Boolean(dt) && /Winter/.test(dt.nextElementSibling.textContent);
      }),
      (await p.textContent('.detail-facts')).replace(/\s+/g,' ').trim());
    check('and offers a way to change that',
      await p.isVisible('.modal button:has-text("Add to capsule")'));

    await p.click('.modal button:has-text("Add to capsule")'); await p.waitForTimeout(500);
    const picks = await p.evaluate(()=>
      Array.from(document.querySelectorAll('.capsule-pick'))
        .map(x=>({name:x.textContent.trim().replace(/\s*✓$/,''), picked:x.classList.contains('picked')})));
    check('every capsule is a row you can tick', picks.length === 1, JSON.stringify(picks));
    check('with the ones it is already in ticked', picks[0].picked);
    check('the rows are a proper thumb target',
      await p.evaluate(()=>document.querySelector('.capsule-pick').getBoundingClientRect().height >= 44));

    await p.click('.capsule-pick'); await p.waitForTimeout(600);
    check('tapping takes it out', await p.evaluate(()=>!capsules[0].itemIds.includes('seed_0')));
    check('the membership row goes with it',
      await p.evaluate(()=>!window.__WARDROBE_STATE.capsule_items
        .some(r=>r.capsule_id==='cap_a' && r.item_id==='seed_0')));
    // No toast: the row unticks where you tapped it, and the same tap is
    // the way back.
    check('and says nothing about it, because the row already did',
      await p.evaluate(()=>!document.querySelector('.toast.show')));
    await p.click('.capsule-pick'); await p.waitForTimeout(700);
    check('tapping again puts it back in',
      await p.evaluate(()=>capsules[0].itemIds.includes('seed_0')));

    // More than one capsule at a time — that is the point of it.
    await p.evaluate(async()=>{ await saveCapsule({ id:null, name:'Evening', itemIds:[] }); });
    // Through the piece, which is the only way there in the app — and the
    // only way the back arrow has a piece to return to.
    await p.evaluate(()=>{ closeModal(); openModal('seed_0'); }); await p.waitForTimeout(400);
    await p.evaluate(()=>openItemCapsulePicker('seed_0')); await p.waitForTimeout(500);
    check('a second capsule shows up as another row',
      (await p.locator('.capsule-pick').count()) === 2);
    await p.locator('.capsule-pick').nth(1).click(); await p.waitForTimeout(600);
    check('a piece can be in both at once',
      await p.evaluate(()=>capsulesForItem('seed_0').length) === 2,
      String(await p.evaluate(()=>capsulesForItem('seed_0').map(c=>c.name).join(','))));
    check('both are ticked',
      await p.evaluate(()=>document.querySelectorAll('.capsule-pick.picked').length) === 2);

    await p.click('.modal .sheet-back'); await p.waitForTimeout(500);
    check('back returns to the piece', /Add to capsule/.test(await p.textContent('.modal-actions')));
    await p.close();
  }

  // ---- 8. The photo leads the form; Archive sits under it ----
  {
    const p=await open(b);
    await p.click('#gallery .tile'); await p.waitForTimeout(450);
    const onDetail = await p.evaluate(()=>
      Array.from(document.querySelectorAll('.modal-actions button')).map(x=>x.textContent.trim()));
    check('the detail sheet is for reading, plus Edit and capsules',
      !onDetail.some(l=>/photo|archive/i.test(l)), onDetail.join(', '));

    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(500);
    const inForm = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#form-item-actions button')).map(x=>x.textContent.trim()));
    check('Archive is under Edit instead', inForm.join(', ')==='Archive', inForm.join(', '));
    // The photo is the piece, so it leads the form — and shows you what it
    // currently is rather than asking you to remember.
    const photoRow = await p.evaluate(()=>{
      const row = document.querySelector('.form-photo');
      if(!row) return null;
      const grid = document.querySelector('#form-backdrop .form-grid');
      return {
        label: row.querySelector('.form-photo-label').textContent.trim(),
        thumb: Boolean(row.querySelector('.form-photo-thumb img')),
        aboveTheFields: row.getBoundingClientRect().top < grid.getBoundingClientRect().top,
        target: Math.round(row.getBoundingClientRect().height),
      };
    });
    check('replacing the photo is the first thing on the form',
      photoRow && photoRow.aboveTheFields && /photo/i.test(photoRow.label),
      JSON.stringify(photoRow));
    check('with the photo it has now shown beside it', photoRow.thumb);
    check('and a target you cannot miss', photoRow.target >= 44, `${photoRow.target}px`);

    const before = await p.evaluate(()=>ITEMS.length);
    await p.click('#form-item-actions button:has-text("Archive")'); await p.waitForTimeout(700);
    check('archiving from the form archives the piece',
      await p.evaluate(()=>ITEMS.length) === before - 1);
    check('and closes the form rather than leaving it over the wardrobe',
      !(await p.isVisible('#form-backdrop .modal-body')));
    check('it still offers the piece back', await p.evaluate(()=>
      Boolean(document.querySelector('.toast-undo'))));

    // A new piece has nothing to replace or archive.
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    check('a new piece gets no action row',
      (await p.evaluate(()=>document.getElementById('form-item-actions').children.length)) === 0);
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
