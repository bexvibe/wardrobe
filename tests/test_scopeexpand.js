// An outfit opened inside a piece's sheet must not touch the capsule open behind it.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  const caps=[{id:'cap_a',name:'Summer',archived_at:null,created_at:'2026-01-01'}];
  const mem=[69,68,3,4,32,9].map(i=>({capsule_id:'cap_a',item_id:'seed_'+i,created_at:'2026-01-01'}));
  await p.route('**/vendor/supabase-js-*.js',r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__SEED_CAPSULES=${JSON.stringify(caps)};window.__SEED_CAPSULE_ITEMS=${JSON.stringify(mem)};\n${fake}`}));
  await p.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(500);
  await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
  await p.click('#capsule-gallery .outfit-card'); await p.waitForTimeout(700);
  await p.click('#capsule-gallery .outfit-piece-row >> nth=2'); await p.waitForTimeout(1500);

  const behind = () => p.evaluate(()=>({
    y:Math.round(scrollY),
    closing:document.querySelectorAll('#capsule-gallery .outfit-expanded-panel.closing').length,
    panelOpacity:getComputedStyle(document.querySelector('#capsule-gallery .outfit-expanded-panel')).opacity,
    h:Math.round(document.querySelector('#capsule-gallery .outfit-card.expanded').getBoundingClientRect().height)}));
  const before = await behind();
  const n = await p.evaluate(()=>document.querySelectorAll('#modal-outfits-container .outfit-card').length);
  check('the piece sheet lists outfits', n > 1, String(n));

  // open one, then another (the second also fades the first one's panel)
  await p.click('#modal-outfits-container .outfit-card >> nth=0'); await p.waitForTimeout(700);
  check('an outfit in the sheet opens', await p.evaluate(()=>Boolean(document.querySelector('#modal-outfits-container .outfit-card.expanded'))));
  await p.click('#modal-outfits-container .outfit-card:not(.expanded) >> nth=0'); await p.waitForTimeout(900);
  const after = await behind();
  check('the capsule behind did not scroll', after.y === before.y, `${before.y} -> ${after.y}`);
  check('the capsule behind kept its panel visible', after.closing === 0 && after.panelOpacity === '1', JSON.stringify(after));
  check('the capsule behind kept its height', after.h === before.h, `${before.h} -> ${after.h}`);

  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  process.exit(ok===results.length?0:1);
})();
