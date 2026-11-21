// Search is a bar at the foot of the screen that rides above the keyboard.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO=path.join(__dirname,'..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO+'/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.setDefaultTimeout(8000);
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS={};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(600);

  const box = sel => p.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,h:r.height,w:r.width};},sel);
  const vis = sel => p.isVisible(sel);

  check('closed: no search bar showing', !(await vis('#search-overlay')));
  await p.click('#search-btn'); await p.waitForTimeout(300);
  const bar = await box('#search-overlay'), vh = await p.evaluate(()=>innerHeight);
  check('open: the bar sits on the bottom edge', Math.abs(bar.bottom - vh) < 1, `${bar.bottom} of ${vh}`);
  check('and spans the width', bar.left === 0 && Math.round(bar.right) === 390);
  check('the navigation stands down', !(await vis('#bottom-bar')));
  check('the page head stays', (await vis('#wardrobe-head')) && (await vis('#search-btn')));
  check('the search button shows it is on', await p.evaluate(()=>document.getElementById('search-btn').classList.contains('active')));
  const back = await box('#search-back'), field = await box('#filter-search');
  check('Back is first, on the left', back.right <= field.left && back.left < 40);
  check('the field is focused', await p.evaluate(()=>document.activeElement.id==='filter-search'));
  check('Search on the keyboard is offered', await p.evaluate(()=>document.getElementById('filter-search').enterKeyHint==='search'));

  // A keyboard, as the browser reports it: the visible part of the screen gets shorter.
  await p.evaluate(()=>{
    window.__vv = { height: innerHeight - 300, offsetTop: 0, scale: 1, _l: {},
      addEventListener(t,f){ (this._l[t]=this._l[t]||[]).push(f); },
      removeEventListener(t,f){ this._l[t]=(this._l[t]||[]).filter(x=>x!==f); } };
    Object.defineProperty(window,'visualViewport',{value:window.__vv,configurable:true});
    closeSearch(); openSearch();
  });
  await p.waitForTimeout(200);
  const up = await box('#search-overlay');
  check('with the keyboard up, the bar is lifted above it', Math.abs(up.bottom - (vh-300)) < 1, `${up.bottom} vs ${vh-300}`);
  check('and drops the home-indicator padding', await p.evaluate(()=>document.getElementById('search-overlay').classList.contains('keyboard-up')));
  await p.evaluate(()=>{ __vv.height = innerHeight - 340; __vv._l.resize.forEach(f=>f()); });
  const up2 = await box('#search-overlay');
  check('it follows the keyboard as it changes height', Math.abs(up2.bottom - (vh-340)) < 1, `${up2.bottom}`);
  await p.evaluate(()=>{ __vv.height = innerHeight; __vv._l.resize.forEach(f=>f()); });
  const down = await box('#search-overlay');
  check('and comes back down when it goes', Math.abs(down.bottom - vh) < 1);

  // Searching, then Search on the keyboard.
  await p.fill('#filter-search','zzzz-nothing'); await p.waitForTimeout(300);
  check('typing narrows the wardrobe', (await p.locator('#gallery .tile').count()) === 0);
  await p.press('#filter-search','Enter'); await p.waitForTimeout(200);
  check('Search puts the keyboard away', await p.evaluate(()=>document.activeElement.id!=='filter-search'));
  check('and leaves the bar and results', (await vis('#search-overlay')) && (await p.inputValue('#filter-search'))==='zzzz-nothing');

  // A selection takes the same place.
  await p.fill('#filter-search','');
  await p.evaluate(()=>{ editMode = true; render(); }); await p.waitForTimeout(300);
  check('selecting: its own bar takes the foot, search steps aside', !(await vis('#search-overlay')) && (await vis('#bulk-bar')));
  await p.evaluate(()=>{ editMode = false; render(); }); await p.waitForTimeout(300);
  check('and search is back when the selection ends', await vis('#search-overlay'));

  // Back.
  await p.click('#search-back'); await p.waitForTimeout(300);
  check('Back closes it', !(await vis('#search-overlay')));
  check('the navigation returns', await vis('#bottom-bar'));
  check('the keyboard offset is cleared', await p.evaluate(()=>!document.documentElement.style.getPropertyValue('--kb')));
  check('and the query is cleared', (await p.inputValue('#filter-search'))==='');
  check('the button is off again', await p.evaluate(()=>!document.getElementById('search-btn').classList.contains('active')));

  // Opening a piece from the results ends the search, and it stays shut.
  await p.click('#search-btn'); await p.waitForTimeout(200);
  await p.fill('#filter-search','shirt'); await p.waitForTimeout(300);
  await p.click('#gallery .tile'); await p.waitForTimeout(600);
  check('opening a piece ends the search', await p.evaluate(()=>!document.body.classList.contains('searching')
    && !document.getElementById('search-overlay').classList.contains('open')));
  await p.evaluate(()=>closeModal()); await p.waitForTimeout(500);
  check('and it does not come back when the piece closes', !(await vis('#search-overlay')) && (await vis('#bottom-bar')));
  check('the wardrobe is whole again', (await p.locator('#gallery .tile').count()) > 5);

  // Escape and leaving the page are the other ways out.
  await p.click('#search-btn'); await p.waitForTimeout(200);
  await p.press('#filter-search','Escape'); await p.waitForTimeout(200);
  check('Escape closes it', !(await vis('#search-overlay')));
  await p.click('#search-btn'); await p.waitForTimeout(200);
  await p.evaluate(()=>setMode('outfits')); await p.waitForTimeout(300);
  check('so does leaving the wardrobe', !(await vis('#search-overlay')));

  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`${ok}/${results.length} checks passed`); process.exit(ok===results.length?0:1);
})();
