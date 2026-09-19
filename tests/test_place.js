// Two ways of not losing your place. A piece listed under an outfit is the
// way to that piece in the wardrobe, and coming back to a tab should put you
// where you were on it — for this visit only.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const TAGS={seed_0:['winter']};

async function open(b, ctx){
  const p = await (ctx || b).newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\nwindow.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  // A second tab in the same browser is already signed in — the session is
  // in localStorage, which is shared, unlike the scroll positions.
  if(await p.isVisible('#gate-login')){
    await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  }
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

const y = p => p.evaluate(()=>Math.round(window.scrollY));
const scrollTo = async (p, top) => { await p.evaluate(t=>window.scrollTo({top:t}), top); await p.waitForTimeout(450); };

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The things she asked to see the back of ----
  {
    const p=await open(b);
    check('no rule under the title',
      await p.evaluate(()=>getComputedStyle(document.querySelector('#inventory-view .page-head'))
        .borderBottomWidth) === '0px');
    await p.click('#nav-outfits-btn');
    await p.waitForFunction(()=>outfitDisplayed.length > 0);
    await p.waitForTimeout(400);
    check('no "an outfit to consider" label over the lead card',
      await p.evaluate(()=>!document.querySelector('.hero-label')));
    check('and no combination count on the page',
      await p.evaluate(()=>!document.getElementById('outfit-count-line')));
    check('the lead card is still there, it just does not announce itself',
      await p.evaluate(()=>Boolean(document.querySelector('.hero-card'))));
    check('nothing on the page says "possible combinations"',
      !/possible combinations/.test(await p.textContent('#outfits-view')));
    await p.close();
  }

  // ---- 2. A piece under an outfit leads to that piece ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn');
    // The stream generates in chunks, so wait for it to have produced
    // something rather than for a number of milliseconds — under a
    // parallel run 900ms is not always enough, and outfitDisplayed is
    // empty when this reaches into it.
    // Open a card with more than one piece in it, so "its pieces" is a list
    // rather than the one garment a bare dress outfit has — and not the
    // lead card, whose rows are drawn outside the grid this reads.
    const usable = () => `outfitDisplayed.filter(c => comboPieces(c).length >= 2 &&
      (!heroCombo || comboKey(c) !== comboKey(heroCombo)))`;
    await p.waitForFunction(new Function(`return ${usable()}.length > 0`));
    await p.evaluate(new Function(`
      const many = ${usable()}[0];
      expandedComboKey = comboKey(many);
      renderOutfits();
    `));
    await p.waitForTimeout(500);

    const pieces = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#outfit-gallery .outfit-piece-row'))
        .map(r=>r.querySelector('.p-name').textContent.trim()));
    check('the expanded outfit lists its pieces', pieces.length >= 2, pieces.join(', '));
    check('and every row is offered as a way in',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#outfit-gallery .outfit-piece-row'))
        .every(r=>r.classList.contains('tappable') && r.querySelector('.piece-go'))));

    const wanted = pieces[0];
    await p.locator('#outfit-gallery .outfit-piece-row').first().click();
    await p.waitForTimeout(700);

    const landed = await p.evaluate(n=>{
      const item = ITEMS.find(i=>i.name===n);
      return {
        mode: appMode,
        tab: activeTab,
        wantedTab: tabForItem(item),
        modalOpen: document.getElementById('modal-backdrop').classList.contains('open'),
        title: document.querySelector('#outfits-view h1').textContent.trim(),
        sheetName: (document.querySelector('.modal-name')||{textContent:''}).textContent.trim(),
        trail: sheetTrail.map(e=>e.sheet),
      };
    }, wanted);
    // It used to throw you onto the Wardrobe, on the piece's own category,
    // and going back left you there rather than on the outfit you were
    // reading. The sheet opens over the page you are on instead.
    check('tapping it opens the piece where you stand', landed.modalOpen &&
      landed.sheetName === wanted, `${landed.sheetName} vs ${wanted}`);
    check('and leaves you on Outfits', landed.mode==='outfits' && landed.title==='Outfits',
      `${landed.mode} / ${landed.title}`);
    check('the wardrobe is not moved to the piece\'s category behind your back',
      landed.tab !== landed.wantedTab || landed.tab === 'All', landed.tab);
    check('one step on the trail, so back is the outfit you came from',
      JSON.stringify(landed.trail)===JSON.stringify(['item']), landed.trail.join(' > '));

    await p.click('.modal .sheet-back'); await p.waitForTimeout(700);
    check('and back puts you there', await p.evaluate(()=>appMode==='outfits' &&
      !document.getElementById('modal-backdrop').classList.contains('open')));

    // The search no longer has to be cleared: nothing navigates to the
    // wardrobe's grid any more, so there is no grid to arrive at without
    // the piece in it. The search simply stays where you left it.
    await p.evaluate(()=>closeModal()); await p.waitForTimeout(300);
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(500);
    await p.click('#search-btn'); await p.waitForTimeout(400);
    await p.fill('#filter-search', 'zzzz-nothing'); await p.waitForTimeout(400);
    await p.click('#nav-outfits-btn');
    await p.waitForFunction(()=>outfitDisplayed.length > 0);
    await p.waitForTimeout(400);
    await p.evaluate(()=>{ expandedComboKey = null; renderOutfits(); });
    await p.waitForTimeout(300);
    await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(500);
    await p.locator('#outfit-gallery .outfit-piece-row').first().click();
    await p.waitForTimeout(700);
    check('and opening a piece does not reach over and change the wardrobe',
      await p.evaluate(()=>appMode === 'outfits'));
    await p.close();
  }

  // ---- 3. The same from Faves ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn');
    await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    // The docked panel covers the bottom third of the screen, and a
    // generated card's height depends on which clothes it drew — so the
    // heart on the second card is sometimes under the panel. Put the panel
    // away first, the way you would before tapping something beneath it.
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.click('.outfit-gallery .outfit-fav-btn');
    await p.waitForFunction(()=>favoriteOutfits && favoriteOutfits.length === 1);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(700);
    await p.click('#saved-gallery .outfit-card');
    // Waited for rather than slept through: under a parallel run the
    // expand can take longer than any number you would have picked.
    await p.waitForSelector('#saved-gallery .outfit-piece-row.tappable');
    check('a kept outfit lists its pieces the same way',
      await p.evaluate(()=>document.querySelectorAll('#saved-gallery .outfit-piece-row.tappable').length >= 2));
    await p.locator('#saved-gallery .outfit-piece-row').first().click();
    await p.waitForTimeout(700);
    check('and they open the piece without taking you off Faves',
      await p.evaluate(()=>appMode==='saved' &&
        document.getElementById('modal-backdrop').classList.contains('open')));
    await p.close();
  }

  // ---- 4. Each tab remembers where you were ----
  {
    const p=await open(b);
    await scrollTo(p, 1400);
    const wardrobeAt = await y(p);
    check('scrolled down the wardrobe', wardrobeAt > 1000, String(wardrobeAt));

    await p.click('#nav-capsules-btn'); await p.waitForTimeout(700);
    check('a different tab starts at its own top', (await y(p)) === 0, String(await y(p)));

    await p.click('#nav-inventory-btn'); await p.waitForTimeout(800);
    check('coming back to the wardrobe puts you where you were',
      Math.abs((await y(p)) - wardrobeAt) <= 2, `${await y(p)} vs ${wardrobeAt}`);

    // Two tabs at once, each with its own place.
    await p.click('#nav-outfits-btn');
    await p.waitForFunction(()=>outfitDisplayed.length > 0);
    await p.waitForTimeout(400);
    await scrollTo(p, 700);
    const outfitsAt = await y(p);
    check('and Outfits keeps its own', outfitsAt > 300, String(outfitsAt));
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(800);
    check('the wardrobe is still at the wardrobe position',
      Math.abs((await y(p)) - wardrobeAt) <= 2, `${await y(p)} vs ${wardrobeAt}`);
    await p.click('#nav-outfits-btn');
    await p.waitForFunction(()=>outfitDisplayed.length > 0);
    await p.waitForTimeout(400);
    // Loosely: a lazily-loaded photo settling after the restore can shift the
    // page by a row. What is being tested is that it came back near where it
    // was rather than to the top.
    check('and Outfits at the Outfits one',
      Math.abs((await y(p)) - outfitsAt) <= 120, `${await y(p)} vs ${outfitsAt}`);

    // A reload is the same visit, so it lands where you were.
    await p.click('#nav-inventory-btn'); await p.waitForTimeout(800);
    await p.reload(); await p.waitForTimeout(1200);
    check('a reload inside the same visit lands where you were',
      Math.abs((await y(p)) - wardrobeAt) <= 40, `${await y(p)} vs ${wardrobeAt}`);
    await p.close();
  }

  // ---- 5. A new visit starts at the top ----
  {
    const ctx = await b.newContext({viewport:{width:390,height:844}});
    const p = await open(b, ctx);
    await scrollTo(p, 1400);
    check('scrolled down in the first visit', (await y(p)) > 1000);
    await p.close();

    // A second tab in the same browser is a new session: sessionStorage is
    // per tab, so nothing carries over.
    const q = await open(b, ctx);
    check('a new visit starts the wardrobe at the top', (await y(q)) === 0, String(await y(q)));
    check('and remembers nothing from the last one',
      await q.evaluate(()=>Object.keys(scrollPositions).length === 0 ||
        Object.values(scrollPositions).every(v=>v===0)));
    await q.close();
    await ctx.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
