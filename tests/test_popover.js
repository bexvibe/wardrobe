// Item and outfit popovers: the page behind is held still, the item card is
// a fixed-height box that scrolls inside itself, and an outfit card grows to a full
// page once scrolled and shrinks again at the top.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  for(const vh of [844, 1400]){
    const p=await b.newPage({viewport:{width:390,height:vh}});
    p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
    p.setDefaultTimeout(8000);
    await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
      body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\n${fake}`}));
    await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
      body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
    await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
    await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
    await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
    await p.evaluate(()=>window.scrollTo({top:200})); await p.waitForTimeout(200);
    await p.evaluate(()=>openModal(ITEMS[0].id)); await p.waitForTimeout(700);
    const m = await p.evaluate(()=>{
      const el=document.getElementById('modal'), r=el.getBoundingClientRect();
      return {top:r.top, bottom:innerHeight-r.bottom, over:el.scrollHeight>el.clientHeight+1,
        locked:getComputedStyle(document.body).overflow, y:scrollY};
    });
    console.log(vh, JSON.stringify(m));
    check(`${vh}: page behind is locked`, m.locked==='hidden');
    check(`${vh}: card is a fixed box, inset 14px at the foot`, m.top>=40 && Math.abs(m.bottom-14)<=2, JSON.stringify(m));
    await p.screenshot({path:`/tmp/pop-item-${vh}.png`});
    await p.evaluate(()=>closeModal()); await p.waitForTimeout(500);
    check(`${vh}: lock released`, await p.evaluate(()=>getComputedStyle(document.body).overflow!=='hidden'));
    check(`${vh}: scroll kept`, (await p.evaluate(()=>scrollY))>150);
    await p.close();
  }
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\nwindow.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  await p.evaluate(()=>setMode('outfits')); await p.waitForTimeout(900);
  await p.click('#outfits-view .outfit-card'); await p.waitForTimeout(800);
  await p.screenshot({path:'/tmp/pop-outfit-card.png'});
  const cls=()=>p.evaluate(()=>document.getElementById('outfit-page').classList.contains('expanded'));
  check('outfit opens as a card', !(await cls()));
  await p.evaluate(()=>document.getElementById('outfit-page').scrollTo({top:200})); await p.waitForTimeout(700);
  await p.screenshot({path:'/tmp/pop-outfit-full.png'});
  check('scrolling grows it to a page', await cls());
  await p.evaluate(()=>document.getElementById('outfit-page').scrollTo({top:0})); await p.waitForTimeout(700);
  check('back at the top it shrinks', !(await cls()));
  await b.close();
  const bad=results.filter(r=>!r).length; console.log(`${results.length-bad}/${results.length} checks passed`); process.exit(bad?1:0);
})();
