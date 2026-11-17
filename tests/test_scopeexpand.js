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
  await p.click('#outfit-page .outfit-piece-row >> nth=2'); await p.waitForTimeout(1500);

  // The capsule is a page; a piece opens over it as a sheet, and an outfit
  // opened from that sheet takes the layer for a while. Coming back has to
  // put the capsule back as it was.
  const behind = () => p.evaluate(()=>({
    y:Math.round(scrollY),
    key:document.getElementById('outfit-page').dataset.key,
    rows:document.querySelectorAll('#outfit-page .outfit-piece-row').length}));
  const before = await behind();
  const n = await p.evaluate(()=>document.querySelectorAll('#modal-outfits-container .outfit-card').length);
  check('the piece sheet lists outfits', n > 1, String(n));

  // open one, then another (the second also fades the first one's panel)
  // An outfit in the sheet opens as a page of its own, over the sheet; going
  // back from it and opening another must leave the capsule behind alone.
  await p.click('#modal-outfits-container .outfit-card >> nth=0'); await p.waitForTimeout(700);
  check('an outfit in the sheet opens', await p.evaluate(()=>{
    const t = sheetTrail[sheetTrail.length - 1];
    return Boolean(t) && t.sheet === 'outfit';
  }));
  await p.click('#outfit-page-back'); await p.waitForTimeout(700);
  await p.click('#modal-outfits-container .outfit-card >> nth=1'); await p.waitForTimeout(700);
  await p.click('#outfit-page-back'); await p.waitForTimeout(900);
  const after = await behind();
  check('the capsule behind did not scroll', after.y === before.y, `${before.y} -> ${after.y}`);
  check('the capsule behind is still the capsule', after.key === before.key, `${before.key} -> ${after.key}`);
  check('and still lists its pieces', after.rows === before.rows && after.rows > 0, `${before.rows} -> ${after.rows}`);

  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  process.exit(ok===results.length?0:1);
})();
