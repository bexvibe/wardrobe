// Every empty state in the app: one line saying what is missing, and where
// you can do something about it, a button that does it. No second line —
// explaining the first was the app talking to itself.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function boot(b, items){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${items};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const said = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s);
  return el ? el.textContent.trim() : null;
}, sel);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. A wardrobe with nothing in it, page by page ----
  {
    const p=await boot(b, '[]');
    check('the wardrobe asks for pieces',
      (await said(p, '#empty h3')) === 'Add pieces', await said(p, '#empty h3'));
    check('and offers the button that adds one',
      await p.evaluate(()=>{
        const btn = document.querySelector('#empty .empty-action');
        return Boolean(btn) && btn.getBoundingClientRect().height >= 44;
      }));
    check('which really opens the form', await (async()=>{
      await p.click('#empty .empty-action'); await p.waitForTimeout(700);
      const up = await p.evaluate(()=>
        document.getElementById('form-backdrop').classList.contains('open'));
      await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
      return up;
    })());

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    check('Outfits says there is nothing to build from',
      (await said(p, '#outfit-empty-title')) === 'Add pieces to see outfits',
      await said(p, '#outfit-empty-title'));
    check('and offers the same button',
      await p.evaluate(()=>document.getElementById('outfit-empty-action')
        .style.display !== 'none'));

    await p.click('#nav-saved-btn'); await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    check('Faves says No faves',
      (await said(p, '#saved-empty-title')) === 'No faves',
      await said(p, '#saved-empty-title'));
    check('with no button, because keeping one is not done from here',
      await p.evaluate(()=>!document.querySelector('#saved-empty .empty-action')));

    await p.click('#nav-capsules-btn'); await p.waitForTimeout(900);
    check('Capsules asks you to build one',
      (await said(p, '#capsule-empty h3')) === 'Build a capsule',
      await said(p, '#capsule-empty h3'));
    check('and the button opens the editor', await (async()=>{
      await p.click('#capsule-empty .empty-action'); await p.waitForTimeout(700);
      const up = await p.evaluate(()=>Boolean(document.getElementById('capsule-tabs')));
      await p.evaluate(()=>{ capsuleDraft = null; closeModal(); }); await p.waitForTimeout(400);
      return up;
    })());

    await p.evaluate(()=>setMode('archive')); await p.waitForTimeout(700);
    check('the archive says No archives',
      (await said(p, '#archive-empty h3')) === 'No archives',
      await said(p, '#archive-empty h3'));

    // The rule, once, over all of them.
    check('and not one of them has a second line',
      await p.evaluate(()=>document.querySelectorAll('.empty p').length === 0),
      String(await p.evaluate(()=>document.querySelectorAll('.empty p').length)));
    await p.close();
  }

  // ---- 2. A full wardrobe filtered to nothing is a different sentence ----
  {
    const p=await boot(b, seed);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    await p.evaluate(()=>{ outfitTags = ['nothing-carries-this']; resetOutfitResults(); });
    await p.waitForTimeout(900);
    check('a filter nothing gets past says so, not "add pieces"',
      (await said(p, '#outfit-empty-title')) === 'No outfits match',
      await said(p, '#outfit-empty-title'));
    check('and offers no button, because adding a piece is not the answer',
      await p.evaluate(()=>document.getElementById('outfit-empty-action')
        .style.display === 'none'));

    // Faves says the same thing for the same reason.
    await p.evaluate(()=>{
      favoriteOutfits = [];
      outfitTags = [];
      resetOutfitResults();
    });
    await p.click('.outfit-gallery .outfit-fav-btn');
    await p.waitForFunction(()=>favoriteOutfits.length === 1);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(1000);
    // A real piece that the kept outfit does not wear — a made-up tag would
    // be dropped as not existing, and the page would read as unfiltered.
    await p.evaluate(()=>{
      const worn = new Set(comboPieces(favoriteRecordToCombo(favoriteOutfits[0])).map(i=>i.id));
      const other = itemsInTab('Tops').find(i => !worn.has(i.id));
      savedFilters['Tops'] = {type:'items', ids:[other.id]};
      renderSavedOutfits();
    });
    await p.waitForTimeout(500);
    check('a fave filter nothing matches reads the same',
      (await said(p, '#saved-empty-title')) === 'No outfits match',
      await said(p, '#saved-empty-title'));
    check('and without it, it is back to No faves', await (async()=>{
      await p.evaluate(()=>{ savedFilters = emptySlotFilters();
                             favoriteOutfits = []; renderSavedOutfits(); });
      await p.waitForTimeout(400);
      return (await said(p, '#saved-empty-title')) === 'No faves';
    })());
    await p.close();
  }

  // ---- 3. The two inside sheets ----
  {
    const p=await boot(b, seed);
    // A category you own nothing in, in the piece picker: still its own
    // name, one quiet line, unchanged.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1300);
    await p.evaluate(()=>openSlotPicker('Skirts')); await p.waitForTimeout(600);
    check('the piece picker still names the category it has none of',
      (await said(p, '#picker-empty')) === 'No skirts', await said(p, '#picker-empty'));
    await p.evaluate(()=>closeModal()); await p.waitForTimeout(500);

    // A capsule with nothing in it.
    await p.evaluate(async()=>{ await saveCapsule({ id:null, name:'Winter', itemIds:[] }); });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(900);
    check('an empty capsule card says how to fill it',
      (await said(p, '.capsule-empty-note')) === 'Tap to add pieces',
      await said(p, '.capsule-empty-note'));
    await p.close();
  }

  // ---- 4. The accessories picker's empty shelf ----
  {
    // Only clothes, so every accessory shelf is bare.
    const clothesOnly = JSON.stringify(JSON.parse(seed)
      .filter(r => ['Tops','Tees','Jeans','Pants','Dresses','Jumpers','Jackets'].includes(r.category)));
    const p=await boot(b, clothesOnly);
    await p.click('#nav-outfits-btn');
    await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.click('.outfit-gallery .outfit-fav-btn');
    await p.waitForFunction(()=>favoriteOutfits.length === 1);
    await p.click('#nav-saved-btn'); await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(400);
    await p.click('#saved-gallery .outfit-card'); await p.waitForTimeout(500);
    await p.click('#saved-gallery .modal-actions button'); await p.waitForTimeout(700);
    check('a picker with no accessories to offer says so',
      (await said(p, '.modal .empty h3')) === 'No accessories',
      await said(p, '.modal .empty h3'));
    check('and says nothing else', await p.evaluate(()=>
      document.querySelectorAll('.modal .empty p').length === 0));
    await p.close();
  }

  // ---- 5. Nothing in the source keeps a second line ----
  {
    const src = fs.readFileSync(REPO + '/index.html', 'utf8');
    const blocks = [...src.matchAll(/class="empty"[^>]*>([\s\S]*?)<\/div>/g)].map(m => m[1]);
    const withNotes = blocks.filter(b => /<p[\s>]/.test(b));
    check('no empty state in the markup carries a paragraph',
      withNotes.length === 0, `${withNotes.length} of ${blocks.length}`);
    check('and there were empty states to check', blocks.length >= 4, String(blocks.length));
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
