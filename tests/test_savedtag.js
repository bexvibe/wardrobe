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
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// The wardrobe stopped printing a count, so count what it actually drew.
const shown = p => p.evaluate(() =>
  document.getElementById('gallery').style.display === 'none'
    ? document.querySelectorAll('#name-list .name-row').length
    : document.querySelectorAll('#gallery .tile').length);


// three saved outfits: one fully summer, one part-summer, one untagged
const SAVED=[
  {combo_key:'tb|seed_22|seed_11|none|none|none', base:'topbottom', top_id:'seed_22', bottom_id:'seed_11',
   dress_id:null, jumper_id:null, jacket_id:null, shoe_id:null, archived_at:null, created_at:'2026-01-01'},
  {combo_key:'tb|seed_22|seed_12|none|none|none', base:'topbottom', top_id:'seed_22', bottom_id:'seed_12',
   dress_id:null, jumper_id:null, jacket_id:null, shoe_id:null, archived_at:null, created_at:'2026-01-02'},
  {combo_key:'tb|seed_23|seed_12|none|none|none', base:'topbottom', top_id:'seed_23', bottom_id:'seed_12',
   dress_id:null, jumper_id:null, jacket_id:null, shoe_id:null, archived_at:null, created_at:'2026-01-03'},
];
// seed_22 + seed_11 summer -> outfit 1 fully summer; seed_12 untagged -> outfit 2 partial
const TAGS={seed_22:['summer'], seed_11:['summer'], seed_23:['winter']};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS=${JSON.stringify(TAGS)};window.__SEED_OUTFITS=${JSON.stringify(SAVED)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);
  await p.click('#nav-saved-btn'); await p.waitForTimeout(500);

  check('saved tab shows all outfits unfiltered',
    (await p.evaluate(()=>document.querySelectorAll('#saved-gallery .outfit-card').length))===3);
  check('the filters are already down, not behind a pill',
    (await p.evaluate(()=>filterSheetOpen())) && !(await p.isVisible('#filters-fab')));
  check('and they offer the saved tags', await p.isVisible('#sheet-tag-chips .tag-chip'));
  const cards=()=>p.evaluate(()=>document.querySelectorAll('#saved-gallery .outfit-card').length);
  check('3 cards rendered', await cards()===3);

  // filter to summer: only the outfit where EVERY piece is summer
  await p.click('#sheet-tag-chips .tag-chip:has-text("summer")'); await p.waitForTimeout(400);
  // seed_22 is summer, so outfits 1 and 2 both contain a summer piece
  check('outfits containing any summer piece match', await cards()===2, `${await cards()} card(s)`);
  check('and the third is simply not drawn',
    await p.evaluate(()=>favoriteOutfits.length===3 &&
      document.querySelectorAll('#saved-gallery .outfit-card').length===2));
  const shownKey=await p.evaluate(()=>favoriteOutfits.filter(savedOutfitMatchesTag).map(r=>r.key));
  check('the outfit with no summer piece is excluded',
    shownKey.length===2 && !shownKey.includes('tb|seed_23|seed_12|none|none|none'), shownKey.join(' '));
  await p.screenshot({path:shot('savedtag.png')});

  // Tags accumulate rather than replace one another, so summer has to come
  // off before winter is asked about on its own.
  await p.click('#sheet-tag-chips .tag-chip:has-text("summer")'); await p.waitForTimeout(400);
  await p.click('#sheet-tag-chips .tag-chip:has-text("winter")'); await p.waitForTimeout(400);
  // seed_23 is winter but outfit 3 contains it, so winter DOES match one
  check('a tag on one piece of one outfit matches that outfit',
    await p.evaluate(()=>document.querySelectorAll('#saved-gallery .outfit-card').length)===1);

  // And asking for both is OR: either tag will do.
  await p.click('#sheet-tag-chips .tag-chip:has-text("summer")'); await p.waitForTimeout(400);
  check('both tags at once means either of them', await cards()===3, String(await cards()));

  // clear
  await p.click('#sheet-tag-chips .tag-chip.active'); await p.waitForTimeout(400);
  await p.click('#sheet-tag-chips .tag-chip.active'); await p.waitForTimeout(400);
  check('tapping each active chip clears it', await cards()===3 &&
    await p.evaluate(()=>savedTags.length===0));

  // independence from the other two filters
  await p.click('#sheet-tag-chips .tag-chip:has-text("summer")'); await p.waitForTimeout(300);
  await closeFilters(p);
  await p.click('#nav-inventory-btn'); await p.waitForTimeout(400);
  check('wardrobe filter untouched', (await shown(p)) === 80);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(700);
  const outfitChipActive=await p.evaluate(()=>outfitTags.length > 0);
  check('outfits filter untouched', !outfitChipActive);
  await p.click('#nav-saved-btn'); await p.waitForTimeout(400);
  check('saved filter survives tab switching', await cards()===2);

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
