// 3-level fave heart and the fave filters.
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
const lvl = p => p.evaluate(()=>document.querySelector('#outfit-gallery .fave-heart').dataset.level);
const chip = (p, v) => p.evaluate(v=>{
  const b=[...document.querySelectorAll('[data-fave-host] .filter-chip')].find(x=>x.offsetParent && x.textContent.includes(v));
  return b ? b.textContent.trim() : null;
}, v);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await boot(b);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);

  const btn = '#outfit-gallery .fave-heart';
  check('heart tap target is at least 44x44', await p.evaluate(s=>{
    const r=document.querySelector(s).getBoundingClientRect(); return r.width>=44&&r.height>=44;}, btn));
  check('aria-label states level and action', await p.evaluate(s=>document.querySelector(s).getAttribute('aria-label'), btn)
    === 'Fave level: Not faved. Tap to change.');

  const cardOpen = () => p.evaluate(()=>Boolean(document.querySelector('#outfit-gallery .outfit-card.expanded')));
  await p.click(btn);
  check('level 1 after one tap', (await lvl(p)) === '1');
  check('tapping the heart does not open the card', !(await cardOpen()));
  await p.click(btn); check('level 2', (await lvl(p)) === '2');
  await p.click(btn); check('level 3', (await lvl(p)) === '3');
  check('level 3 aria-label', (await p.evaluate(s=>document.querySelector(s).getAttribute('aria-label'), btn)).includes('All-time fave'));
  await p.waitForTimeout(800);
  let rows = await p.evaluate(()=>window.__WARDROBE_STATE.saved_outfits);
  check('rapid taps saved only the final level (3)', rows.length===1 && rows[0].fave_level===3 && !rows[0].archived_at,
    JSON.stringify(rows.map(r=>r.fave_level)));
  await p.click(btn); check('3 -> 0 clears', (await lvl(p)) === '0');
  await p.waitForTimeout(800);
  rows = await p.evaluate(()=>window.__WARDROBE_STATE.saved_outfits);
  check('clearing archives with level 0', rows[0].fave_level===0 && Boolean(rows[0].archived_at));

  // keyboard
  await p.focus(btn); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  check('Enter cycles', (await lvl(p)) === '1');
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  check('Space cycles', (await lvl(p)) === '2');
  await p.waitForTimeout(700);

  // filters
  await p.evaluate(()=>openFilterSheet()); await p.waitForTimeout(600);
  check('there is no Not faved chip', !(await chip(p,'Not faved')));
  check('chips carry no count', (await chip(p,'Love')) === 'Love', await chip(p,'Love'));
  check('fave chips are the same size as the other filter chips', await p.evaluate(()=>{
    const f = document.querySelector('[data-fave-host] .filter-chip').getBoundingClientRect();
    const o = document.querySelector('#filter-sheet-body .filter-grid:not([data-fave-host]) .filter-chip');
    return !o || Math.abs(o.getBoundingClientRect().height - f.height) < 1;
  }));
  check('the panel grows to fit instead of scrolling', await p.evaluate(()=>{
    const sh = document.getElementById('filter-sheet'); return sh.scrollHeight <= sh.clientHeight + 1;
  }));
  await p.evaluate(()=>[...document.querySelectorAll('[data-fave-host] .filter-chip')].find(x=>x.textContent.includes('Love')).click());
  await p.waitForTimeout(800);
  check('filter is in the URL', (await p.evaluate(()=>location.search)) === '?fave=2');
  check('only the loved outfit shows', await p.evaluate(()=>document.querySelectorAll('#outfit-gallery .outfit-card, #outfit-hero .outfit-card').length) === 1);
  // change heart while filtered: stays visible
  await p.evaluate(()=>document.querySelector('.fave-heart').click()); await p.waitForTimeout(600);
  check('card stays after its level leaves the filter', await p.evaluate(()=>document.querySelectorAll('.fave-heart').length) >= 1);

  await p.evaluate(()=>[...document.querySelectorAll('[data-fave-host] .filter-chip')].find(x=>x.textContent.includes('Love')).click());
  await p.waitForTimeout(600);
  check('tapping the active chip clears the filter', await p.evaluate(()=>faveFilter.outfits==='all' && location.search===''));
  check('there is no All chip', !(await chip(p,'All')) || (await chip(p,'All')) === 'All-time');
  await p.evaluate(()=>[...document.querySelectorAll('[data-fave-host] .filter-chip')].find(x=>x.textContent.includes('Like')).click());
  await p.waitForTimeout(800);
  check('empty state for a level with nothing',
    (await p.evaluate(()=>document.getElementById('outfit-empty-title').textContent)).startsWith('No likes yet')&&(await p.evaluate(()=>document.getElementById('outfit-empty-hint').textContent)).startsWith('Tap a heart'));

  // Hats are drawn above the clothes, other accessories below.
  const hatOrder = await p.evaluate(()=>{
    const piece = (id, category) => ({ id, category, name: id, photo: null });
    const base = { base:'topbottom', top: piece('t','Tops'), bottom: piece('b','Pants') };
    const hat = piece('h','Hats'), shoe = piece('s','Shoes');
    const html = outfitThumbsHtml({...base, extras:[shoe, hat]});
    const d = document.createElement('div'); d.innerHTML = html;
    const kids = [...d.children].map(c=>c.className.split(' ')[0]+(c.classList.contains('outfit-hats')?'-hats':''));
    return kids.join(',');
  });
  check('hats row comes first, accessories last', /^outfit-extras-hats,.*outfit-extras$/.test(hatOrder), hatOrder);

  await p.reload(); await p.waitForTimeout(300);
  await p.close();

  // refresh keeps the filter on Faves
  const q=await boot(b, '?fave=3&page=faves');
  check('URL opens Faves with the filter', await q.evaluate(()=>appMode==='saved' && faveFilter.saved==='3'));
  check('Faves has no Not faved chip', !(await chip(q,'Not faved')));
  check('Faves empty message', (await q.evaluate(()=>document.getElementById('saved-empty-title').textContent)).startsWith('No all-time faves yet'));
  await q.close();

  await b.close();
  const n=results.filter(Boolean).length; console.log(`\n${n}/${results.length} checks passed`);
  process.exit(n===results.length?0:1);
})();
