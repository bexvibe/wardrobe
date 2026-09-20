// An open filter panel is a thing you are doing; going back to the clothes
// is finishing it. A tap on the page or a scroll puts it away by itself, on
// the same curve it arrived by — but a tap inside it, or a scroll of a row
// inside it, is still you using it.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const TAGS={seed_0:['summer'],seed_1:['winter'],seed_2:['summer'],seed_3:['work'],
            seed_4:['evening'],seed_5:['linen'],seed_6:['wool']};
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
  return p;
}
const isOpen = p => p.evaluate(()=>filterSheetOpen());
// Scrolled with a wheel rather than window.scrollBy: the app asks whether
// a finger, a wheel or a key did it, because the page also moves for
// reasons that are not you — a filter shortening it, or the browser
// keeping your place when content above changes.
async function scrollBy(p, dy){
  await p.mouse.move(195, 400);
  await p.mouse.wheel(0, dy);
  await p.waitForTimeout(300);
}
async function reopen(p){
  if(!(await isOpen(p))){ await p.click('#filters-fab'); await p.waitForTimeout(700); }
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Using the panel is not leaving it ----
  {
    const p=await open(b);
    check('the panel is up on arrival', await isOpen(p));

    await p.click('#sheet-tag-chips .tag-chip'); await p.waitForTimeout(500);
    check('tapping a tag inside it keeps it up', await isOpen(p));
    check('and the tag really went on', await p.evaluate(()=>outfitTags.length > 0));

    await p.click('#sheet-filter-grid .filter-chip'); await p.waitForTimeout(500);
    check('opening a picker from inside it keeps it up', await isOpen(p));
    await p.click('.modal .sheet-back'); await p.waitForTimeout(700);
    check('and so does coming back out of the picker', await isOpen(p));

    // The row inside scrolls sideways; that is not scrolling the page.
    await p.evaluate(()=>document.getElementById('sheet-tag-chips').scrollBy({left:120}));
    await p.waitForTimeout(500);
    check('scrolling a row inside it keeps it up', await isOpen(p));

    // A long press opens a sheet part-way through the gesture, so the click
    // that follows lands on neither the chip nor the sheet. That is still
    // not a tap on the page.
    await p.evaluate(()=>document.getElementById('sheet-tag-chips').scrollTo({left:0}));
    await p.waitForTimeout(300);
    const box = await p.locator('#sheet-tag-chips .tag-chip').first().boundingBox();
    await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
    await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
    await p.waitForTimeout(500);
    check('a long press on a tag opens its editor', await p.evaluate(()=>
      Boolean(document.getElementById('tag-edit-input'))));
    check('and leaves the panel where it was', await isOpen(p));
    await p.close();
  }

  // ---- 2. Going back to the page puts it away ----
  {
    const p=await open(b);
    await p.click('#outfit-gallery .outfit-card', {position:{x:20,y:20}});
    await p.waitForTimeout(800);
    check('a tap on the clothes closes it', !(await isOpen(p)));
    check('and it slid rather than vanished', await p.evaluate(()=>{
      const cs = getComputedStyle(document.getElementById('filter-sheet'));
      return cs.transitionProperty.includes('transform') &&
             parseFloat(cs.transitionDuration) > 0;
    }));
    check('the page has its full height back',
      await p.evaluate(()=>getComputedStyle(document.documentElement)
        .getPropertyValue('--sheet-inset').trim() === '0px'));
    check('and the pill is standing by to bring it back',
      await p.evaluate(()=>!document.getElementById('filters-fab').classList.contains('stood-down')));

    await reopen(p);
    check('the pill brings it back', await isOpen(p));
    await p.close();
  }

  // ---- 3. A scroll closes it, a nudge does not ----
  {
    const p=await open(b);
    await scrollBy(p, 10); await p.waitForTimeout(500);
    check('a few pixels of drift leaves it alone', await isOpen(p),
      String(await p.evaluate(()=>Math.round(scrollY))));
    await scrollBy(p, 300); await p.waitForTimeout(700);
    check('scrolling the page closes it', !(await isOpen(p)),
      String(await p.evaluate(()=>Math.round(scrollY))));

    // And it stays closed while you carry on scrolling.
    await scrollBy(p, 400); await p.waitForTimeout(500);
    check('and it stays closed', !(await isOpen(p)));
    await p.close();
  }

  // ---- 4. Arriving somewhere is not scrolling away ----
  {
    const p=await open(b);
    // Leave Outfits partway down, so coming back restores a position.
    await scrollBy(p, 600); await p.waitForTimeout(700);
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(800);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    check('coming back puts you where you were',
      (await p.evaluate(()=>Math.round(scrollY))) > 300,
      String(await p.evaluate(()=>Math.round(scrollY))));
    await reopen(p);
    check('and the panel opened there stays open',
      await isOpen(p), String(await p.evaluate(()=>Math.round(scrollY))));
    await p.close();
  }

  // ---- 5. Faves behaves the same way ----
  {
    const p=await open(b);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(1000);
    await reopen(p);
    check('the panel opens on Faves too', await isOpen(p));
    await p.click('#saved-empty-title').catch(()=>{});
    await scrollBy(p, 200); await p.waitForTimeout(700);
    check('and closes the same way', !(await isOpen(p)));
    await p.close();
  }

  // ---- A filter that shortens the page is not you scrolling away ----
  {
    const p=await open(b);
    // Down the page far enough that narrowing it will make the browser
    // clamp the scroll position — which used to arrive as a scroll nobody
    // made and put the panel away mid-tap.
    await p.evaluate(()=>window.scrollTo({top:1200})); await p.waitForTimeout(700);
    await reopen(p);
    check('the panel is up, well down the page',
      (await isOpen(p)) && (await p.evaluate(()=>scrollY)) > 600,
      String(await p.evaluate(()=>Math.round(scrollY))));

    const before = await p.evaluate(()=>document.documentElement.scrollHeight);
    await p.evaluate(()=>document
      .querySelector('#sheet-tag-chips .tag-chip[data-tag="summer"]').click());
    await p.waitForTimeout(1200);
    const after = await p.evaluate(()=>({
      h: document.documentElement.scrollHeight,
      y: Math.round(scrollY),
      open: filterSheetOpen(),
      on: outfitTags.slice(),
    }));
    check('the filter really did shorten the page', after.h < before,
      `${before} -> ${after.h}`);
    check('and the panel stayed up through it', after.open, JSON.stringify(after));
    check('with the tag actually on', after.on.join() === 'summer', after.on.join());

    // And a real scroll still puts it away, which is the whole point of
    // the behaviour being there.
    await scrollBy(p, -300);
    await p.waitForTimeout(700);
    check('a scroll you did make still closes it', !(await isOpen(p)));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
