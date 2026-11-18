// Inspo on an outfit: pictures of someone wearing something like it, kept
// against the combination. A photo or screenshot goes in the private bucket;
// a link keeps its address and, where one can be found, its preview picture.
//
// Like accessories it hangs off the combo_key, so none of this needs the
// outfit to have been kept, and the section stays away until the table
// exists.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// One transparent pixel, which is all a "photo" has to be here.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function open(b, extra, preview){
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  p.calls = [];
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;${extra||''}\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  // The preview route, which is serverless and so not here.
  await p.route('**/api/link-preview*', r=>{
    p.calls.push({ url: r.request().url(), auth: r.request().headers()['authorization'] });
    if(!preview) return r.fulfill({ status: 503, body: 'not set up' });
    r.fulfill({ contentType:'application/json', body: JSON.stringify(preview) });
  });
  // Pictures that are not ours: a pixel, so nothing goes to the network.
  await p.route('https://pics.test/**', r=>r.fulfill({ contentType:'image/png', body: PNG }));
  await p.route('https://signed.test/**', r=>r.fulfill({ contentType:'image/png', body: PNG }));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  await p.click('#nav-outfits-btn'); await p.waitForTimeout(1500);
  await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
  return p;
}
const openOutfit = async p => {
  await p.click('#outfit-gallery .outfit-card'); await p.waitForTimeout(700);
  return p.evaluate(()=>{ const t = sheetTrail[sheetTrail.length-1]; return t && t.id; });
};
const rows = p => p.evaluate(()=>window.__WARDROBE_STATE.outfit_inspo.slice());
const tiles = p => p.evaluate(()=>document.querySelectorAll('#outfit-page .inspo-tile').length);
const topSheet = p => p.evaluate(()=>sheetTrail.map(e=>e.sheet).join(' > '));

