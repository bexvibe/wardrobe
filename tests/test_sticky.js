// The row of categories stays in reach while you scroll. Three places want
// it — the wardrobe grid, which scrolls the window, and the capsule editor
// and the accessories picker, which scroll inside their own sheet — and in
// select mode it has to stop under the head that is already up there rather
// than behind it. Anywhere a fourth row appears, it wants this too, which
// the last section here is for.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// The real wardrobe has seven accessories, which is not enough to scroll a
// sheet — so the picker's own section stocks the shelf properly. Anything
// less and the row never reaches the point where it has to stick, and the
// test would pass by not testing.
function withAccessories(n){
  const rows = JSON.parse(seed);
  const one = rows.find(r => r.category === 'Shoes');
  for(let i = 0; i < n; i++){
    rows.push({...one, name: `${one.name} ${i + 2}`});
  }
  return JSON.stringify(rows);
}

async function open(b, seedJson){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seedJson || seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const rowTop = (p, sel) => p.evaluate(s =>
  Math.round(document.querySelector(s).getBoundingClientRect().top), sel);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The wardrobe's row stays at the top of the screen ----
  {
    const p=await open(b);
    const atRest = await rowTop(p, '#tabs');
    check('the row starts below the title, where it always was',
      atRest > 40, `${atRest}px`);
    check('and the title is above it', await p.evaluate(()=>
      document.querySelector('#inventory-view h1').getBoundingClientRect().top <
      document.getElementById('tabs').getBoundingClientRect().top));
    check('nothing is stuck yet', !(await p.evaluate(()=>
      document.getElementById('tabs').classList.contains('is-stuck'))));

    await p.evaluate(()=>window.scrollTo({top:1400})); await p.waitForTimeout(600);
    const scrolled = await rowTop(p, '#tabs');
    check('scrolled a long way down, the row is still on screen',
      scrolled >= 0 && scrolled <= 2, `${scrolled}px`);
    check('the title has gone, as it should — it is not a control',
      await p.evaluate(()=>
        document.querySelector('#inventory-view h1').getBoundingClientRect().bottom < 0));
    check('and the row lifts off the tiles passing under it',
      await p.evaluate(()=>{
        const t = document.getElementById('tabs');
        return t.classList.contains('is-stuck') &&
               getComputedStyle(t).boxShadow !== 'none';
      }));
    check('its background reaches both edges, not just the gutter',
      await p.evaluate(()=>{
        const r = document.getElementById('tabs').getBoundingClientRect();
        return Math.round(r.left) === 0 && Math.round(r.right) === innerWidth;
      }));
    check('and it is painted over the grid, not under it',
      await p.evaluate(()=>{
        const r = document.getElementById('tabs').getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
        return document.getElementById('tabs').contains(hit);
      }));

    // The point of the whole thing: switch category without going back up.
    await p.click('#tabs .tab:has-text("Jackets")'); await p.waitForTimeout(600);
    check('so you can switch category without scrolling back up',
      await p.evaluate(()=>activeTab === 'Jackets'));

    await p.evaluate(()=>window.scrollTo({top:0})); await p.waitForTimeout(600);
    check('back at the top it settles down again',
      !(await p.evaluate(()=>document.getElementById('tabs').classList.contains('is-stuck'))));
    await p.close();
  }

  // ---- 2. In select mode it stops under the head, not behind it ----
  {
    const p=await open(b);
    await p.evaluate(()=>{ editMode = true; render(); }); await p.waitForTimeout(500);
    await p.evaluate(()=>window.scrollTo({top:1400})); await p.waitForTimeout(600);
    const both = await p.evaluate(()=>{
      const head = document.getElementById('wardrobe-head').getBoundingClientRect();
      const tabs = document.getElementById('tabs').getBoundingClientRect();
      return {headTop: Math.round(head.top), headBottom: Math.round(head.bottom),
              tabsTop: Math.round(tabs.top), tabsBottom: Math.round(tabs.bottom)};
    });
    check('the head with the way out is still at the top',
      both.headTop <= 1, JSON.stringify(both));
    check('and the categories stop directly under it, not behind it',
      both.tabsTop >= both.headBottom - 1, JSON.stringify(both));
    check('both are on screen at once',
      both.headBottom > 0 && both.tabsBottom <= 844, JSON.stringify(both));
    check('and the way out is still tappable where it sits',
      await p.evaluate(()=>{
        const b = document.getElementById('edit-back-btn').getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2);
        return document.getElementById('edit-back-btn').contains(hit);
      }));

    // Leaving the mode puts it back to the top of the screen.
    await p.evaluate(()=>{ editMode = false; render(); }); await p.waitForTimeout(500);
    await p.evaluate(()=>window.scrollTo({top:1400})); await p.waitForTimeout(600);
    check('out of the mode it goes back to the top of the screen',
      (await rowTop(p, '#tabs')) <= 2, String(await rowTop(p, '#tabs')));
    await p.close();
  }

  // ---- 3. The capsule editor's row, inside its own scroller ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(800);
    await p.click('#new-capsule-btn'); await p.waitForTimeout(700);
    check('the editor is up with its categories',
      await p.evaluate(()=>document.querySelectorAll('#capsule-tabs .tab').length > 1));

    const before = await rowTop(p, '#capsule-tabs');
    await p.evaluate(()=>{ document.getElementById('modal-backdrop').scrollTop = 1200; });
    await p.waitForTimeout(600);
    const after = await p.evaluate(()=>{
      const head = document.querySelector('#modal .sheet-header').getBoundingClientRect();
      const tabs = document.getElementById('capsule-tabs').getBoundingClientRect();
      return {headBottom: Math.round(head.bottom), tabsTop: Math.round(tabs.top),
              scrolled: document.getElementById('modal-backdrop').scrollTop};
    });
    check('the sheet really scrolled', after.scrolled > 600, String(after.scrolled));
    check('the categories came with it', after.tabsTop < before,
      `${before} -> ${after.tabsTop}`);
    check('and stopped under the back button rather than behind it',
      after.tabsTop >= after.headBottom - 1 && after.tabsTop <= after.headBottom + 2,
      JSON.stringify(after));
    check('the back button is still where you left it',
      await p.evaluate(()=>{
        const b = document.querySelector('#modal .sheet-back').getBoundingClientRect();
        return b.top >= 0 && b.bottom <= 844;
      }));
    check('its background reaches the sheet\'s edges',
      await p.evaluate(()=>{
        const r = document.getElementById('capsule-tabs').getBoundingClientRect();
        const m = document.querySelector('#modal').getBoundingClientRect();
        return Math.round(r.left) === Math.round(m.left) &&
               Math.round(r.right) === Math.round(m.right);
      }));
    check('and you can still switch category from down there',
      await (async()=>{
        await p.click('#capsule-tabs .tab:has-text("Jackets")');
        await p.waitForTimeout(500);
        return p.evaluate(()=>capsuleDraft.tab === 'Jackets');
      })());
    await p.close();
  }

  // ---- 4. Nothing gained a line ----
  {
    const p=await open(b);
    check('the row is a background, not a rule under the chips',
      await p.evaluate(()=>{
        const c = getComputedStyle(document.getElementById('tabs'));
        return c.borderBottomWidth === '0px' && c.borderTopWidth === '0px';
      }));
    check('and the marker it watches takes up no room',
      await p.evaluate(()=>{
        const m = document.querySelector('.stuck-mark');
        return m && Math.round(m.getBoundingClientRect().height) === 0;
      }));
    await p.close();
  }

  // ---- 5. The accessories picker, which is the same idea again ----
  {
    const p=await open(b, withAccessories(20));
    // Keep an outfit, then open its accessories picker from the card.
    await p.click('#nav-outfits-btn');
    await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.click('.outfit-gallery .outfit-fav-btn');
    await p.waitForFunction(()=>favoriteOutfits.length === 1);
    await toFaves(p, 900);
    await p.evaluate(()=>openOutfitExtrasPicker(favoriteOutfits[0].key));
    await p.waitForTimeout(700);
    // Land on the fullest shelf, so there is a sheet worth scrolling.
    const fullest = await p.evaluate(()=>{
      const best = extraTabs().sort((a,b)=>itemsOnShelf(b).length - itemsOnShelf(a).length)[0];
      setExtrasPickerTab(favoriteOutfits[0].key, best);
      return {tab: best, n: itemsOnShelf(best).length};
    });
    await p.waitForTimeout(500);
    check('there is a shelf with enough on it to scroll',
      fullest.n >= 20, `${fullest.tab}: ${fullest.n}`);

    check('the picker is up with its categories',
      await p.evaluate(()=>document.querySelectorAll('#extras-tabs .tab').length > 1));

    const before = await rowTop(p, '#extras-tabs');
    await p.evaluate(()=>{ document.getElementById('modal-backdrop').scrollTop = 1200; });
    await p.waitForTimeout(600);
    const after = await p.evaluate(()=>{
      const head = document.querySelector('#modal .sheet-header').getBoundingClientRect();
      const tabs = document.getElementById('extras-tabs').getBoundingClientRect();
      return {headBottom: Math.round(head.bottom), tabsTop: Math.round(tabs.top),
              scrolled: document.getElementById('modal-backdrop').scrollTop};
    });
    check('the sheet really scrolled', after.scrolled > 400, String(after.scrolled));
    check('the categories came with it', after.tabsTop < before,
      `${before} -> ${after.tabsTop}`);
    check('and stopped under the back button rather than behind it',
      after.tabsTop >= after.headBottom - 1 && after.tabsTop <= after.headBottom + 2,
      JSON.stringify(after));
    check('so you can switch shelf without scrolling back up',
      await (async()=>{
        const tabs = await p.evaluate(()=>Array.from(
          document.querySelectorAll('#extras-tabs .tab')).map(e=>e.textContent.trim()));
        await p.click(`#extras-tabs .tab:has-text("${tabs[1]}")`);
        await p.waitForTimeout(500);
        return p.evaluate(t=>extrasPickerTab === t, tabs[1]);
      })());
    await p.close();
  }

  // ---- 6. Every category row in the app sticks ----
  {
    const p=await open(b);
    // The four of them: the wardrobe's own, the capsule editor's, the
    // accessories picker's and the outfit builder's. If a fifth is ever
    // added, this fails until it is wired up too.
    // Read from the file rather than the page: sticking a row rewrites its
    // class attribute, so the live DOM cannot be asked what was written.
    const src = fs.readFileSync(REPO + '/index.html', 'utf8');
    const rows = [...src.matchAll(/class="tabs" id="([a-z-]+)"/g)].map(m => m[1]);
    check('every row of categories in the app is accounted for',
      rows.length === 4, rows.join(', '));
    check('and every one of them is wired to stick',
      rows.every(id => src.includes(`stickSheetTabs('${id}')`) ||
                       src.includes(`stickCategoryRow(document.getElementById('${id}')`)),
      rows.join(', '));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
