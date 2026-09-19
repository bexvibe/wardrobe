// Safari on iOS zooms the page when it focuses a field whose text is under
// 16px. Every field that can take focus has to clear that, or tapping it
// scales the whole app up.
const { chromium, devices } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // Real iPhone metrics and UA, so anything UA-conditional behaves the same.
  const ctx=await b.newContext({...devices['iPhone 13']});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify({seed_0:['winter']})};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(500);

  const px = sel => p.evaluate(s=>{
    const el=document.querySelector(s);
    return el ? parseFloat(getComputedStyle(el).fontSize) : null;
  }, sel);

  check('password field clears the zoom threshold', (await px('#gate-password')) >= 16,
    `${await px('#gate-password')}px`);

  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);

  await p.click('#search-btn'); await p.waitForTimeout(400);
  check('search field clears the zoom threshold', (await px('#filter-search')) >= 16,
    `${await px('#filter-search')}px`);
  check('the page is still at 1x after focusing search',
    await p.evaluate(()=>Math.abs(window.visualViewport.scale - 1) < 0.01),
    `scale=${await p.evaluate(()=>window.visualViewport.scale.toFixed(2))}`);
  await p.evaluate(()=>closeSearch()); await p.waitForTimeout(300);

  // every field in the add/edit form
  await p.click('#add-item-btn'); await p.waitForTimeout(500);
  const small = await p.evaluate(()=>
    Array.from(document.querySelectorAll('#form-backdrop input, #form-backdrop textarea, #form-backdrop select'))
      .map(el=>({id:el.id||el.tagName, px:parseFloat(getComputedStyle(el).fontSize)}))
      .filter(x=>x.px < 16));
  check('no field in the add form is under 16px', small.length===0, JSON.stringify(small));
  await p.click('#form-backdrop .sheet-back'); await p.waitForTimeout(300);

  // the capsule editor has its own name field
  await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
  await p.click('#new-capsule-btn'); await p.waitForTimeout(500);
  check('capsule name field clears the threshold', (await px('#capsule-name-input')) >= 16,
    `${await px('#capsule-name-input')}px`);

  // and a global sweep of anything focusable that renders text
  const anySmall = await p.evaluate(()=>
    Array.from(document.querySelectorAll('input, textarea, select'))
      .map(el=>({id:el.id||el.type||el.tagName, px:parseFloat(getComputedStyle(el).fontSize)}))
      .filter(x=>x.px < 16));
  check('no focusable field anywhere is under 16px', anySmall.length===0, JSON.stringify(anySmall));

  // pinch-to-zoom must NOT have been taken away to achieve this
  const vp = await p.evaluate(()=>document.querySelector('meta[name=viewport]').content);
  check('pinch-to-zoom is still allowed',
    !/user-scalable\s*=\s*no/.test(vp) && !/maximum-scale/.test(vp), vp);

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
