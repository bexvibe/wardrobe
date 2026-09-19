// The Outfits tab should keep any combination containing at least one
// tagged piece, and report that number exactly.
const { chromium } = require('playwright');
// The filters dock at the bottom of the screen and open themselves on
// Outfits and Faves. Everywhere else the pill raises them.
async function openFilters(page){
  const open = await page.evaluate(() => filterSheetOpen());
  if(!open){ await page.click('#filters-fab'); await page.waitForTimeout(400); }
}
async function closeFilters(page){
  await page.evaluate(() => closeFilterSheet());
  await page.waitForTimeout(300);
}

const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const TAGS={seed_22:['summer'], seed_11:['summer'], seed_0:['winter']};
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(700);

  const all=await p.evaluate(()=>totalComboCount());
  await openFilters(p); await p.click('#sheet-tag-chips .tag-chip:has-text("summer")'); await p.waitForTimeout(900);
  const tagged=await p.evaluate(()=>totalComboCount());
  check('tag narrows the count but keeps far more than all-tagged would',
    tagged>1 && tagged<all, `${all} -> ${tagged}`);

  // brute-force the true answer and compare with the reported one
  const truth=await p.evaluate(()=>{
    const tops=itemsInTab('Tops'), bottoms=slotList(outfitFilters,'bottom');
    const jum=[null].concat(itemsInTab('Jumpers')), jac=[null].concat(itemsInTab('Jackets'));
    const has=i=>i && (i.tags||[]).includes('summer');
    let n=0;
    for(const t of tops) for(const bo of bottoms) for(const j of jum) for(const ja of jac)
      if(has(t)||has(bo)||has(j)||has(ja)) n++;
    return n;
  });
  check('reported count matches a brute-force count exactly', tagged===truth, `reported ${tagged}, actual ${truth}`);

  const everyShownMatches=await p.evaluate(()=>
    outfitDisplayed.every(c=>comboPieces(c).some(pc=>(pc.tags||[]).includes('summer'))));
  check('every outfit shown contains a summer piece', everyShownMatches);
  const someHaveUntagged=await p.evaluate(()=>
    outfitDisplayed.some(c=>comboPieces(c).some(pc=>!(pc.tags||[]).includes('summer'))));
  check('outfits may also contain untagged pieces (the point of the change)', someHaveUntagged);

  await p.screenshot({path:shot('anytag-outfits.png')});
  await p.click('#sheet-tag-chips .tag-chip.active'); await p.waitForTimeout(800);
  check('clearing restores the full count', await p.evaluate(()=>totalComboCount())===all);

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
