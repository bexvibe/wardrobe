// The hero popup blurs the page behind it; scrolling on it must not move that page.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:800},hasTouch:true});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript', body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
  await p.evaluate(()=>window.scrollTo(0,400)); await p.waitForTimeout(300);
  const before = await p.evaluate(()=>window.scrollY);
  check('the page is scrolled to start with', before > 100, String(before));
  await p.evaluate(()=>openHeroPopup(false)); await p.waitForTimeout(500);
  check('the popup is open', await p.evaluate(()=>heroPopOpen));
  await p.mouse.move(195, 400);
  await p.mouse.wheel(0, 500); await p.waitForTimeout(400);
  check('wheel over the popup leaves the page where it was',
    await p.evaluate(()=>window.scrollY) === before, String(await p.evaluate(()=>window.scrollY)));
  await p.mouse.wheel(0, -300); await p.waitForTimeout(300);
  check('and so does wheeling up', await p.evaluate(()=>window.scrollY) === before);
  check('the page is locked while it is open', await p.evaluate(()=>document.body.classList.contains('sheet-open')));
  // A short pull and let go: it springs back. A long pull: it closes.
  await p.mouse.move(195, 300); await p.mouse.down(); await p.mouse.move(195, 315, {steps:3}); await p.mouse.move(195, 325, {steps:3}); await p.waitForTimeout(400);
  check('a pull follows the finger', await p.evaluate(()=>/translateY\((\d+)/.test(document.getElementById('hero-pop').style.transform)));
  await p.mouse.up(); await p.waitForTimeout(500);
  check('let go short of far enough, it stays open', await p.evaluate(()=>heroPopOpen));
  await p.mouse.move(195, 200); await p.mouse.down(); await p.mouse.move(195, 400, {steps:8}); await p.mouse.move(195, 600, {steps:8});
  await p.mouse.up(); await p.waitForTimeout(600);
  check('pulled down far enough, it closes', await p.evaluate(()=>!heroPopOpen && !document.getElementById('hero-pop-wrap').classList.contains('open')));
  check('and leaves nothing dragged behind', await p.evaluate(()=>document.getElementById('hero-pop').style.transform==='' && !document.getElementById('hero-pop-wrap').classList.contains('dragging')));
  await p.evaluate(()=>closeHeroPopup()); await p.waitForTimeout(400);
  check('closing releases it', await p.evaluate(()=>!document.body.classList.contains('sheet-open')));
  await p.mouse.wheel(0, 200); await p.waitForTimeout(400);
  check('and the page scrolls again', await p.evaluate(()=>window.scrollY) > before);
  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
