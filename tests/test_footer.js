// An editor's bar sits at the foot of the sheet rather than at the end of a
// form you have to scroll to reach — and both of its acts are on it: the
// way out on the left, drawn quiet and only as wide as its word, and the
// save on the right, named after what it saves and filling the rest of the
// row. Nothing is left in the top corner. The editors — a piece,
// a capsule, an outfit and a tag — all follow the one pattern.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

// scope is the sheet the editor lives in: the form has its own backdrop.
const footer = (p, scope) => p.evaluate(sel=>{
  const f = document.querySelector(sel + ' .sheet-footer');
  if(!f) return null;
  const r = f.getBoundingClientRect();
  const out = f.querySelector('.btn.secondary');
  const save = f.querySelector('.btn:not(.secondary)');
  const o = out.getBoundingClientRect(), v = save.getBoundingClientRect();
  return {
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    left: Math.round(r.left), right: Math.round(r.right),
    stick: getComputedStyle(f).position,
    split: f.classList.contains('split'),
    outLabel: out.textContent.trim(), saveLabel: save.textContent.trim(),
    outW: Math.round(o.width), outH: Math.round(o.height),
    saveW: Math.round(v.width), saveH: Math.round(v.height),
    order: Math.round(o.left) < Math.round(v.left),
    gap: Math.round(v.left - o.right),
    saveRight: Math.round(v.right),
    innerLeft: Math.round(f.querySelector('.sheet-footer-inner').getBoundingClientRect().left),
    innerRight: Math.round(f.querySelector('.sheet-footer-inner').getBoundingClientRect().right),
    outLeft: Math.round(o.left),
    // What Cancel would measure on its own, with nothing stretching it.
    outNatural: (()=>{ const c = out.cloneNode(true);
      c.style.cssText = 'position:absolute;visibility:hidden;width:auto;flex:none;';
      f.querySelector('.sheet-footer-inner').appendChild(c);
      const w = c.getBoundingClientRect().width; c.remove(); return Math.round(w); })(),
    highest: Math.round(Math.min(o.top, v.top)),
    buttons: f.querySelectorAll('.btn').length,
    backArrow: Boolean(document.querySelector(sel + ' .sheet-back')),
    fold: window.innerHeight, vw: window.innerWidth,
  };
}, scope);

// The sheet is its own scroller now, so scrolling it is scrolling `.modal`
// rather than the window or the backdrop behind it.
const scrollSheetToEnd = async (p, scope) => {
  await p.evaluate(sel=>{
    const el = document.querySelector(sel + ' .modal') || document.querySelector(sel);
    el.scrollTo({top: el.scrollHeight});
  }, scope);
  await p.waitForTimeout(400);
};

// The bar sits in the flow at the end of the sheet rather than floating
// over it, so a field cannot come to rest underneath it. Checked where it
// would show: with the sheet scrolled all the way down.
const hidingUnderTheBar = (p, scope) => p.evaluate(sel=>{
  const f = document.querySelector(sel + ' .sheet-footer').getBoundingClientRect();
  return Array.from(document.querySelectorAll(
      sel + ' .modal-body input, ' + sel + ' .modal-body textarea, ' +
      sel + ' .modal-body select, ' + sel + ' .modal-body button'))
    .filter(e => {
      const r = e.getBoundingClientRect();
      return r.height > 0 && r.bottom > f.top + 1 && r.top < f.bottom;
    })
    .map(e => e.id || e.className || e.tagName);
}, scope);

// Ways out loose in the body of the sheet. There should be none: leaving
// is the bar's left-hand act, said once.
const straysInTheBody = (p, scope) => p.evaluate(sel =>
  Array.from(document.querySelectorAll(sel + ' .modal-body button'))
    .filter(x => x.offsetParent !== null &&
                 /^(cancel|back|discard)$/i.test(x.textContent.trim()))
    .map(x => x.textContent.trim()), scope);

