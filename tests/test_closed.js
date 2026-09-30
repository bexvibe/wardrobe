// The filter panel is shut when you arrive on Outfits or Faves. The pill says
// Show filters; opening it says Hide filters; the panel is titled Filters.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(path.join(__dirname,'..','supabase/seed-items.json'),'utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
const fabText = p => p.evaluate(()=>document.getElementById('filters-fab').textContent.replace(/\s+/g,' ').trim());
const isOpen = p => p.evaluate(()=>filterSheetOpen());

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__FILTERS_OPEN_BY_DEFAULT=[];window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);

  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
  check('closed on Outfits', !(await isOpen(p)));
  check('pill says Show filters', (await fabText(p)).startsWith('Show filters'), await fabText(p));
  await toFaves(p, 900);
  check('closed on Faves', !(await isOpen(p)));

  await p.click('#filters-fab'); await p.waitForTimeout(600);
  check('pill opens it', await isOpen(p));
  check('pill now says Hide filters', (await fabText(p)).startsWith('Hide filters'), await fabText(p));
  const head = await p.evaluate(()=>{
    const t=document.querySelector('.filter-sheet-title').getBoundingClientRect();
    const c=document.getElementById('filter-sheet-clear').getBoundingClientRect();
    return {title:document.querySelector('.filter-sheet-title').textContent.trim(),
      left:t.left, clearRight:c.right, mid:Math.abs((t.top+t.bottom)/2-(c.top+c.bottom)/2)};
  });
  check('titled Filters, top left', head.title==='Filters' && head.left < 60, JSON.stringify(head));
  check('Clear all is on the right, level with it', head.clearRight > 300 && head.mid < 3, JSON.stringify(head));
  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
