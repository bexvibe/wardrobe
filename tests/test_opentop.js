// An outfit or capsule always opens at the top, not wherever the last one
// was left: the page layer is shared, so it has to be put back.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:500}});
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
  await p.evaluate(()=>{ saveCapsule({id:null,name:'Top test',itemIds:ITEMS.slice(0,12).map(i=>i.id)}); });
  await p.waitForTimeout(600);
  const top = () => p.evaluate(()=>document.getElementById('outfit-page').scrollTop);
  const scrollDown = async () => { await p.evaluate(()=>{ const l=document.getElementById('outfit-page'); l.firstElementChild.style.minHeight='3000px'; l.scrollTop=400; }); await p.waitForTimeout(500); };

  await p.evaluate(()=>openOutfitPage(comboKey(outfitDisplayed[0]), null)); await p.waitForTimeout(700);
  await scrollDown();
  check('(setup) the outfit page was scrolled down', (await top()) > 100, JSON.stringify(await p.evaluate(()=>{const l=document.getElementById('outfit-page');return [l.className,l.scrollHeight,l.clientHeight,l.scrollTop]})));
  await p.evaluate(()=>closeModal()); await p.waitForTimeout(600);
  await p.evaluate(()=>openOutfitPage(comboKey(outfitDisplayed[1]), null)); await p.waitForTimeout(700);
  check('the next outfit opens at the top', (await top()) === 0, String(await top()));
  check('and folded back to a card', await p.evaluate(()=>!document.getElementById('outfit-page').classList.contains('expanded')));
  await scrollDown();
  await p.evaluate(()=>closeModal()); await p.waitForTimeout(600);
  await p.evaluate(()=>openCapsulePage(capsules[0].id, null)); await p.waitForTimeout(700);
  check('a capsule opens at the top too', (await top()) === 0, String(await top()));
  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`${ok}/${results.length} checks passed`); process.exit(ok===results.length?0:1);
})();
