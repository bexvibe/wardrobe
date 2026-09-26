// The filters open above the button that raises them, rather than as a
// sheet docked to the bottom edge.
//
// Two things follow from that and they are what this suite is about. The
// button stays on screen, so the way out is where the way in was — one
// control, pointing whichever way the panel is about to go, instead of a
// pill to open and a second chevron inside to close. And the panel is a
// thing floating over the page rather than part of its floor, so pushing
// it back down puts it away.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const UP   = 'M6 14l6-6 6 6';   // the panel is down; this brings it up
const DOWN = 'M6 10l6 6 6-6';   // the panel is up; this puts it down

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}, hasTouch:true});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1600);
  return p;
}

const isOpen = p => p.evaluate(()=>filterSheetOpen());
const arrow  = p => p.evaluate(()=>
  document.querySelector('.filters-fab-chevron path').getAttribute('d'));
const geom = p => p.evaluate(()=>{
  const sh = document.getElementById('filter-sheet').getBoundingClientRect();
  const row = document.getElementById('float-row').getBoundingClientRect();
  const nav = document.getElementById('bottom-bar').getBoundingClientRect();
  return {
    sheetTop: Math.round(sh.top), sheetBottom: Math.round(sh.bottom),
    sheetLeft: Math.round(sh.left), sheetRight: Math.round(sh.right),
    rowTop: Math.round(row.top), rowBottom: Math.round(row.bottom),
    navTop: Math.round(nav.top), fold: window.innerHeight, wide: window.innerWidth,
  };
});

// Drag from a point on the panel, by dy, in `steps` moves.
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
const onPanel = (p, down) => p.evaluate(d=>{
  const r = document.getElementById('filter-sheet').getBoundingClientRect();
  return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + d)};
}, down === undefined ? 40 : down);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Where it opens ----
  {
    const p=await open(b);
    check('it arrives open on Outfits, as it always did', await isOpen(p));
    const g = await geom(p);
    check('above the floating buttons, not under them',
      g.sheetBottom < g.rowTop, `panel ends ${g.sheetBottom}, row starts ${g.rowTop}`);
    check('with air between the two',
      g.rowTop - g.sheetBottom >= 6 && g.rowTop - g.sheetBottom <= 24,
      `${g.rowTop - g.sheetBottom}px`);
    check('clear of the bottom edge, so it is a panel and not a floor',
      g.sheetBottom < g.fold - 100, `ends ${g.sheetBottom} of ${g.fold}`);
    check('and inset from the sides by the page gutter',
      g.sheetLeft === 16 && g.wide - g.sheetRight === 16,
      `${g.sheetLeft} / ${g.wide - g.sheetRight}`);
    check('rounded on every corner now',
      await p.evaluate(()=>{
        const r = getComputedStyle(document.getElementById('filter-sheet')).borderRadius;
        return r === '18px';
      }));
    check('the page leaves room to scroll its last row clear',
      await p.evaluate(()=>{
        const inset = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--sheet-inset'), 10);
        const sheet = document.getElementById('filter-sheet').getBoundingClientRect();
        return inset > 0 && inset >= window.innerHeight - sheet.top - 121;
      }));
    await p.close();
  }

  // ---- 2. One button, both directions ----
  {
    const p=await open(b);
    check('the pill is still there with the panel up',
      await p.evaluate(()=>getComputedStyle(
        document.getElementById('filters-fab')).display !== 'none'));
    check('unchanged but for its arrow — the word is still on it',
      (await p.textContent('#filters-fab')).replace(/\s+/g,' ').trim().startsWith('Filters'),
      (await p.textContent('#filters-fab')).replace(/\s+/g,' ').trim());
    check('pointing down, which is where the panel is going',
      (await arrow(p)) === DOWN, await arrow(p));
    check('and saying as much to a screen reader',
      (await p.getAttribute('#filters-fab','aria-expanded')) === 'true');

    await p.click('#filters-fab'); await p.waitForTimeout(600);
    check('pressing it puts the panel away', !(await isOpen(p)));
    check('and the arrow turns over', (await arrow(p)) === UP, await arrow(p));
    check('and says so', (await p.getAttribute('#filters-fab','aria-expanded')) === 'false');

    await p.click('#filters-fab'); await p.waitForTimeout(600);
    check('pressing it again brings it back', await isOpen(p));
    check('and the arrow turns again', (await arrow(p)) === DOWN);

    // Nothing inside it does the closing any more.
    check('no second chevron inside the panel',
      await p.evaluate(()=>!document.querySelector('.filter-sheet-collapse')));
    check('and no title repeating what the button already says',
      await p.evaluate(()=>!document.querySelector('.filter-sheet-title')));
    await p.close();
  }

  // ---- 3. Pushing it back down ----
  {
    const p=await open(b);
    check('a drag down from the panel puts it away', await (async()=>{
      await drag(p, await onPanel(p), 110);
      return !(await isOpen(p));
    })());

    await p.click('#filters-fab'); await p.waitForTimeout(600);
    check('a short one does not — that is a twitch, not a gesture',
      await (async()=>{ await drag(p, await onPanel(p), 24); return isOpen(p); })());

    check('and it is left where it started, not half pushed down',
      await p.evaluate(()=>{
        const el = document.getElementById('filter-sheet');
        return el.style.transform === '' && el.style.opacity === '' &&
               !el.classList.contains('dragging');
      }));

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
      await drag(p, await onPanel(p, 90), -70);
      return isOpen(p);
    })());
    await p.close();
  }

  // ---- 4. Dragging it is not a tap on what is under your finger ----
  {
    const p=await open(b);
    const before = await p.evaluate(()=>outfitTags.slice());
    // Start the drag on a tag chip and pull the whole panel down.
    const chip = await p.evaluate(()=>{
      const c = document.querySelector('#sheet-tag-chips .tag-chip');
      if(!c) return null;
      const r = c.getBoundingClientRect();
      return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};
    });
    if(chip){
      await drag(p, chip, 120);
      check('dragging from a chip closes the panel', !(await isOpen(p)));
      check('without the chip counting as tapped',
        JSON.stringify(await p.evaluate(()=>outfitTags.slice())) === JSON.stringify(before),
        JSON.stringify(await p.evaluate(()=>outfitTags.slice())));
    } else {
      check('dragging from a chip closes the panel', true, 'no tags in this wardrobe');
      check('without the chip counting as tapped', true, 'no tags in this wardrobe');
    }
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
