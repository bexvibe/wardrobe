// The capsule editor's category row: second-level categories stay folded
// away until their top-level tab is chosen.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  // Make Tops hold two kinds of piece.
  await p.evaluate(()=>{ const tops=ITEMS.filter(i=>i.photo && tabForItem(i)==='Tops'); tops[0].category='Blouses'; tops[1].category='Singlets'; });
  await p.evaluate(()=>openCapsuleEditor(null)); await p.waitForTimeout(600);
  const subs = () => p.evaluate(()=>Array.from(document.querySelectorAll('#capsule-tabs .subtab')).map(e=>e.textContent.trim()));
  const tiles = () => p.evaluate(()=>document.querySelectorAll('#capsule-editor-gallery .tile').length);
  check('no second level on All', (await subs()).length===0);
  await p.click('#capsule-tabs .tab[data-key="Tops"]'); await p.waitForTimeout(300);
  const s = await subs();
  check('choosing Tops opens its categories, A to Z', s.length>1 && JSON.stringify(s)===JSON.stringify(s.slice().sort((a,b)=>a.localeCompare(b))), s.join(','));
  const all = await tiles();
  await p.click('#capsule-tabs .subtab[data-key="sub:Blouses"]'); await p.waitForTimeout(300);
  const one = await tiles();
  check('choosing one narrows the pieces', one>=1 && one<all, `${one} of ${all}`);
  await p.click('#capsule-tabs .subtab[data-key="sub:Blouses"]'); await p.waitForTimeout(300);
  check('choosing it again lifts the filter', (await tiles())===all);
  await p.click('#capsule-tabs .tab[data-key="Pants"]'); await p.waitForTimeout(300);
  check('and another tab folds Tops away', !(await subs()).includes('Blouses'));
  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`${ok}/${results.length} checks passed`); process.exit(ok===results.length?0:1);
})();
