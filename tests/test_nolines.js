// Nothing in the app draws a rule across the page. An object's own edge — a
// card, a chip, a field — is not a divider; a line that spans a surface is.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};
const TAGS={seed_0:['winter'], seed_1:['summer']};
const CAPS=[{id:'cap_a',name:'Winter',archived_at:null,created_at:'2026-01-01'}];
const MEM=[{capsule_id:'cap_a',item_id:'seed_0',created_at:'2026-01-01'}];

// Every element carrying a one-sided border, with what it is.
const rules = p => p.evaluate(()=>{
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    if(el.offsetParent === null && el !== document.body) return;
    const cs = getComputedStyle(el);
    const sides = ['Top','Bottom','Left','Right']
      .filter(s => parseFloat(cs['border' + s + 'Width']) > 0 &&
                   cs['border' + s + 'Style'] !== 'none');
    // All four sides is an object's outline. One or two opposite sides,
    // across something wide, is a rule.
    if(sides.length === 0 || sides.length === 4) return;
    const r = el.getBoundingClientRect();
    if(r.width < 120) return;   // a short edge is decoration, not a divider
    out.push({
      what: el.id || el.className || el.tagName,
      sides: sides.join('+'),
      width: Math.round(r.width),
    });
  });
  return out;
});

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};`
       + `window.__SEED_CAPSULES=${JSON.stringify(CAPS)};window.__SEED_CAPSULE_ITEMS=${JSON.stringify(MEM)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await open(b);

  const places = [
    ['the wardrobe',       async()=>{ await p.click('#nav-inventory-btn'); }],
    ['search open',        async()=>{ await p.click('#search-btn'); }],
    ['search shut',        async()=>{ await p.click('#search-back'); }],
    ['a piece',            async()=>{ await p.click('#gallery .tile'); }],
    ['the edit sheet',     async()=>{ await p.click('.modal button:has-text("Edit")'); }],
    ['the new piece form', async()=>{ await p.click('#form-backdrop .sheet-back');
                                      await p.evaluate(()=>closeModal());
                                      await p.click('#add-item-btn'); }],
    ['outfits',            async()=>{ await p.click('#form-backdrop .sheet-back');
                                      await p.click('#nav-outfits-btn'); }],
    ['an outfit open',     async()=>{ await p.click('.hero-card'); }],
    ['the tag editor',     async()=>{ const c = await p.locator('#sheet-tag-chips .tag-chip').first().boundingBox();
                                      await p.mouse.move(c.x+c.width/2, c.y+c.height/2);
                                      await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up(); }],
    ['faves',              async()=>{ await p.evaluate(()=>closeModal());
                                      await toFaves(p); }],
    ['capsules',           async()=>{ await p.click('#nav-capsules-btn'); }],
    ['a capsule open',     async()=>{ await p.click('#capsule-gallery .outfit-card'); }],
    ['the capsule editor', async()=>{ await p.click('#capsule-gallery button:has-text("Edit capsule")'); }],
    ['the archive',        async()=>{ await p.click('#modal .sheet-back');
                                      await p.evaluate(async()=>{ await archiveItems([ITEMS[0].id]);
                                                                  setMode('archive'); }); }],
  ];

  for(const [name, go] of places){
    await go(); await p.waitForTimeout(600);
    const found = await rules(p);
    check(`no rule across ${name}`, found.length === 0,
      found.map(f=>`${f.what} ${f.sides} @${f.width}px`).join(' | '));
  }

  // The things that are supposed to keep their own edges still have them.
  await p.click('.back-link'); await p.waitForTimeout(500);
  const outlined = await p.evaluate(()=>{
    const edge = sel => {
      const el = document.querySelector(sel);
      if(!el) return null;
      return parseFloat(getComputedStyle(el).borderTopWidth) > 0;
    };
    return { tab: edge('#tabs .tab'), field: edge('#filter-search') };
  });
  check('a chip still has its own outline', outlined.tab === true);
  check('and so does a field', outlined.field === true);

  await p.click('#nav-outfits-btn'); await p.waitForTimeout(800);
  check('the outfit cards still have theirs',
    await p.evaluate(()=>parseFloat(getComputedStyle(
      document.querySelector('#outfit-gallery .outfit-card')).borderTopWidth) > 0));

  // What separates a floating surface from the page now.
  const lift = await p.evaluate(()=>({
    panel: getComputedStyle(document.getElementById('filter-sheet')).boxShadow,
    overlay: getComputedStyle(document.querySelector('.search-overlay')).boxShadow,
  }));
  check('the filter panel is lifted by a shadow instead', /rgba?\(/.test(lift.panel), lift.panel.slice(0,40));
  check('and so is the search bar', /rgba?\(/.test(lift.overlay), lift.overlay.slice(0,40));

  // Add lives on the wardrobe, so go back for it.
  await p.click('#nav-inventory-btn'); await p.waitForTimeout(500);
  await p.click('#add-item-btn'); await p.waitForTimeout(500);
  check('so is the pinned Save bar',
    await p.evaluate(()=>/rgba?\(/.test(getComputedStyle(
      document.querySelector('#form-backdrop .sheet-footer')).boxShadow)));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
