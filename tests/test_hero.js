// The featured card has to end where its contents end — nothing spilling
// past the border — and hold its pick for the session rather than the page
// view.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(ctx){
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  if(await p.isVisible('#gate-login')){
    await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  }
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(600);
  return p;
}
const heroKey = p => p.evaluate(()=>heroCombo ? comboKey(heroCombo) : null);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  const p=await open(ctx);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1000);

  // --- the container fits its contents ---
  const fit = await p.evaluate(()=>{
    const card=document.querySelector('#outfit-hero .outfit-card');
    const cr=card.getBoundingClientRect();
    const kids=Array.from(card.querySelectorAll('.outfit-thumbs img, .outfit-thumbs .no-photo-mini'));
    const overflowBottom=kids.filter(k=>k.getBoundingClientRect().bottom > cr.bottom + 1).length;
    const overflowSide=kids.filter(k=>{
      const r=k.getBoundingClientRect();
      return r.right > cr.right + 1 || r.left < cr.left - 1;
    }).length;
    return {
      pieces:kids.length, overflowBottom, overflowSide,
      cardH:Math.round(cr.height),
      scrollVsClient:[card.scrollHeight, card.clientHeight],
      slack: Math.round(cr.bottom - Math.max(...kids.map(k=>k.getBoundingClientRect().bottom))),
    };
  });
  check('no piece spills out of the bottom of the card', fit.overflowBottom===0,
    `${fit.overflowBottom} of ${fit.pieces} below the border`);
  check('and none spills out of the sides', fit.overflowSide===0);
  check('the card is not scrolling to hide the rest',
    fit.scrollVsClient[0] <= fit.scrollVsClient[1] + 1, fit.scrollVsClient.join(' vs '));
  check('the card ends just after its contents, not far past them',
    fit.slack >= 0 && fit.slack <= 24, `${fit.slack}px of slack below the last piece`);

  // and still leaves room for the docked filter panel under it
  const dock = await p.evaluate(()=>{
    const sheet=document.getElementById('filter-sheet');
    const card=document.querySelector('.hero-card').getBoundingClientRect();
    return {
      open: sheet.classList.contains('open'),
      sheetTop: Math.round(sheet.getBoundingClientRect().top),
      cardBottom: Math.round(card.bottom),
    };
  });
  check('the filter panel is docked open under it', dock.open);
  check('and the card is clear of it',
    dock.cardBottom <= dock.sheetTop, `card ends ${dock.cardBottom}, panel starts ${dock.sheetTop}`);

  // --- held for the session ---
  const first = await heroKey(p);
  await p.click('#nav-inventory-btn'); await p.waitForTimeout(400);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
  check('tabbing away and back keeps the same outfit', await heroKey(p)===first, first);

  await p.reload(); await p.waitForTimeout(1200);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1000);
  check('a page reload keeps it too — it is a session, not a page view',
    await heroKey(p)===first, `${first} -> ${await heroKey(p)}`);

  // Filtering invalidates the pick, because it may no longer be in the pool.
  // Narrow to the shape the current pick is NOT, so it cannot survive and a
  // re-pick is forced rather than merely likely.
  const wasDress = await p.evaluate(()=>heroCombo.base==='dress');
  const opposite = wasDress ? 'topbottom' : 'dress';
  // Shape is set through the base slots now: None on Dress leaves tops and
  // bottoms, None on Top leaves dresses.
  await p.evaluate(d=>{
    outfitFilters = emptySlotFilters();
    // Currently a dress? Rule dresses out. Currently a top and bottom? Rule
    // tops out, which leaves dresses.
    outfitFilters[d ? 'Dresses' : 'Tops'] = {type:'none', ids:[]};
    renderFilterControls();
    resetOutfitResults();
  }, wasDress); await p.waitForTimeout(800);
  check('narrowing to the other shape forces a new pick',
    await heroKey(p) !== first, `${first} -> ${await heroKey(p)}`);
  check('and the new pick belongs to the narrowed pool',
    await p.evaluate(s=>heroCombo.base===s, opposite));
  check('the stored pick is re-signed under the new filters',
    await p.evaluate(()=>{
      const saved=JSON.parse(sessionStorage.getItem('wardrobe-hero-outfit'));
      return saved.signature === heroSignature();
    }));

  await p.close();

  // a genuinely new session starts fresh
  const ctx2=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  const p2=await open(ctx2);
  await p2.click('#nav-outfits-btn'); await p2.waitForTimeout(1000);
  check('a new session is not bound by the old one\'s pick',
    await p2.evaluate(()=>{ try{ return sessionStorage.getItem('wardrobe-hero-outfit') !== null; }catch(e){ return false; } }));
  await p2.screenshot({path:shot('h-outfits.png')});
  await p2.close();

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
