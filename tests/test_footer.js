// An editor's Save is pinned to the bottom of the screen rather than sitting
// at the end of a form you have to scroll to reach, and Cancel is the ← at
// the top instead of a second button beside it. The two editors — a piece and
// a capsule — follow the same pattern.
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
  const btn = f.querySelector('.btn').getBoundingClientRect();
  const body = document.querySelector(sel + ' .modal-body');
  return {
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    left: Math.round(r.left), right: Math.round(r.right),
    fixed: getComputedStyle(f).position,
    btnW: Math.round(btn.width), btnH: Math.round(btn.height),
    btnLabel: f.querySelector('.btn').textContent.trim(),
    secondaries: f.querySelectorAll('.btn.secondary').length,
    bodyPadBottom: Math.round(parseFloat(getComputedStyle(body).paddingBottom)),
    fold: window.innerHeight, vw: window.innerWidth,
  };
}, scope);

// A second way out down beside the save. The header's back button is not
// one of these — it is up at the top, which is the whole point.
const bottomWaysOut = (p, scope) => p.evaluate(sel =>
  Array.from(document.querySelectorAll(sel + ' .sheet-footer button, ' +
                                       sel + ' .modal-body button'))
    .filter(x => x.offsetParent !== null &&
                 /^(cancel|back|discard)$/i.test(x.textContent.trim()))
    .length, scope);

async function assertPattern(p, scope, label, name){
  const f = await footer(p, scope);
  check(`${name}: the save is pinned to the screen`, f && f.fixed === 'fixed', f && f.fixed);
  check(`${name}: and sits at the very bottom of it`,
    f.bottom >= f.fold - 1, `${f.top}–${f.bottom} of ${f.fold}`);
  check(`${name}: full width, edge to edge`,
    f.left === 0 && f.right === f.vw, `${f.left}–${f.right} of ${f.vw}`);
  check(`${name}: it is the save`, f.btnLabel === label, f.btnLabel);
  check(`${name}: with a thumb-sized target`, f.btnH >= 44 && f.btnW > 200,
    `${f.btnW}x${f.btnH}`);
  check(`${name}: no second button beside it`, f.secondaries === 0);
  check(`${name}: the form leaves room, so no field hides under it`,
    f.bodyPadBottom >= f.bottom - f.top, `${f.bodyPadBottom}px of padding vs a ${f.bottom-f.top}px bar`);
  check(`${name}: no second way out at the bottom`, (await bottomWaysOut(p, scope)) === 0);
  check(`${name}: the way out is the back button at the top`,
    (await p.textContent(scope + ' .sheet-back')).trim() === 'Back',
    (await p.textContent(scope + ' .sheet-back')).trim());
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Adding a piece ----
  {
    const p=await open(b);
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    await assertPattern(p, '#form-backdrop', 'Save', 'new piece');

    // It has to still be reachable after scrolling to the end of a long form.
    await p.evaluate(()=>document.getElementById('form-backdrop').scrollTo({top:9999}));
    await p.waitForTimeout(400);
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
    await assertPattern(p, '#form-backdrop', 'Save', 'edit piece');
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
