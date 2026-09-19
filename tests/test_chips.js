// A filter chip says whether it is on, and how much, without saying it in
// words. Off is an outline. On with pieces pinned is filled and carries the
// count in a badge. On with a category ruled out is filled with its label
// Nowhere does the row print "Any" or "2 selected".
// And every one of them — chips, tags, Clear all, the arrow, the picker's
// own buttons — is a full thumb's worth of target.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const TAGS = {seed_1:['summer','linen'], seed_2:['summer'], seed_3:['winter']};
// Enough tags that the row is wider than the panel, which is the whole
// point of the two checks about edges and scrolling below.
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

// One chip, read the way you read it on screen: is it filled, does it carry
// a number, is its label crossed out.
const chip = (p, label) => p.evaluate(l => {
  const el = Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip'))
    .find(e => e.childNodes[0].textContent.trim() === l);
  if(!el) return null;
  const cs = getComputedStyle(el);
  const badge = el.querySelector('.chip-count');
  const lab = el.querySelector('.chip-label');
  return {
    state: el.dataset.state,
    filled: !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor),
    ringed: !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.borderTopColor),
    badge: badge ? badge.textContent.trim() : null,
    // Not aria-pressed: this chip opens a picker, it does not toggle.
    opens: el.getAttribute('aria-haspopup'),
    pressed: el.getAttribute('aria-pressed'),
    caret: Boolean(el.querySelector('.chip-caret')),
    said: el.getAttribute('aria-label'),
    text: el.textContent.trim(),
    h: Math.round(el.getBoundingClientRect().height),
  };
}, label);

