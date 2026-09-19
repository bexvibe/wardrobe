// Holding a piece starts a selection. The button that used to do it is gone
// from the resting toolbar, so this is the only way in — and the ways it
// could go wrong (a scroll, the tap that follows) matter as much as the
// happy path.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// The wardrobe stopped printing a count, so count what it actually drew.
const shown = p => p.evaluate(() =>
  document.getElementById('gallery').style.display === 'none'
    ? document.querySelectorAll('#name-list .name-row').length
    : document.querySelectorAll('#gallery .tile').length);


async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

// A real press: down, hold, up — not Playwright's instant click.
async function press(p, selector, ms, drift){
  const box = await p.locator(selector).first().boundingBox();
  const x = box.x + box.width/2, y = box.y + box.height/2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  if(drift){ await p.waitForTimeout(ms/2); await p.mouse.move(x, y + drift); await p.waitForTimeout(ms/2); }
  else { await p.waitForTimeout(ms); }
  await p.mouse.up();
  await p.waitForTimeout(300);
}

const inEdit = p => p.evaluate(()=>editMode);
const selected = p => p.evaluate(()=>Array.from(selectedIds));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The resting toolbar, and getting in ----
  {
    const p=await open(b);
    check('no way-out button at rest', !(await p.isVisible('#edit-back-btn')));
    check('three controls remain',
      (await p.isVisible('#add-item-btn')) && (await p.isVisible('#search-btn')) &&
      (await p.isVisible('#view-toggle-btn')));
    check('and the page is called the wardrobe',
      (await p.textContent('#wardrobe-title')).trim()==='Wardrobe');

    const first = await p.evaluate(()=>document.querySelector('#gallery .tile').dataset.id);
    await press(p, '#gallery .tile', 700);
    check('holding a piece enters select mode', await inEdit(p));
    check('the piece you held is the one selected',
      JSON.stringify(await selected(p))===JSON.stringify([first]),
      (await selected(p)).join(','));
    check('it does not open the piece as well',
      !(await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open'))));
    // Selecting takes the head over: the same back arrow every sheet uses,
    // the mode's own name at the size a sheet titles itself, and the
    // controls that do nothing here step aside.
    check('the sheets\' back arrow appears once there is a mode to leave',
      (await p.isVisible('#edit-back-btn')) &&
      (await p.textContent('#edit-back-btn')).trim()==='Back' &&
      (await p.evaluate(()=>Boolean(document.querySelector('#edit-back-btn .back-glyph')))));
    check('and the head carries no title at all in the mode',
      await p.evaluate(()=>document.getElementById('wardrobe-title').offsetParent === null));
    check('and the count is in the action bar, beside what acts on it',
      (await p.textContent('#bulk-bar')).replace(/\s+/g,' ').trim().startsWith('1 selected'),
      (await p.textContent('#bulk-bar')).replace(/\s+/g,' ').trim());
    check('and the other controls get out of the way',
      !(await p.isVisible('#add-item-btn')) && !(await p.isVisible('#search-btn')) &&
      !(await p.isVisible('#view-toggle-btn')));
    check('the way out is big enough to hit', await p.evaluate(()=>{
      const r=document.getElementById('edit-back-btn').getBoundingClientRect();
      return r.height >= 44 && r.width >= 60;
    }));
    await p.screenshot({path:shot('lp-selected.png')});

    // and back out
    await p.click('#edit-back-btn'); await p.waitForTimeout(400);
    check('Back leaves select mode', !(await inEdit(p)));
    check('and the button goes away again', !(await p.isVisible('#edit-back-btn')));
    check('the title goes back to the page name',
      (await p.textContent('#wardrobe-title')).trim()==='Wardrobe');
    await p.close();
  }

  // ---- 2. The ways it must NOT fire ----
  {
    const p=await open(b);
    await press(p, '#gallery .tile', 120);
    check('a normal tap opens the piece instead',
      !(await inEdit(p)) &&
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open')));
    await p.evaluate(()=>closeModal()); await p.waitForTimeout(300);

    // A scroll starts with a finger on a tile; it must not become a selection.
    await press(p, '#gallery .tile', 700, 60);
    check('dragging away cancels it — a scroll is not a press', !(await inEdit(p)),
      `editMode=${await inEdit(p)}`);
    await p.close();
  }

  // ---- 3. Once in the mode, tapping behaves normally ----
  {
    const p=await open(b);
    await press(p, '#gallery .tile', 700);
    const ids = await p.evaluate(()=>Array.from(document.querySelectorAll('#gallery .tile')).slice(0,3).map(t=>t.dataset.id));

    await p.locator('#gallery .tile').nth(1).click(); await p.waitForTimeout(250);
    await p.locator('#gallery .tile').nth(2).click(); await p.waitForTimeout(250);
    check('tapping adds more pieces', (await selected(p)).length===3, (await selected(p)).join(','));

    await p.locator('#gallery .tile').nth(1).click(); await p.waitForTimeout(250);
    check('tapping a selected piece removes it', (await selected(p)).length===2);
    check('and never opens the detail sheet while selecting',
      !(await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open'))));

    // The archive path still works from here, and no longer asks first — the
    // undo on the toast is the safety net.
    await p.click('button:has-text("Delete selected")'); await p.waitForTimeout(700);
    check('nothing asked "are you sure"',
      await p.evaluate(()=>!Array.from(document.querySelectorAll('button'))
        .some(x=>/Yes, delete/.test(x.textContent))));
    check('and it offered the pieces back instead',
      await p.evaluate(()=>Boolean(document.querySelector('.toast-undo'))));
    check('selected pieces archive, and the mode ends',
      !(await inEdit(p)) && (await shown(p)) === 78,
      String(await shown(p)));
    check('they are archived, not deleted',
      await p.evaluate(()=>window.__WARDROBE_STATE.items.filter(r=>r.archived_at).length)===2);
    await p.close();
  }

  // ---- 4. It works in list view too ----
  {
    const p=await open(b);
    await p.click('#view-toggle-btn'); await p.waitForTimeout(500);
    await press(p, '#name-list .name-row', 700);
    check('holding a row in list view selects it too',
      (await inEdit(p)) && (await selected(p)).length===1);
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
