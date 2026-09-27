// Pushing a sheet away with a finger, not a mouse.
//
// Every other drag in the suites is a mouse drag, and a mouse has nothing
// competing for it. A finger does: the browser reads a drag on anything
// scrollable as a scroll, takes the gesture, and sends pointercancel. On a
// phone that left a pull-down with about ten pixels to work with — the
// sheet twitched down, grip and all, sprang back, and never closed. This
// suite drives real touch input through the DevTools protocol so it goes
// through the same arbitration a phone does.
//
// How it behaves once it has the finger: the sheet goes exactly where the
// finger goes and stays solid, the dimming behind it gives way instead,
// and it closes when pulled 100px (a quarter of a smaller panel) or
// flicked down at 0.5px/ms or faster.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const CAPS=[{id:'c1', name:'Weekend', archived_at:null, created_at:'2026-01-01',
             itemIds:['seed_0','seed_1']}];

async function open(b){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
                                hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\nwindow.__WITH_CAPSULES=true;\nwindow.__SEED_CAPSULES=${JSON.stringify(CAPS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.tap('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  p.cdp = await ctx.newCDPSession(p);
  return p;
}

// Everything that should travel together, measured against the sheet.
const where = (p, sel) => p.evaluate(sel=>{
  const m = document.querySelector(sel);
  const r = m.getBoundingClientRect();
  const g = m.querySelector('.sheet-grip');
  const f = m.querySelector('.sheet-footer');
  return {
    top: Math.round(r.top),
    grip: g ? Math.round(g.getBoundingClientRect().top - r.top) : null,
    foot: f ? Math.round(f.getBoundingClientRect().top - r.top) : null,
    scroll: Math.round(m.scrollTop),
    opacity: +getComputedStyle(m).opacity,
    dim: m.parentElement.classList.contains('modal-backdrop')
      ? +(getComputedStyle(m.parentElement).backgroundColor.match(/[\d.]+(?=\)$)/) || [1])[0]
      : null,
  };
}, sel);

// A finger from `from`, by (dx, dy), in small steps. `mid` is called with
// the finger still down, two thirds of the way.
async function touchDrag(p, sel, from, dx, dy, mid){
  await p.evaluate(sel=>{
    window.__cancels = 0;
    document.querySelector(sel).addEventListener('pointercancel', ()=>window.__cancels++);
  }, sel);
  const at = f => [{x: from.x + dx*f, y: from.y + dy*f, id: 1}];
  await p.cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints: at(0)});
  const steps = 18, seen = [];
  for(let i = 1; i <= steps; i++){
    await p.cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints: at(i/steps)});
    await p.waitForTimeout(16);
    seen.push(await where(p, sel));
    if(mid && i === 12) await mid();
  }
  await p.cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints: []});
  await p.waitForTimeout(600);
  return {seen, cancels: await p.evaluate(()=>window.__cancels)};
}

// A quick flick: a short distance in a few fast moves, then either lift
// straight away or hold still for `hold` ms first.
// Headless Chromium hands over a move roughly every 40ms, so the flick is
// three big steps rather than many small ones.
async function flick(p, from, dy, hold){
  const at = f => [{x: from.x, y: from.y + dy*f, id: 1}];
  await p.cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints: at(0)});
  for(let i = 1; i <= 3; i++){
    await p.cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints: at(i/3)});
  }
  if(hold) await p.waitForTimeout(hold);
  await p.cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints: []});
  await p.waitForTimeout(600);
}

