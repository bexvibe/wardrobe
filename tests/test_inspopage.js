// The Inspo destination: every pin from every outfit on one page, grouped
// so a picture kept against several outfits shows once. Tapping one opens
// a page (not a sheet) with the outfits it belongs to as cards.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const A='tb|seed_22|seed_11|none|none|none', B='tb|seed_22|seed_12|none|none|none', C='tb|seed_23|seed_12|none|none|none';
const fav=(k,t,b,d)=>({combo_key:k, base:'topbottom', top_id:t, bottom_id:b, dress_id:null, jumper_id:null, jacket_id:null, shoe_id:null, archived_at:null, created_at:d});
const SAVED=[fav(A,'seed_22','seed_11','2026-01-01'),fav(B,'seed_22','seed_12','2026-01-02'),fav(C,'seed_23','seed_12','2026-01-03')];
const pin=(id,key,url,at)=>({id,combo_key:key,kind:'link',url,image_path:null,image_url:'https://pics.test/'+id+'.png',source:'pinterest.com',archived_at:null,created_at:at});
const INSPO=[
  pin('i1',A,'https://pinterest.com/pin/1','2026-02-01'),
  pin('i2',B,'https://pinterest.com/pin/1','2026-02-02'),   // the same pin, on a second outfit
  pin('i3',C,'https://pinterest.com/pin/3','2026-02-03'),
];

async function open(b, extra){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  const pre = `window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_OUTFITS=${JSON.stringify(SAVED)};${extra||''}`;
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript', body:`${pre}\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.route('**/api/link-preview*', r=>r.fulfill({status:503,body:'no'}));
  await p.route('https://pics.test/**', r=>r.fulfill({contentType:'image/png', body: PNG}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}
const trail = p => p.evaluate(()=>sheetTrail.map(e=>e.sheet).join(' > '));
const live = p => p.evaluate(()=>window.__WARDROBE_STATE.outfit_inspo.filter(r=>!r.archived_at).length);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  { // no table, no destination
    const p=await open(b,'window.__NO_INSPO=true;');
    check('without the table there is no Inspo in the nav', !(await p.isVisible('#nav-inspo-btn')));
    await p.close();
  }
  { // empty
    const p=await open(b,'');
    await p.click('#nav-inspo-btn'); await p.waitForTimeout(400);
    check('empty: the app\'s empty state',
      await p.isVisible('#inspo-empty') &&
      (await p.textContent('#inspo-empty h3')).trim()==='Save your inspo');
    await p.close();
  }
  {
    const p=await open(b,`window.__SEED_INSPO=${JSON.stringify(INSPO)};`);
    check('Inspo is the fourth destination, and the bar still fits the screen',
      await p.evaluate(()=>{ const bar=document.getElementById('bottom-bar').getBoundingClientRect();
        const bs=[...document.querySelectorAll('#bottom-bar .bottom-btn')];
        return bs.length===4 && bs[3].textContent.trim()==='Inspo' && bar.left>=0 && bar.right<=innerWidth; }));
    await p.click('#nav-inspo-btn'); await p.waitForTimeout(500);
    check('the title sits at the top',
      (await p.textContent('#inspo-view h1')).trim()==='Inspo');
    check('the same pin on two outfits is one tile, with a count',
      await p.evaluate(()=>document.querySelectorAll('#inspo-page-grid .inspo-tile').length)===2 &&
      await p.evaluate(()=>document.querySelectorAll('#inspo-page-grid .inspo-count').length)===1);
    check('newest first',
      await p.evaluate(()=>inspoGroups()[0].keys.length===1));

    // open the grouped one (older)
    await p.evaluate(()=>document.querySelectorAll('#inspo-page-grid .inspo-tile')[1].click()); await p.waitForTimeout(700);
    check('it opens as a page over the app, not a bottom sheet',
      (await trail(p))==='inspopage' && await p.evaluate(()=>outfitPageShowing() && !document.getElementById('modal-backdrop').classList.contains('open')));
    check('with the outfits it is saved to as two cards',
      await p.evaluate(()=>document.querySelectorAll('#outfit-page .inspo-outfits .outfit-card').length)===2 &&
      (await p.textContent('#outfit-page .inspo-outfits-title')).includes('2 outfits'));
    check('and Back and Open original on the bar',
      await p.isVisible('#outfit-page-back') && (await p.getAttribute('#inspo-open','href'))==='https://pinterest.com/pin/1');

    // a card goes to that outfit, and Back comes back here
    await p.click('#outfit-page .inspo-outfits .outfit-card'); await p.waitForTimeout(700);
    check('a card opens that outfit', (await trail(p))==='inspopage > outfit');
    await p.click('#outfit-page-back'); await p.waitForTimeout(600);
    check('Back returns to the inspo page', (await trail(p))==='inspopage' &&
      await p.isVisible('#inspo-open'));

    await p.close();
  }
  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