// Through the picker, the way she would.
async function setSlot(p, key, choice){
  await p.evaluate(k => openSlotPicker(k), key);
  await p.waitForTimeout(350);
  await p.click(`#picker-quick-picks .base-btn:has-text("${choice}")`);
  await p.waitForTimeout(250);
  await p.click('.modal .sheet-back');
  await p.waitForTimeout(600);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Nothing set: outlines all the way along, and not a word ----
  {
    const p=await open(b);
    const all = await p.evaluate(()=>Array.from(
      document.querySelectorAll('#sheet-filter-grid .filter-chip')).map(e=>({
        text: e.textContent.trim(),
        state: e.dataset.state,
        active: e.classList.contains('active'),
        badge: Boolean(e.querySelector('.chip-count')),
      })));
    check('every chip starts as an outline', all.every(c=>!c.active && c.state==='any'),
      JSON.stringify(all.slice(0,3)));
    check('and carries no badge, because nothing is pinned',
      all.every(c=>!c.badge));
    check('a chip at rest is its label and nothing else',
      all.every(c=>!/any|selected/i.test(c.text)),
      all.map(c=>c.text).join(' | '));
    check('the word "Any" is nowhere in the filter panel',
      !(await p.evaluate(()=>/\bAny\b/.test(
        document.getElementById('filter-sheet').innerText))));
    check('nor "selected"',
      !(await p.evaluate(()=>/selected/i.test(
        document.getElementById('filter-sheet').innerText))));
    await p.close();
  }

  // ---- 2. Pinning pieces: filled, with the count in a badge ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,3).map(i=>i.id)};
      renderFilterControls();
    });
    await p.waitForTimeout(400);
    const c = await chip(p, 'Tops');
    check('a chip with pieces pinned is filled', c.filled && c.state==='items',
      JSON.stringify(c));
    check('and has no ring as well — filled is the whole difference', !c.ringed);
    check('the count is a number in a badge, not a sentence',
      c.badge === '3' && !/selected/i.test(c.text), `badge ${c.badge}, text "${c.text}"`);
    check('and the badge follows the number pinned', await (async()=>{
      await p.evaluate(()=>{
        outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,1).map(i=>i.id)};
        renderFilterControls();
      });
      await p.waitForTimeout(300);
      return (await chip(p,'Tops')).badge === '1';
    })());
    check('a chip that is on says so to a screen reader too',
      c.opens === 'dialog' && /3 selected/.test(c.said), c.said);
    check('and one that is off says that', await (async()=>{
      const off = await chip(p, 'Dresses');
      return off.opens === 'dialog' && /any/i.test(off.said);
    })());
    await p.close();
  }

  // ---- 3. Any is the way back ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      outfitFilters['Dresses'] = {type:'items', ids:itemsInTab('Dresses').slice(0,2).map(i=>i.id)};
      renderFilterControls();
      resetOutfitResults();   // the chips redraw on their own; the stream does not
    });
    await p.waitForTimeout(900);
    const on = await chip(p, 'Dresses');
    check('a narrowed category is filled and counted', on.filled && on.badge === '2',
      JSON.stringify(on));
    check('and pinning a dress is what asks for a dress outfit',
      await p.evaluate(()=>outfitDisplayed.length > 0 &&
        outfitDisplayed.every(o => o.base === 'dress')));

    await setSlot(p, 'Dresses', 'Any');
    const off = await chip(p, 'Dresses');
    check('Any returns it to a plain outline with no count',
      !off.filled && off.badge === null && off.state === 'any', JSON.stringify(off));
    await p.close();
  }

  // ---- 4. Clear all puts the whole row back ----
  {
    const p=await open(b);
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,2).map(i=>i.id)};
      outfitFilters['Jackets'] = {type:'items', ids:itemsInTab('Jackets').slice(0,1).map(i=>i.id)};
      renderFilterControls();
    });
    await p.waitForTimeout(400);
    check('two chips are on', await p.evaluate(()=>
      document.querySelectorAll('#sheet-filter-grid .filter-chip.active').length)===2);
    await p.click('#filter-sheet-clear'); await p.waitForTimeout(700);
    check('and Clear all leaves nothing filled or badged',
      await p.evaluate(()=>Array.from(
        document.querySelectorAll('#sheet-filter-grid .filter-chip'))
          .every(e=>!e.classList.contains('active') && !e.querySelector('.chip-count'))));
    await p.close();
  }

  // ---- 5. Every target in the panel is 44px ----
  {
    const p=await open(b);
    // Clear all only exists once there is something to clear.
    await p.evaluate(()=>{
      outfitFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,2).map(i=>i.id)};
      renderFilterControls();
    });
    await p.waitForTimeout(400);
    const sizes = await p.evaluate(()=>{
      const h = el => el ? Math.round(el.getBoundingClientRect().height) : null;
      return {
        piece: Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip')).map(h),
        tag: Array.from(document.querySelectorAll('#sheet-tag-chips .tag-chip')).map(h),
        clear: h(document.getElementById('filter-sheet-clear')),
        collapse: h(document.querySelector('.filter-sheet-collapse')),
        fab: h(document.getElementById('filters-fab')),
      };
    });
    check('every piece chip is at least 44px tall',
      sizes.piece.length > 0 && sizes.piece.every(n=>n>=44), JSON.stringify(sizes.piece));
    check('every tag chip too',
      sizes.tag.length > 0 && sizes.tag.every(n=>n>=44), JSON.stringify(sizes.tag));
    check('Clear all is not a 21px sliver any more', sizes.clear>=44, String(sizes.clear));
    check('and the way down is a full target', sizes.collapse>=44, String(sizes.collapse));
    // The pill is scaled down while the panel is up, so measure it standing.
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(600);
    const fab = await p.evaluate(()=>
      Math.round(document.getElementById('filters-fab').getBoundingClientRect().height));
    check('the pill that raises the panel already was', fab>=44, String(fab));
    await p.click('#filters-fab'); await p.waitForTimeout(500);

    // Bigger targets, same panel. The head reaches further than it is drawn
    // rather than pushing the chips down the screen.
    const head = await p.evaluate(()=>
      Math.round(document.querySelector('.filter-sheet-head').getBoundingClientRect().height));
    check('and the bigger targets cost the panel no height', head <= 30, `${head}px`);

    await p.evaluate(()=>openSlotPicker('Tops')); await p.waitForTimeout(500);
    const quick = await p.evaluate(()=>Array.from(
      document.querySelectorAll('#picker-quick-picks .base-btn'))
        .map(e=>Math.round(e.getBoundingClientRect().height)));
    check('the picker\'s own Any is 44px as well',
      quick.length===1 && quick.every(n=>n>=44), JSON.stringify(quick));
    await p.close();
  }

  // ---- 6. Faves reads the same way ----
  {
    const p=await open(b);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(1200);
    await p.evaluate(()=>{
      savedFilters['Tops'] = {type:'items', ids:itemsInTab('Tops').slice(0,4).map(i=>i.id)};
      renderFilterControls();
    });
    await p.waitForTimeout(400);
    const c = await chip(p, 'Tops');
    check('the same chip, the same badge, on Faves',
      c.filled && c.badge==='4' && c.h>=44, JSON.stringify(c));
    check('and no words there either',
      !(await p.evaluate(()=>/\bAny\b|selected/i.test(
        document.getElementById('filter-sheet').innerText))));
    await p.close();
  }

  // ---- 7. Fully round, like every other chip in the app ----
  {
    const p=await open(b);
    const radii = await p.evaluate(()=>{
      const r = el => el ? getComputedStyle(el).borderTopLeftRadius : null;
      return {
        piece: r(document.querySelector('#sheet-filter-grid .filter-chip')),
        tag: r(document.querySelector('#sheet-tag-chips .tag-chip')),
        // The shapes it is meant to match.
        wardrobeTab: r(document.querySelector('#tabs .tab')),
        navBtn: r(document.querySelector('.bottom-btn')),
        fab: r(document.getElementById('filters-fab')),
      };
    });
    const round = v => parseFloat(v) >= 22;   // half of a 44px chip
    check('a piece chip is fully round', round(radii.piece), radii.piece);
    check('and so is a tag chip', round(radii.tag), radii.tag);
    check('the same corner the wardrobe tabs, the nav and the pill use',
      round(radii.wardrobeTab) && round(radii.navBtn) && round(radii.fab),
      JSON.stringify(radii));
    await p.close();
  }

  // ---- 8. A panel that is down is out of reach ----
  {
    const p=await open(b);
    // Arriving on Outfits opens it, so put it away first.
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(600);

    check('the closed panel is inert',
      await p.evaluate(()=>document.getElementById('filter-sheet').hasAttribute('inert')));
    check('and inert is a thing this browser honours',
      await p.evaluate(()=>'inert' in HTMLElement.prototype));

    // Tab all the way round the page: nothing inside the panel is a stop.
    const landed = [];
    for(let i=0;i<25;i++){
      await p.keyboard.press('Tab');
      landed.push(await p.evaluate(()=>{
        const a = document.activeElement;
        if(!a || a === document.body) return 'body';
        return document.getElementById('filter-sheet').contains(a)
          ? 'IN THE PANEL: ' + (a.id || a.className) : (a.id || a.tagName);
      }));
    }
    check('no tab stop lands inside it', !landed.some(l=>l.startsWith('IN THE PANEL')),
      landed.filter(l=>l.startsWith('IN THE PANEL')).join(', ') || landed.slice(0,6).join(', '));
    // Tabbing past 80 tiles would take all day, so ask the pill directly:
    // it is the one control near the panel that must stay reachable.
    check('the pill that opens it is still reachable',
      await p.evaluate(()=>{
        const fab = document.getElementById('filters-fab');
        fab.focus();
        return document.activeElement === fab && !fab.hasAttribute('inert');
      }));

    // Open it and the whole panel is back in reach.
    await p.click('#filters-fab'); await p.waitForTimeout(600);
    check('opening it hands it back',
      !(await p.evaluate(()=>document.getElementById('filter-sheet').hasAttribute('inert'))));
    check('and its controls take focus again',
      await p.evaluate(()=>{
        const c = document.getElementById('filter-sheet-collapse');
        c.focus();
        return document.activeElement === c;
      }));

    // Closing while focus is in there does not strand it off-screen.
    await p.evaluate(()=>{ document.getElementById('filter-sheet-collapse').focus();
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

  // ---- 9. The rows stay where you left them ----
  {
    const p=await open(b);
    const wide = await p.evaluate(()=>{
      const r = document.getElementById('sheet-tag-chips');
      return {scroll: r.scrollWidth, shown: r.clientWidth};
    });
    check('the tag row really is wider than the panel',
      wide.scroll > wide.shown + 100, `${wide.scroll} in ${wide.shown}`);

    // Turning on the last tag in the row used to scroll it into view, which
    // meant the row moved under your thumb the instant you tapped. It does
    // not any more — the count beside the section label carries that news
    // instead, and nothing jumps.
    await p.evaluate(()=>{ document.getElementById('sheet-tag-chips').scrollLeft = 0; });
    const chose = await p.evaluate(()=>{
      const tag = allTags()[allTags().length - 1];
      const tab = filterTabs()[filterTabs().length - 1];
      outfitTags = [tag];
      outfitFilters[tab] = {type:'items', ids: itemsInTab(tab).slice(0,1).map(i=>i.id)};
      renderFilterControls();
      return {tag, tab};
    });
    await p.waitForTimeout(500);
    const where = await p.evaluate(()=>({
      tags: document.getElementById('sheet-tag-chips').scrollLeft,
      pieces: document.getElementById('sheet-filter-grid').scrollLeft,
    }));
    check('turning on a tag at the far end does not move the row',
      where.tags === 0, `${where.tags}px`);
    check('and neither does a piece filter', where.pieces === 0, `${where.pieces}px`);
    check('the filter really is on, it is just not chasing you',
      await p.evaluate(t=>outfitTags.join()===t.tag && outfitFilters[t.tab].type==='items', chose));

    // Scrolled along by hand, it stays where you put it — including
    // across the redraw that tapping a chip causes, which is the whole
    // point: the row must not move when you touch it.
    await p.evaluate(()=>{ document.getElementById('sheet-tag-chips').scrollLeft = 200; });
    await p.waitForTimeout(200);
    await p.evaluate(()=>renderFilterControls());
    await p.waitForTimeout(400);
    check('a redraw leaves it where you scrolled it',
      await p.evaluate(()=>document.getElementById('sheet-tag-chips').scrollLeft === 200),
      String(await p.evaluate(()=>document.getElementById('sheet-tag-chips').scrollLeft)));

    // And through a real tap, which is how it actually happens.
    const before = await p.evaluate(()=>{
      const r = document.getElementById('sheet-tag-chips');
      r.scrollLeft = 220;
      return r.scrollLeft;
    });
    await p.waitForTimeout(200);
    const tapped = await p.evaluate(()=>{
      const chip = Array.from(document.querySelectorAll('#sheet-tag-chips .tag-chip'))
        .find(c => { const r = c.getBoundingClientRect();
                     return r.left > 0 && r.right < innerWidth; });
      chip.click();
      return chip.dataset.tag;
    });
    await p.waitForTimeout(700);
    check('tapping a tag you scrolled to does not snatch the row away',
      await p.evaluate(n=>document.getElementById('sheet-tag-chips').scrollLeft === n, before),
      `${before} -> ${await p.evaluate(()=>document.getElementById('sheet-tag-chips').scrollLeft)}`);
    check('and the tap still did what it was for',
      await p.evaluate(t=>outfitTags.includes(t), tapped), tapped);
    await p.close();
  }

  // ---- 10. The row admits there is more of it ----
  {
    const p=await open(b);
    const edges = r => p.evaluate(id => {
      const el = document.getElementById(id);
      return {cls: [...el.classList].filter(c=>c.startsWith('more-')).sort().join('+'),
              mask: getComputedStyle(el).maskImage};
    }, r);

    const start = await edges('sheet-tag-chips');
    check('at the left-hand end only the far edge fades',
      start.cls === 'more-right', start.cls);
    check('and that is a real fade, not just a class',
      /gradient/.test(start.mask), start.mask.slice(0, 60));

    await p.evaluate(()=>{ const r = document.getElementById('sheet-tag-chips');
                           r.scrollLeft = Math.round((r.scrollWidth - r.clientWidth) / 2); });
    await p.waitForTimeout(300);
    check('in the middle, both ends fade',
      (await edges('sheet-tag-chips')).cls === 'more-left+more-right',
      (await edges('sheet-tag-chips')).cls);

    await p.evaluate(()=>{ const r = document.getElementById('sheet-tag-chips');
                           r.scrollLeft = r.scrollWidth; });
    await p.waitForTimeout(300);
    check('at the far end only the near edge does',
      (await edges('sheet-tag-chips')).cls === 'more-left',
      (await edges('sheet-tag-chips')).cls);

    // A row that fits needs no fade at all.
    await p.evaluate(()=>{ const r = document.getElementById('sheet-tag-chips');
                           Array.from(r.children).slice(2).forEach(c=>c.remove());
                           markRowEdges(r); });
    await p.waitForTimeout(200);
    check('and a row that fits has none',
      (await edges('sheet-tag-chips')).cls === '',
      (await edges('sheet-tag-chips')).cls);
    await p.close();
  }

  // ---- 11. A chip that opens something says so ----
  {
    const p=await open(b);
    const look = await p.evaluate(()=>{
      const piece = document.querySelector('#sheet-filter-grid .filter-chip');
      const tag = document.querySelector('#sheet-tag-chips .tag-chip');
      const c = piece.querySelector('.chip-caret');
      return {
        pieceCaret: Boolean(c),
        caretSize: c ? Math.round(c.getBoundingClientRect().width) : 0,
        tagCaret: Boolean(tag.querySelector('.chip-caret')),
        pieceOpens: piece.getAttribute('aria-haspopup'),
        pieceToggles: piece.getAttribute('aria-pressed'),
        tagToggles: tag.getAttribute('aria-pressed'),
      };
    });
    check('a piece chip carries the caret of something that opens',
      look.pieceCaret && look.caretSize > 6, JSON.stringify(look));
    check('and a tag chip, which toggles where it stands, does not',
      !look.tagCaret);
    check('the markup says the same thing: a door, not a switch',
      look.pieceOpens === 'dialog' && look.pieceToggles === null,
      `haspopup=${look.pieceOpens} pressed=${look.pieceToggles}`);

    // And it really is a door.
    await p.click('#sheet-filter-grid .filter-chip'); await p.waitForTimeout(600);
    check('tapping it opens the picker rather than toggling in place',
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open') &&
        Boolean(document.getElementById('picker-gallery'))));
    await p.close();
  }

  // ---- 12. The section labels count what is on ----
  {
    const p=await open(b);
    const labels = () => p.evaluate(()=>{
      const read = id => {
        const el = document.getElementById(id);
        return {text: el.textContent.trim(), shown: el.offsetParent !== null};
      };
      return {tags: read('sheet-tag-count'), pieces: read('sheet-piece-count')};
    });

    const rest = await labels();
    check('nothing on means no count beside Tags',
      !rest.tags.shown && rest.tags.text === '', JSON.stringify(rest.tags));
    check('nor beside Pieces — a nought is a label saying there is no news',
      !rest.pieces.shown && rest.pieces.text === '', JSON.stringify(rest.pieces));

    await p.evaluate(()=>{ outfitTags = ['summer']; renderFilterControls(); });
    await p.waitForTimeout(400);
    check('one tag puts a 1 beside Tags',
      (await labels()).tags.text === '1' && (await labels()).tags.shown,
      JSON.stringify((await labels()).tags));
    check('and leaves Pieces alone', !(await labels()).pieces.shown);

    await p.evaluate(()=>{ outfitTags = ['summer','linen']; renderFilterControls(); });
    await p.waitForTimeout(400);
    check('two tags reads 2', (await labels()).tags.text === '2');

    await p.evaluate(()=>{
      const tabs = filterTabs();
      outfitFilters[tabs[0]] = {type:'items', ids: itemsInTab(tabs[0]).slice(0,3).map(i=>i.id)};
      outfitFilters[tabs[1]] = {type:'items', ids: itemsInTab(tabs[1]).slice(0,1).map(i=>i.id)};
      renderFilterControls();
    });
    await p.waitForTimeout(400);
    // Two categories narrowed, whatever number of pieces is pinned inside
    // them — the chips carry that.
    check('Pieces counts the categories narrowed, not the pieces pinned',
      (await labels()).pieces.text === '2', (await labels()).pieces.text);

    // The point of it: it says so when the chip saying so is off-screen.
    const hidden = await p.evaluate(()=>{
      const row = document.getElementById('sheet-filter-grid');
      row.scrollLeft = 0;
      const on = row.querySelector('.filter-chip.active');
      const box = row.getBoundingClientRect(), a = on.getBoundingClientRect();
      return {label: document.getElementById('sheet-piece-count').offsetParent !== null,
              chipVisible: a.left >= box.left - 1 && a.right <= box.right + 1};
    });
    check('and it is in view even when a filtering chip is not',
      hidden.label, JSON.stringify(hidden));

    await p.click('#filter-sheet-clear'); await p.waitForTimeout(700);
    const after = await labels();
    check('Clear all takes both counts away',
      !after.tags.shown && !after.pieces.shown, JSON.stringify(after));
    await p.close();
  }

  // ---- 13. Faves counts its own, not the Outfits page's ----
  {
    const p=await open(b);
    await p.evaluate(()=>{ outfitTags = ['summer','linen']; renderFilterControls(); });
    await p.waitForTimeout(400);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(1100);
    check('arriving on Faves, the counts are Faves\' own',
      await p.evaluate(()=>document.getElementById('sheet-tag-count').offsetParent === null));
    await p.evaluate(()=>{ savedTags = ['summer']; renderFilterControls(); });
    await p.waitForTimeout(400);
    check('and follow it', await p.evaluate(()=>
      document.getElementById('sheet-tag-count').textContent.trim() === '1'));
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    check('while Outfits still counts its two', await p.evaluate(()=>
      document.getElementById('sheet-tag-count').textContent.trim() === '2'));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