async function assertPattern(p, scope, label, name){
  const f = await footer(p, scope);
  check(`${name}: the bar rides at the foot of the sheet`, f && f.stick === 'sticky', f && f.stick);
  check(`${name}: and sits at the very bottom of the screen`,
    f.bottom >= f.fold - 1, `${f.top}–${f.bottom} of ${f.fold}`);
  check(`${name}: full width, edge to edge`,
    f.left === 0 && f.right === f.vw, `${f.left}–${f.right} of ${f.vw}`);
  check(`${name}: it holds the two acts and nothing else`,
    f.split && f.buttons === 2, `${f.buttons}: ${f.outLabel} / ${f.saveLabel}`);
  check(`${name}: the save is named after what it saves`,
    f.saveLabel === label, f.saveLabel);
  check(`${name}: and the way out is Cancel`, f.outLabel === 'Cancel', f.outLabel);
  check(`${name}: Cancel on the left, so a right thumb falls on the save`, f.order);
  check(`${name}: Cancel keeps to the width of its word`,
    Math.abs(f.outW - f.outNatural) <= 1, `${f.outW}px, ${f.outNatural}px on its own`);
  check(`${name}: and the save fills the rest of the row`,
    f.outLeft === f.innerLeft && f.saveRight === f.innerRight && f.gap >= 12 && f.gap <= 20,
    `${f.innerLeft}–${f.innerRight}: cancel from ${f.outLeft}, ${f.gap}px gap, save to ${f.saveRight}`);
  check(`${name}: so the save is the big target`, f.saveW > f.outW * 2,
    `${f.outW}px / ${f.saveW}px`);
  check(`${name}: both thumb-sized`,
    f.outH >= 44 && f.saveH >= 44 && f.outW >= 70 && f.saveW >= 70,
    `${f.outW}x${f.outH} / ${f.saveW}x${f.saveH}`);
  check(`${name}: and both down where a thumb is`,
    f.highest > f.fold * 0.6, `${f.highest} of ${f.fold}`);
  check(`${name}: nothing left in the top corner to reach for`, !f.backArrow);
  await scrollSheetToEnd(p, scope);
  const hidden = await hidingUnderTheBar(p, scope);
  check(`${name}: and at the end of the form nothing is stuck under it`,
    hidden.length === 0, hidden.join(', '));
  const still = await footer(p, scope);
  check(`${name}: while the bar itself has not moved`,
    still.bottom >= still.fold - 1, `${still.top}–${still.bottom} of ${still.fold}`);
  const strays = await straysInTheBody(p, scope);
  check(`${name}: and leaving is said once, on the bar`,
    strays.length === 0, strays.join(', '));
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Adding a piece ----
  {
    const p=await open(b);
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    await assertPattern(p, '#form-backdrop', 'Save piece', 'new piece');

    // It has to still be reachable after scrolling to the end of a long form.
    await scrollSheetToEnd(p, '#form-backdrop');
    const after = await footer(p, '#form-backdrop');
    check('it stays put when the form is scrolled',
      after.bottom >= after.fold - 1, `${after.top}–${after.bottom}`);

    // And it saves.
    await p.fill('#form-name', 'Footer Test Piece');
    await p.click('#form-save-btn'); await p.waitForTimeout(700);
    check('tapping it saves the piece',
      await p.evaluate(()=>ITEMS.some(i=>i.name==='Footer Test Piece')));
    check('and the sheet closes', !(await p.isVisible('#form-backdrop .modal-body')));
    await p.close();
  }

  // ---- 2. Editing a piece uses the same sheet ----
  {
    const p=await open(b);
    await p.click('#gallery .tile'); await p.waitForTimeout(450);
    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(500);
    await assertPattern(p, '#form-backdrop', 'Save piece', 'edit piece');
    await p.close();
  }

  // ---- 3. The capsule editor ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(700);
    await p.click('#new-capsule-btn'); await p.waitForTimeout(600);
    await assertPattern(p, '#modal', 'Save capsule', 'new capsule');

    await p.fill('#capsule-name-input', 'Footer Capsule');
    await p.locator('#capsule-editor-gallery .picker-tile').nth(0).click();
    await p.click('#capsule-save-btn'); await p.waitForTimeout(800);
    check('the pinned save creates the capsule',
      await p.evaluate(()=>capsules.some(c=>c.name==='Footer Capsule')));

    await p.click('#capsule-gallery .outfit-card'); await p.waitForTimeout(400);
    await p.click('#capsule-gallery button:has-text("Edit capsule")'); await p.waitForTimeout(600);
    await assertPattern(p, '#modal', 'Save capsule', 'edit capsule');
    await p.close();
  }

  // ---- 3b. The other two editors, on the same bar ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn');
    await p.waitForFunction(()=>outfitDisplayed.length > 0);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    await p.evaluate(()=>openOutfitBuilder()); await p.waitForTimeout(700);
    await assertPattern(p, '#modal', 'Save outfit', 'outfit builder');
    // The save waits for an outfit to exist, which is not the same as the
    // bar being half-drawn: Cancel is live from the first frame.
    check('the save waits until there is an outfit to save',
      await p.evaluate(()=>document.getElementById('builder-save-btn').disabled));
    check('while the way out is offered straight away',
      await p.evaluate(()=>!document.querySelector('#modal .sheet-footer .btn.secondary').disabled));
    await p.evaluate(()=>discardOutfitBuilder()); await p.waitForTimeout(500);

    await p.evaluate(()=>openTagEditor('winter')); await p.waitForTimeout(600);
    await assertPattern(p, '#modal', 'Save', 'tag editor');
    // Throwing the tag away is not the same act as leaving without
    // renaming it, so it keeps its own place in the body.
    check('and Delete tag stays in the body, away from the pair',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#modal .modal-body button'))
        .some(b=>b.textContent.trim()==='Delete tag')));
    check('not on the bar with them',
      await p.evaluate(()=>!Array.from(document.querySelectorAll('#modal .sheet-footer .btn'))
        .some(b=>/delete/i.test(b.textContent))));
    await p.close();
  }

  // ---- 4. The counts she asked to see the back of ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(700);
    await p.click('#new-capsule-btn'); await p.waitForTimeout(600);
    const tabs = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#capsule-tabs .tab'))
        .map(t=>({label:t.textContent.trim(), counted:Boolean(t.querySelector('.count'))})));
    check('the editor still offers its category tabs', tabs.length > 3, tabs.map(t=>t.label).join(', '));
    check('and none of them carries a count', tabs.every(t=>!t.counted));
    check('nor does any label end in a number',
      tabs.every(t=>!/\d/.test(t.label)), tabs.map(t=>t.label).join(', '));

    await p.fill('#capsule-name-input', 'Counting');
    await p.locator('#capsule-editor-gallery .picker-tile').nth(0).click();
    await p.locator('#capsule-editor-gallery .picker-tile').nth(1).click();
    await p.click('#capsule-save-btn'); await p.waitForTimeout(800);
    check('the capsules page does not count its capsules',
      await p.evaluate(()=>!document.getElementById('capsule-count-line')));
    check('and a card does not count its pieces',
      await p.evaluate(()=>!document.querySelector('.capsule-count')));
    check('nothing on the page says "piece" or "capsule" as a tally',
      !/\d+\s+(piece|capsule)/.test(await p.textContent('#capsules-view')),
      (await p.textContent('#capsules-view')).replace(/\s+/g,' ').trim().slice(0,80));

    // The wardrobe's own tabs are the same, and have been for a while.
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(500);
    check('the wardrobe tabs are still countless too',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#tabs .tab'))
        .every(t=>!t.querySelector('.count') && !/\d/.test(t.textContent))));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
