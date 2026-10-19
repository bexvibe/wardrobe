// Redraws update the page in place: photos and cards survive a tap.
const { chromium } = require('playwright');
const { toFaves, toAll } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function boot(b, url){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html' + (url || '')); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(1000);
  return p;
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await boot(b);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);

  // Mark every photo on the page, then open a card.
  const marked = await p.evaluate(()=>{
    const imgs=[...document.querySelectorAll('#outfit-gallery img')];
    imgs.forEach(i=>{ i.__mark = true; });
    return imgs.length;
  });
  check('photos on the page to track', marked > 4, String(marked));
  await p.click('#outfit-gallery .outfit-card >> nth=2'); await p.waitForTimeout(600);
  const after = await p.evaluate(()=>{
    const imgs=[...document.querySelectorAll('#outfit-gallery img')];
    return { total:imgs.length, kept:imgs.filter(i=>i.__mark).length,
      expanded:document.querySelectorAll('#outfit-gallery .outfit-card.expanded').length };
  });
  check('opening a card expands exactly one', after.expanded === 1);
  check('opening a card keeps the photos it had (no reload)', after.kept >= marked, JSON.stringify(after));
  await p.click('#outfit-gallery .outfit-card.expanded .outfit-collapse-btn'); await p.waitForTimeout(600);
  check('collapsing closes it', await p.evaluate(()=>!document.querySelector('#outfit-gallery .outfit-card.expanded')));

  // morphHtml directly: keyed reorder keeps elements, attribute change keeps the node
  const direct = await p.evaluate(()=>{
    const host=document.createElement('div');
    morphHtml(host,'<i data-key="a" class="x">A</i><i data-key="b">B</i><i data-key="c">C</i>');
    const [a,b2,c]=host.children; a.__m=1; b2.__m=2; c.__m=3;
    morphHtml(host,'<i data-key="c">C</i><i data-key="a" class="x on">A2</i>');
    const kids=[...host.children];
    return { n:kids.length, order:kids.map(k=>k.dataset.key).join(''), sameC:kids[0].__m===3, sameA:kids[1].__m===1,
      cls:kids[1].className, text:kids[1].textContent };
  });
  check('morph keeps keyed nodes through reorder and removal', direct.n===2 && direct.order==='ca' && direct.sameC && direct.sameA, JSON.stringify(direct));
  check('morph updates class and text in place', direct.cls==='x on' && direct.text==='A2');

  // A picker tile keeps its element when selected, so the transition can run.
  await p.evaluate(()=>openOutfitBuilder()); await p.waitForTimeout(600);
  const picked = await p.evaluate(()=>{
    const t=document.querySelector('#builder-gallery .picker-tile'); t.__m=1; t.click();
    const t2=document.querySelector('#builder-gallery .picker-tile');
    return { same:t2.__m===1, sel:t2.classList.contains('picker-selected'), tick:Boolean(t2.querySelector('.picker-check')) };
  });
  check('selecting a piece updates the same tile', picked.same && picked.sel && picked.tick, JSON.stringify(picked));

  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  process.exit(ok===results.length?0:1);
})();
