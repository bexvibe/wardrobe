// The Outfits page has the wardrobe's sticky bar: layout switch, Filters,
// a quick Faves tap, then the tags used most. List is a layout of the cards
// below the hero; the hero is the same in both.
const { chromium } = require('playwright');
const { toFaves, toAll } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const FAVS = [
  {combo_key:'tb|seed_22|seed_11|none|seed_0|none', base:'topbottom',
   top_id:'seed_22', bottom_id:'seed_11', dress_id:null,
   jumper_id:null, jacket_id:'seed_0', shoe_id:null, extra_ids:[],
   archived_at:null, created_at:'2026-01-01'},
  {combo_key:'tb|seed_23|seed_12|none|none|none', base:'topbottom',
   top_id:'seed_23', bottom_id:'seed_12', dress_id:null,
   jumper_id:null, jacket_id:null, shoe_id:null, extra_ids:[],
   archived_at:null, created_at:'2026-01-02'},
  {combo_key:'dress|seed_32|none|none|none', base:'dress',
   top_id:null, bottom_id:null, dress_id:'seed_32',
   jumper_id:null, jacket_id:null, shoe_id:null, extra_ids:[],
   archived_at:null, created_at:'2026-01-03'},
];

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;`+
         `window.__SEED_OUTFITS=${JSON.stringify(FAVS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const dests = p => p.evaluate(()=>Array.from(
  document.querySelectorAll('#bottom-bar .bottom-btn'))
    .map(e=>e.textContent.trim().replace(/\s+/g,' ')));
const segs = p => p.evaluate(()=>Array.from(document.querySelectorAll('.nav-seg'))
  .map(e=>({id:e.id, on:e.classList.contains('on'), pressed:e.getAttribute('aria-pressed'),
            w:Math.round(e.getBoundingClientRect().width),
            h:Math.round(e.getBoundingClientRect().height)})));
const cards = p => p.evaluate(()=>
  document.querySelectorAll('#saved-view .outfit-card').length);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await open(b);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
  const q = (s, a) => p.evaluate(s, a);
  // The seed has no tags; give it some, with one clearly most used.
  await q(()=>{ ITEMS.slice(0,12).forEach((i,n)=>{ i.tags=['summer'].concat(n<6?['work']:[], n<3?['linen']:[]); });
    renderFiltersFab(); });
  await p.waitForTimeout(300);
  check('the bar is there, with the layout switch first',
    await q(()=>{const k=document.querySelector('#outfit-tabs').children; return k[0].className==='bar-seg' && !!k[0].querySelector('.view-seg');}));
  check('Filters is in the bar', await q(()=>document.querySelector('#outfit-tabs > #filters-fab')?.textContent.trim().startsWith('Filters')));
  check('the bar sticks like the wardrobe row', await q(()=>document.getElementById('outfit-tabs').classList.contains('stuck-row')));
  const quick = await q(()=>Array.from(document.querySelectorAll('#outfit-tabs .bar-chips .tab')).map(e=>e.textContent.trim()));
  check('Faves first, then at most five tags', quick[0]==='Faves' && quick.length>=2 && quick.length<=6, quick.join(', '));
  check('the five are the most used tags', await q(()=>{
    const top=tagsByUse().slice(0,5);
    return Array.from(document.querySelectorAll('#outfit-tabs .bar-chips .tab')).slice(1).every(e=>top.includes(e.textContent.trim()));
  }));
  const tag = quick[1];
  await p.click(`#outfit-tabs .bar-chips .tab:has-text("${tag}")`); await p.waitForTimeout(900);
  check('tapping a tag applies it', await q(t=>outfitTags.includes(t), tag));
  await p.click(`#outfit-tabs .bar-chips .tab:has-text("${tag}")`); await p.waitForTimeout(900);
  check('and again takes it off', await q(()=>outfitTags.length===0));

  const cards = await q(()=>document.querySelectorAll('#outfit-gallery .outfit-card').length);
  check('the grid has cards', cards>0, String(cards));
  await p.click('#outfit-tabs .view-seg'); await p.waitForTimeout(700);
  check('list swaps the cards for rows', await q(()=>document.querySelectorAll('#outfit-gallery .outfit-row').length>0 &&
    document.querySelectorAll('#outfit-gallery .outfit-card').length===0));
  check('a row is pieces and a heart, with no text', await q(()=>{const r=document.querySelector('#outfit-gallery .outfit-row');
    return r.querySelectorAll('img').length>0 && r.textContent.trim()==='' && getComputedStyle(r).borderTopWidth==='0px' && !!r.querySelector('.fave-heart');}));
  check('the hero is still the hero', await q(()=>!!document.querySelector('#outfit-hero .hero-feature')));
  await p.click('#outfit-tabs .bar-chips .quick-faves'); await p.waitForTimeout(1200);
  check('Faves in the bar goes to the faves, in the same layout', await q(()=>appMode==='saved' && document.querySelectorAll('#saved-gallery .outfit-row').length>=0 &&
    document.querySelector('#saved-gallery').classList.contains('as-list')));
  check('and the bar is there too', await q(()=>!!document.querySelector('#saved-tabs > #filters-fab')));
  await p.click('#saved-tabs .view-seg'); await p.waitForTimeout(600);
  check('grid again', await q(()=>!document.querySelector('#saved-gallery').classList.contains('as-list')));
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(800);
  // Tapping a piece on the hero card opens the popup, as ever.
  await p.click('#outfit-hero .hero-slot'); await p.waitForTimeout(700);
  check('tapping a piece in the hero opens the popup', await q(()=>heroPopOpen && !filterSheetOpen()));
  await q(()=>closeHeroPopup());
  // A piece with no photo says its name in the hero and in the cards.
  await q(()=>{ closeFilterSheet(); ITEMS.forEach(i=>{ i.photo=null; }); renderHero(); renderOutfits(); });
  await p.waitForTimeout(400);
  check('no photo: the hero slot shows the name', await q(()=>document.querySelector('#outfit-hero .hero-name')?.textContent.trim().length>0));
  check('and a card shows it too', await q(()=>document.querySelectorAll('#outfit-gallery .no-photo-mini').length>0));
  // Scroll the quick row, flip Faves, and the row stays where it was.
  await q(()=>{ const bar=document.getElementById('outfit-tabs'); bar.style.maxWidth='200px'; bar.scrollLeft=60; });
  const before = await q(()=>document.getElementById('outfit-tabs').scrollLeft);
  await p.evaluate(()=>setMode('saved')); await p.waitForTimeout(500);
  await p.evaluate(()=>setMode('outfits')); await p.waitForTimeout(500);
  check('flipping Faves does not reset the quick row', await q(()=>document.getElementById('outfit-tabs').scrollLeft) === before, String(before));
  // Pickers: search at the foot, level with Back, fully rounded.
  await q(()=>{ openItemForm(); });
  await p.waitForTimeout(600);
  await q(()=>{ openFormTagsPicker(); });
  await p.waitForTimeout(600);
  const g = await q(()=>{
    const i=document.getElementById('form-pick-input'), back=document.querySelector('#modal .sheet-footer .btn.secondary');
    const ri=i.getBoundingClientRect(), rb=back.getBoundingClientRect();
    return {inFooter: !!i.closest('.sheet-footer'), level: Math.abs((ri.top+ri.height/2)-(rb.top+rb.height/2))<2,
            round: parseFloat(getComputedStyle(i).borderRadius)>=20, right: ri.left>rb.right-1};
  });
  check('the picker search sits in the footer beside Back', g.inFooter && g.right, JSON.stringify(g));
  check('level with it, and rounded', g.level && g.round, JSON.stringify(g));
  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