async function addLink(p, text){
  await p.click('#inspo-add'); await p.waitForTimeout(500);
  await p.click('#inspo-link'); await p.waitForTimeout(500);
  await p.fill('#inspo-url', text);
  await p.click('#inspo-save'); await p.waitForTimeout(900);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Until the table exists, there is nothing to offer ----
  {
    const p=await open(b, 'window.__NO_INSPO=true;');
    await openOutfit(p);
    check('without the table the section is not drawn',
      !(await p.evaluate(()=>Boolean(document.querySelector('#outfit-page .outfit-page-inspo')))));
    check('and the flag says so', !(await p.evaluate(()=>inspoAvailable)));
    await p.close();
  }

  // ---- 2. The empty state is the app's own ----
  {
    const p=await open(b);
    const key = await openOutfit(p);
    check('an outfit with no inspo shows the empty state',
      await p.isVisible('#outfit-page .outfit-page-inspo .empty'));
    check('with a title, a line of help and a round + button, like the other empty pages',
      await p.evaluate(()=>{
        const e = document.querySelector('#outfit-page .outfit-page-inspo .empty');
        const b = e.querySelector('.empty-action');
        return e.querySelector('h3').textContent.trim() === 'Save your inspo' &&
          Boolean(e.querySelector('.empty-sub').textContent.trim()) && Boolean(b) &&
          Math.round(b.getBoundingClientRect().width) === 52;
      }));
    check('Search Pinterest is a card at the top, with an explainer and keyword chips',
      await p.evaluate(()=>{
        const card = document.querySelector('#outfit-page .inspo-search-card');
        const s = document.getElementById('inspo-search');
        const grid = document.querySelector('#outfit-page .empty');
        return card.contains(s) && card.querySelector('.inspo-search-title') &&
          card.querySelector('.inspo-search-sub').textContent.trim() &&
          card.querySelectorAll('.inspo-chip').length >= 2 && s.getBoundingClientRect().top < grid.getBoundingClientRect().top;
      }));
    const href = await p.getAttribute('#inspo-search', 'href');
    check('it opens Pinterest with the outfit\'s own pieces as the words',
      href.startsWith('https://www.pinterest.com/search/pins/?q=') &&
      await p.evaluate(h=>{
        const q = decodeURIComponent(new URL(h).searchParams.get('q'));
        const names = comboPieces(comboForKey(sheetTrail[sheetTrail.length-1].id)).slice(0,4)
          .map(x=>x.name.replace(/[()]/g,' ').replace(/\s+/g,' ').trim());
        return /outfit$/.test(q) && names.every(n => q.includes(n));
      }, href), href);
    check('in a new tab, so the app is still here when you come back',
      (await p.getAttribute('#inspo-search', 'target')) === '_blank');
    check('and it needs no outfit to have been kept first',
      await p.evaluate(k=>!isFavorited(k), key));
    await p.close();
  }

  // ---- 3. Adding a link ----
  {
    const p=await open(b, '', { imageUrl: 'https://pics.test/pin.png', source: 'pinterest.com' });
    const key = await openOutfit(p);
    await p.click('#inspo-add'); await p.waitForTimeout(500);
    check('Add opens a small sheet over the outfit\'s page',
      (await topSheet(p)).endsWith('outfit > inspoadd') &&
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('open') &&
        outfitPageShowing()));
    check('with the phone\'s own chooser for photos, and a link',
      await p.isVisible('#inspo-photo') && await p.isVisible('#inspo-link'));
    await p.click('#inspo-link'); await p.waitForTimeout(500);
    check('a link replaces that sheet, so back is the outfit, not a used menu',
      (await topSheet(p)).endsWith('outfit > inspolink'), await topSheet(p));

    await p.fill('#inspo-url', 'not a link');
    await p.click('#inspo-save'); await p.waitForTimeout(500);
    check('something that is not a link says so and keeps the sheet',
      (await p.textContent('#inspo-error')).includes('link') &&
      (await topSheet(p)).endsWith('inspolink') && (await rows(p)).length === 0);

    await p.fill('#inspo-url', 'pin.it/abc123');
    await p.click('#inspo-save'); await p.waitForTimeout(900);
    check('a link without a scheme is fine, as pasted from a share sheet',
      (await rows(p)).length === 1 && (await rows(p))[0].url === 'https://pin.it/abc123',
      JSON.stringify((await rows(p))[0]));
    check('it goes straight back to the outfit\'s page',
      (await topSheet(p)) === 'outfit' && !(await p.evaluate(()=>
        document.getElementById('modal-backdrop').classList.contains('open'))), await topSheet(p));
    const r = (await rows(p))[0];
    check('saved against the combination, as a link with its preview picture',
      r.combo_key === key && r.kind === 'link' && r.image_url === 'https://pics.test/pin.png' &&
      r.source === 'pinterest.com', JSON.stringify(r));
    check('the route was asked with the signed-in token',
      p.calls.length === 1 && p.calls[0].auth === 'Bearer fake-token' &&
      p.calls[0].url.includes(encodeURIComponent('https://pin.it/abc123')), JSON.stringify(p.calls));
    check('the pin shows in a grid', (await tiles(p)) === 1 &&
      await p.evaluate(()=>getComputedStyle(document.querySelector('#outfit-page .inspo-grid')).display === 'grid'));
    check('the empty state has gone, and the + moved up beside Search',
      await p.evaluate(()=>!document.querySelector('#outfit-page .outfit-page-inspo .empty') &&
        document.querySelector('#outfit-page .inspo-head').contains(document.getElementById('inspo-add'))));

    // A direct image needs no server at all.
    p.calls.length = 0;
    await addLink(p, 'https://pics.test/look.jpg');
    check('an image link is its own picture, with no round trip',
      p.calls.length === 0 && (await rows(p))[1].image_url === 'https://pics.test/look.jpg' &&
      (await rows(p))[1].source === 'pics.test');
    check('all of them are shown at once, none hidden off the side',
      (await tiles(p)) === 2 && await p.evaluate(()=>{
        const g = document.querySelector('#outfit-page .inspo-grid');
        return g.scrollWidth <= g.clientWidth + 1;
      }));
    await p.close();
  }

  // ---- 4. A page with nothing to show is still worth keeping ----
  {
    const p=await open(b);       // the route is not set up: 503
    await openOutfit(p);
    await addLink(p, 'https://shop.example.com/some-page');
    const r = (await rows(p))[0];
    check('a link whose picture cannot be found is saved anyway',
      r && r.url === 'https://shop.example.com/some-page' && !r.image_url, JSON.stringify(r));
    check('as a tile that names the site', await p.evaluate(()=>{
      const t = document.querySelector('#outfit-page .inspo-tile');
      return t && t.textContent.trim() === 'shop.example.com';
    }));
    await p.close();
  }

  // ---- 5. A photo or screenshot ----
  {
    const p=await open(b);
    const key = await openOutfit(p);
    await p.click('#inspo-add'); await p.waitForTimeout(500);
    await p.setInputFiles('#inspo-file-input', [
      { name: 'a.png', mimeType: 'image/png', buffer: PNG },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await p.waitForFunction(()=>window.__WARDROBE_STATE.outfit_inspo.length === 2, null, {timeout: 8000});
    await p.waitForTimeout(600);
    const rs = await rows(p);
    check('several photos go in at once, each its own pin',
      rs.length === 2 && rs.every(r => r.kind === 'photo' && r.combo_key === key));
    check('into the private bucket, under inspo/, not beside the cut-outs',
      await p.evaluate(()=>Object.keys(window.__WARDROBE_STATE.storage).length === 2 &&
        Object.keys(window.__WARDROBE_STATE.storage).every(k => k.startsWith('inspo/'))));
    check('the add sheet is gone and both show', (await topSheet(p)) === 'outfit' && (await tiles(p)) === 2);
    check('labelled as photos', await p.evaluate(()=>
      Array.from(document.querySelectorAll('#outfit-page .inspo-src')).every(e => e.textContent.trim() === 'Photo')));

    await p.reload(); await p.waitForTimeout(1500);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    await p.evaluate(k=>openOutfitPage(k), key); await p.waitForTimeout(600);
    check('they are still there after a reload, shown through signed links',
      (await tiles(p)) === 2 && await p.evaluate(()=>
        Array.from(document.querySelectorAll('#outfit-page .inspo-tile img')).every(i => i.src.startsWith('https://signed.test/inspo/'))));
    await p.close();
  }

  // ---- 6. Looking at one, and taking it away ----
  {
    const p=await open(b, '', { imageUrl: 'https://pics.test/pin.png', source: 'pinterest.com' });
    await openOutfit(p);
    await addLink(p, 'https://www.pinterest.com/pin/111/');
    await addLink(p, 'https://www.pinterest.com/pin/222/');
    await p.click('#outfit-page .inspo-tile >> nth=0'); await p.waitForTimeout(500);
    check('a pin opens larger in a sheet over the page',
      (await topSheet(p)).endsWith('outfit > inspoview') && await p.isVisible('#modal .inspo-big img'));
    check('with a way to the original, in a new tab',
      (await p.getAttribute('#inspo-open', 'href')) === 'https://www.pinterest.com/pin/111/' &&
      (await p.getAttribute('#inspo-open', 'target')) === '_blank');
    await p.click('#inspo-remove'); await p.waitForTimeout(700);
    const gone = await rows(p);
    check('Remove takes it off the page at once', (await tiles(p)) === 1);
    check('and is a soft delete, like everything else here',
      gone.length === 2 && gone[0].archived_at && !gone[1].archived_at);
    check('back on the outfit\'s page', (await topSheet(p)) === 'outfit');
    check('with Undo offered, and no question asked first',
      await p.isVisible('.toast-undo') &&
      !(await p.evaluate(()=>document.getElementById('confirm-backdrop').classList.contains('open'))));
    await p.click('.toast-undo'); await p.waitForTimeout(700);
    check('Undo puts it back where it was',
      (await tiles(p)) === 2 && !(await rows(p))[0].archived_at &&
      await p.evaluate(()=>findInspo(window.__WARDROBE_STATE.outfit_inspo[0].id).at === 0));
    await p.close();
  }

  // ---- 7. One outfit's inspo is not another's ----
  {
    const p=await open(b);
    const key = await openOutfit(p);
    await addLink(p, 'https://example.com/a.jpg');
    await p.click('#outfit-page-back'); await p.waitForTimeout(600);
    await p.locator('#outfit-gallery .outfit-card').nth(1).click(); await p.waitForTimeout(700);
    check('another outfit starts with none',
      (await tiles(p)) === 0 && await p.isVisible('#outfit-page .outfit-page-inspo .empty'));
    await p.close();
  }

  // ---- 8. What counts as a link ----
  {
    const p=await open(b);
    const got = await p.evaluate(()=>[
      'https://a.com/x', 'a.com/x', ' pin.it/Ab ', 'http://a.co', 'javascript:alert(1)',
      'ftp://a.com/x', 'hello', '', 'a b.com', 'https://localhost/x'
    ].map(normalizeInspoUrl));
    check('addresses are made out of what people paste, and only web ones',
      JSON.stringify(got) === JSON.stringify([
        'https://a.com/x', 'https://a.com/x', 'https://pin.it/Ab', 'http://a.co/', null,
        null, null, null, null, null]), JSON.stringify(got));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
