const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO=path.join(__dirname,'..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO+'/supabase/seed-items.json','utf8');
const check=(n,p,d)=>console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS={};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);
  const r=await p.evaluate(async()=>{
    const out={};
    const cat=ITEMS.find(i=>i.category); out.cat=cat.category;
    out.byCat=visibleFilteredItems(cat.category.toLowerCase()).includes(cat);
    ITEMS.forEach(ensureItemColour);
    await new Promise(r=>setTimeout(r,4000));
    out.coloured=ITEMS.filter(i=>itemColours(i).length).length;
    out.total=ITEMS.length;
    out.sample=ITEMS.slice(0,6).map(i=>i.name+': '+itemColours(i));
    out.black=visibleFilteredItems('black').length;
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  check('category search matches', r.byCat);
  check('colours detected from photos', r.coloured>0, `${r.coloured}/${r.total}`);
  await b.close();
})();
