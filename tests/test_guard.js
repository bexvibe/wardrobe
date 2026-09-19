// Three things: the filter chips no longer dim, the page title is smaller,
// and backing out of half-written work stops to ask.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const CAPS=[{id:'c1', name:'Weekend', archived_at:null, created_at:'2026-01-01',
             itemIds:['seed_0','seed_1']}];

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\nwindow.__WITH_CAPSULES=true;\nwindow.__SEED_CAPSULES=${JSON.stringify(CAPS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

const confirmOpen = p => p.evaluate(()=>
  document.getElementById('confirm-backdrop').classList.contains('open'));
const confirmText = p => p.evaluate(()=>({
  title: document.getElementById('confirm-title').textContent.trim(),
  body:  document.getElementById('confirm-body').textContent.trim(),
}));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Nothing greys out any more ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    check('no dimming rule is left in the stylesheet',
      !(await p.evaluate(()=>document.documentElement.innerHTML.includes('filter-chip.moot'))));
    check('and no code decides a slot is moot',
      await p.evaluate(()=>typeof slotIsMoot === 'undefined'));

    // Pin the shape to dresses — the state that used to dim Top and Bottom.
    await p.evaluate(()=>{ outfitFilters['Tops'] = {type:'none', ids:[]};
                           renderFilterControls(); resetOutfitResults(); });
    await p.waitForTimeout(500);
    const chips = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#sheet-filter-grid .filter-chip')).map(e=>({
        label: e.childNodes[0].textContent.trim(),
        moot: e.classList.contains('moot'),
        opacity: getComputedStyle(e).opacity,
      })));
    check('with the shape pinned to dresses, no chip is dimmed',
      chips.every(c=>!c.moot && c.opacity === '1'), JSON.stringify(chips));
    check('the filter still does its job',
      await p.evaluate(()=>outfitDisplayed.every(c=>c.base==='dress')));
    await p.close();
  }

  // ---- 2. The title is smaller than it was, but still the heading ----
  {
    const p=await open(b);
    const size = n => p.evaluate(()=>parseFloat(getComputedStyle(
      document.querySelector('#app-root h1:not([hidden])')).fontSize));
    const px = await p.evaluate(()=>{
      const h = Array.from(document.querySelectorAll('#app-root h1'))
        .find(e=>e.offsetParent !== null);
      return {size: parseFloat(getComputedStyle(h).fontSize), text: h.textContent.trim()};
    });
    check('the wardrobe title is about 28px', Math.abs(px.size - 28) < 1.5,
      `${px.size}px on "${px.text}"`);
    check('still under the 35px it started at', px.size < 35, `${px.size}px`);
    // The thing 19px got wrong: the tab pills read as the heading instead.
    check('and still outweighs the tabs under it',
      await p.evaluate(()=>{
        const h = Array.from(document.querySelectorAll('#app-root h1')).find(e=>e.offsetParent);
        const tab = document.querySelector('#tabs .tab');
        return parseFloat(getComputedStyle(h).fontSize) >
               parseFloat(getComputedStyle(tab).fontSize) * 1.6;
      }));
    check('and it still does not wrap',
      await p.evaluate(()=>{
        const h = Array.from(document.querySelectorAll('#app-root h1')).find(e=>e.offsetParent);
        return h.getBoundingClientRect().height < parseFloat(getComputedStyle(h).fontSize) * 1.5;
      }));
    await p.close();
  }

  // ---- 3. An untouched form leaves without a word ----
  {
    const p=await open(b);
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    await p.click('#form-backdrop .sheet-back'); await p.waitForTimeout(400);
    check('a new piece form you typed nothing into just closes',
      !(await confirmOpen(p)) &&
      !(await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('open'))));

    // And an edit put back the way you found it is also untouched.
    await p.click('#gallery .tile'); await p.waitForTimeout(400);
    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(500);
    const was = await p.inputValue('#form-name');
    await p.fill('#form-name', was + 'x'); await p.waitForTimeout(150);
    await p.fill('#form-name', was); await p.waitForTimeout(150);
    await p.click('#form-backdrop .sheet-back'); await p.waitForTimeout(400);
    check('an edit you undid yourself leaves quietly too', !(await confirmOpen(p)));
    await p.close();
  }

  // ---- 4. A half-written piece asks ----
  {
    const p=await open(b);
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    await p.fill('#form-brand', 'Toteme'); await p.waitForTimeout(150);
    await p.click('#form-backdrop .sheet-back'); await p.waitForTimeout(400);
    check('one field filled in is enough to be asked', await confirmOpen(p));
    const t = await confirmText(p);
    check('it asks "Go back?"', t.title === 'Go back?', t.title);
    check('and names what would be lost', t.body === "Your new piece won't be saved.", t.body);
    check('the form is still open behind it',
      await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('open')));
    check('the dialog is above the sheet it is asking about',
      await p.evaluate(()=>Number(getComputedStyle(document.getElementById('confirm-backdrop')).zIndex) >
                           Number(getComputedStyle(document.getElementById('form-backdrop')).zIndex)));
    check('both ways out are thumb-sized', await p.evaluate(()=>
      ['confirm-stay','confirm-go'].every(id =>
        document.getElementById(id).getBoundingClientRect().height >= 44)));
    // "Go back" could have meant back into the form or back out of it. Each
    // button names what it does instead of naming a direction.
    check('and each names what it does, not which way it goes',
      await p.evaluate(()=>
        document.getElementById('confirm-stay').textContent.trim()==='Keep editing' &&
        document.getElementById('confirm-go').textContent.trim()==='Discard'),
      await p.evaluate(()=>document.getElementById('confirm-go').textContent.trim()));

    await p.click('#confirm-stay'); await p.waitForTimeout(400);
    check('Keep editing puts you back in the form',
      !(await confirmOpen(p)) &&
      (await p.inputValue('#form-brand')) === 'Toteme');

    await p.click('#form-backdrop .sheet-back'); await p.waitForTimeout(300);
    await p.click('#confirm-go'); await p.waitForTimeout(400);
    check('Discard closes the form and the question with it',
      !(await confirmOpen(p)) &&
      !(await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('open'))));
    check('and nothing was written',
      await p.evaluate(()=>!ITEMS.some(i=>i.brand === 'Toteme')));
    await p.close();
  }

  // ---- 5. Editing an existing piece says so ----
  {
    const p=await open(b);
    await p.click('#gallery .tile'); await p.waitForTimeout(400);
    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(500);
    await p.fill('#form-brand', 'Toteme'); await p.waitForTimeout(150);
    await p.click('#form-backdrop .sheet-back'); await p.waitForTimeout(400);
    check('an edit in progress is named as changes, not a new piece',
      (await confirmText(p)).body === "Your changes to this piece won't be saved.",
      (await confirmText(p)).body);
    await p.click('#confirm-go'); await p.waitForTimeout(400);
    // Backing out of the form returns to the piece you were editing rather
    // than to the bare grid, so that sheet is put away before carrying on.
    check('and you land back on the piece, not the grid behind it',
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open')));
    await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);

    // Saving must not ask — the work has gone somewhere.
    await p.click('#gallery .tile'); await p.waitForTimeout(400);
    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(500);
    await p.fill('#form-brand', 'Toteme'); await p.waitForTimeout(150);
    await p.click('#form-save-btn'); await p.waitForTimeout(900);
    check('saving never asks', !(await confirmOpen(p)));
    check('and the form is gone',
      !(await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('open'))));
    check('leaving you on the piece you were editing',
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open')));
    await p.close();
  }

  // ---- 6. The capsule editor keeps the same bargain ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(800);
    await p.click('#new-capsule-btn'); await p.waitForTimeout(500);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
    check('an empty new capsule closes without asking', !(await confirmOpen(p)));

    await p.click('#new-capsule-btn'); await p.waitForTimeout(500);
    await p.fill('#capsule-name-input', 'Spring'); await p.waitForTimeout(200);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
    check('a named one asks', await confirmOpen(p));
    check('and calls it a new capsule',
      (await confirmText(p)).body === "Your new capsule won't be saved.",
      (await confirmText(p)).body);
    await p.click('#confirm-stay'); await p.waitForTimeout(300);

    // Picking a piece counts as work even with no name typed.
    await p.fill('#capsule-name-input', ''); await p.waitForTimeout(200);
    await p.click('#capsule-editor-gallery .tile'); await p.waitForTimeout(300);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
    check('choosing a piece counts as work too', await confirmOpen(p));
    await p.click('#confirm-go'); await p.waitForTimeout(500);
    check('and going back leaves no capsule behind',
      await p.evaluate(()=>capsules.length === 1));
    await p.close();
  }

  // ---- 7. Editing an existing capsule ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(800);
    await p.evaluate(()=>openCapsuleEditor('c1')); await p.waitForTimeout(600);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
    check('opening a capsule and closing it again does not ask',
      !(await confirmOpen(p)));

    await p.evaluate(()=>openCapsuleEditor('c1')); await p.waitForTimeout(600);
    await p.fill('#capsule-name-input', 'Weekend away'); await p.waitForTimeout(200);
    await p.click('.modal .sheet-back'); await p.waitForTimeout(400);
    check('a renamed one asks, and says changes',
      (await confirmOpen(p)) &&
      (await confirmText(p)).body === "Your changes to this capsule won't be saved.",
      (await confirmText(p)).body);
    await p.click('#confirm-go'); await p.waitForTimeout(500);
    check('the name on the list is unchanged',
      await p.evaluate(()=>capsules[0].name === 'Weekend'),
      await p.evaluate(()=>capsules[0].name));
    await p.close();
  }

  // ---- 8. The back button reads the same everywhere ----
  {
    const p=await open(b);
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    check('the piece form says Back, like every other sheet',
      (await p.textContent('#form-backdrop .sheet-back')).trim() === 'Back',
      (await p.textContent('#form-backdrop .sheet-back')).trim());
    check('no sheet anywhere still says Cancel',
      !(await p.evaluate(()=>/>Cancel</.test(document.documentElement.innerHTML))));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