const pointIn = (p, sel, dyFromTop) => p.evaluate(([sel, d])=>{
  const r = document.querySelector(sel).getBoundingClientRect();
  return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + d)};
}, [sel, dyFromTop]);
const sheetOpen = p => p.evaluate(()=>
  document.getElementById('modal-backdrop').classList.contains('open'));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. A piece sheet, pulled down by its grip ----
  {
    const p=await open(b);
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(600);
    const rest = await where(p, '#modal');
    const {seen, cancels} = await touchDrag(p, '#modal', await pointIn(p, '#modal', 10), 0, 170);
    const low = seen[seen.length - 1];
    check('the browser does not take the gesture away', cancels === 0, `${cancels} pointercancel`);
    check('the sheet follows the finger all the way down',
      low.top - rest.top > 80, `${rest.top} → ${low.top}`);
    check('exactly under it, with no give: 170px of finger is 170px of sheet',
      Math.abs((low.top - rest.top) - 170) <= 1, `${low.top - rest.top}px`);
    check('the sheet stays solid the whole way',
      seen.every(s => s.opacity === 1), [...new Set(seen.map(s=>s.opacity))].join(','));
    check('while the dimming behind it gives way as it comes down',
      rest.dim > 0.27 && seen.every((s, i) => i === 0 || s.dim <= seen[i-1].dim) &&
      low.dim < rest.dim - 0.03,
      `${rest.dim} → ${low.dim}`);
    check('and the grip rides with it, pinned to the top of the sheet',
      seen.every(s => s.grip === rest.grip), [...new Set(seen.map(s=>s.grip))].join(','));
    check('never moving back up while the finger goes down',
      seen.every((s, i) => i === 0 || s.top >= seen[i-1].top), seen.map(s=>s.top).join(' '));
    check('the content does not scroll underneath instead',
      seen.every(s => s.scroll === 0));
    check('letting go past the line closes it', !(await sheetOpen(p)));
    await p.context().close();
  }

  // ---- 2. The same pull from the photo, not the grip ----
  {
    const p=await open(b);
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(600);
    const {cancels} = await touchDrag(p, '#modal', await pointIn(p, '#modal', 160), 0, 170);
    check('anywhere on the sheet will do', cancels === 0 && !(await sheetOpen(p)),
      `${cancels} pointercancel`);
    await p.context().close();
  }

  // ---- 3. A short pull springs back, all of it ----
  {
    const p=await open(b);
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(600);
    const rest = await where(p, '#modal');
    let mid = null;
    await touchDrag(p, '#modal', await pointIn(p, '#modal', 10), 0, 80, async()=>{
      mid = await where(p, '#modal');
    });
    const back = await where(p, '#modal');
    check('a slow pull short of 100px leaves it open', await sheetOpen(p));
    check('and back where it was', back.top === rest.top && back.grip === rest.grip,
      `${rest.top} → ${back.top}`);
    check('the sheet was solid under the finger', mid.opacity === 1, String(mid.opacity));
    check('the backdrop had lightened', mid.dim < rest.dim, `${rest.dim} → ${mid.dim}`);
    check('and is fully dimmed again after', Math.abs(back.dim - rest.dim) < 0.005,
      `${back.dim}`);
    check('easing back on the same curve as the slide',
      await p.evaluate(()=>{
        const b = getComputedStyle(document.getElementById('modal-backdrop'));
        const m = getComputedStyle(document.getElementById('modal'));
        return /background-color/.test(b.transitionProperty) &&
               b.transitionDuration === m.transitionDuration &&
               b.transitionTimingFunction === m.transitionTimingFunction;
      }));
    await p.context().close();
  }

  // ---- 4. Up is still scrolling, and so is down from partway ----
  {
    const p=await open(b);
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(800);
    const rest = await where(p, '#modal');
    const up = await touchDrag(p, '#modal', await pointIn(p, '#modal', 500), 0, -220);
    const after = await where(p, '#modal');
    check('a drag up scrolls the sheet', after.scroll > 50, `scrollTop ${after.scroll}`);
    check('without moving the sheet itself', up.seen.every(s => s.top === rest.top));
    const down = await touchDrag(p, '#modal', await pointIn(p, '#modal', 300), 0, 120);
    const end = await where(p, '#modal');
    check('from partway down, a drag down scrolls back up', end.scroll < after.scroll,
      `${after.scroll} → ${end.scroll}`);
    check('rather than pulling the sheet', down.seen.every(s => s.top === rest.top));
    check('and it stays open', await sheetOpen(p));
    await p.context().close();
  }

  // ---- 5. The live picker: its Done bar travels with it ----
  {
    const p=await open(b);
    await p.tap('#nav-outfits-btn');
    await p.waitForFunction(()=>outfitDisplayed.length > 0);
    await p.evaluate(()=>{ closeFilterSheet(); openSlotPicker('Tops'); }); await p.waitForTimeout(600);
    const rest = await where(p, '#modal');
    const {seen, cancels} = await touchDrag(p, '#modal', await pointIn(p, '#modal', 10), 0, 170);
    check('the picker comes down under a finger too', cancels === 0 &&
      seen[seen.length-1].top - rest.top > 80, `${rest.top} → ${seen[seen.length-1].top}`);
    check('its bar coming down with it, not left behind',
      rest.foot !== null && seen.every(s => s.foot === rest.foot),
      [...new Set(seen.map(s=>s.foot))].join(','));
    check('and its grip too', seen.every(s => s.grip === rest.grip));
    check('and it closes', !(await sheetOpen(p)));
    await p.context().close();
  }

  // ---- 6. A sheet holding a draft still ignores the gesture ----
  {
    const p=await open(b);
    await p.evaluate(()=>openItemCapsulePicker('seed_0')); await p.waitForTimeout(600);
    const rest = await where(p, '#modal');
    const {seen} = await touchDrag(p, '#modal', await pointIn(p, '#modal', 40), 0, 170);
    check('a draft sheet does not come down', seen.every(s => s.top === rest.top),
      [...new Set(seen.map(s=>s.top))].join(','));
    check('and stays open', await sheetOpen(p));
    await p.context().close();
  }

  // ---- 6b. Far enough, or fast enough ----
  {
    const p=await open(b);
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(600);
    await touchDrag(p, '#modal', await pointIn(p, '#modal', 10), 0, 112);
    check('a slow pull past 100px closes it', !(await sheetOpen(p)));

    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(600);
    await p.evaluate(()=>{ const m = document.getElementById('modal');
      m.addEventListener('pointerup', ()=>{ window.__flickSpeed = sheetDrag && dragSpeed(performance.now()); }, true); });
    await flick(p, await pointIn(p, '#modal', 10), 90);
    check('a quick flick short of 100px closes it too', !(await sheetOpen(p)),
      `${(await p.evaluate(()=>window.__flickSpeed||0)).toFixed(2)}px/ms`);

    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(600);
    const rest = await where(p, '#modal');
    await flick(p, await pointIn(p, '#modal', 10), 90, 250);
    check('but the same flick held still before letting go does not',
      await sheetOpen(p));
    check('and springs back', (await where(p, '#modal')).top === rest.top);

    await p.evaluate(()=>openItemCapsulePicker('seed_0')); await p.waitForTimeout(600);
    await flick(p, await pointIn(p, '#modal', 40), 90);
    check('a flick on a sheet holding a draft does nothing', await sheetOpen(p) &&
      await p.evaluate(()=>Boolean(document.getElementById('capsule-picks-save'))));
    await p.context().close();
  }

  // ---- 6c. Nothing bounces inside a sheet ----
  {
    const p=await open(b);
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(600);
    check('the sheets do not let iOS bounce their contents',
      await p.evaluate(()=>Array.from(document.querySelectorAll('.modal'))
        .every(m => getComputedStyle(m).overscrollBehaviorY === 'none')));
    await p.context().close();
  }

  // ---- 7. The filter panel shares the gesture ----
  {
    const p=await open(b);
    await p.tap('#nav-outfits-btn'); await p.waitForTimeout(1200);
    await p.evaluate(()=>openFilterSheet()); await p.waitForTimeout(500);
    const across = await p.evaluate(()=>{
      const r = document.querySelector('#sheet-filter-grid').getBoundingClientRect();
      return {x: Math.round(r.left + 150), y: Math.round(r.top + r.height/2)};
    });
    await touchDrag(p, '#filter-sheet', across, -90, 16);
    check('a sideways swipe on the chips leaves the panel up',
      await p.evaluate(()=>filterSheetOpen()));
    const {cancels} = await touchDrag(p, '#filter-sheet', await pointIn(p, '#filter-sheet', 30), 0, 150);
    check('a finger pulling it down puts it away', cancels === 0 &&
      !(await p.evaluate(()=>filterSheetOpen())), `${cancels} pointercancel`);
    await p.context().close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
