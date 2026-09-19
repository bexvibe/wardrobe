// A row of chips reads as multi-select whatever it does, and the tag row
// used to lie: tapping winter silently dropped summer. Several at once now,
// and any one of them is enough — OR within the filter, the way every
// faceted filter works, while the piece chips beside them still narrow.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const rows=JSON.parse(fs.readFileSync(REPO + '/supabase/seed-items.json','utf8'));
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// One tag per piece, on pieces that can actually form an outfit together,
// so "summer or winter" is a question with a real answer.
const TAGS = {};
rows.forEach((r, i) => {
  const id = 'seed_' + i;
  if(r.category === 'Tops' || r.category === 'Tees') TAGS[id] = ['summer'];
  else if(r.category === 'Jeans' || r.category === 'Pants') TAGS[id] = ['winter'];
  else if(r.category === 'Jackets') TAGS[id] = ['wool'];
});

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${JSON.stringify(rows)};window.__WITH_TAGS=true;`+
         `window.__SEED_TAGS=${JSON.stringify(TAGS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}

const tap = async (p, tag) => {
  await p.click(`#sheet-tag-chips .tag-chip[data-tag="${tag}"]`);
  await p.waitForTimeout(900);
};
const on = p => p.evaluate(()=>Array.from(
  document.querySelectorAll('#sheet-tag-chips .tag-chip.active')).map(e=>e.dataset.tag).sort());

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Two tags at once, on Outfits ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    check('nothing is on to begin with', (await on(p)).length === 0);

    await tap(p, 'summer');
    check('one tag is on', JSON.stringify(await on(p))===JSON.stringify(['summer']),
      (await on(p)).join(', '));
    const justSummer = await p.evaluate(()=>totalComboCount());

    await tap(p, 'winter');
    check('tapping a second keeps the first — it does not replace it',
      JSON.stringify(await on(p))===JSON.stringify(['summer','winter']),
      (await on(p)).join(', '));
    const both = await p.evaluate(()=>totalComboCount());
    check('and both chips are filled, as the row always implied',
      await p.evaluate(()=>document.querySelectorAll('#sheet-tag-chips .tag-chip.active').length)===2);

    // OR, so a second value widens rather than narrows.
    check('asking for either finds at least as many as asking for one',
      both >= justSummer, `${justSummer} -> ${both}`);
    check('every outfit shown carries one of them, not necessarily both',
      await p.evaluate(()=>outfitDisplayed.length > 0 && outfitDisplayed.every(c =>
        comboPieces(c).some(x => (x.tags||[]).some(t => ['summer','winter'].includes(t))))));
    check('and some of them carry only one',
      await p.evaluate(()=>outfitDisplayed.some(c => {
        const t = new Set(comboPieces(c).flatMap(x => x.tags||[]));
        return t.has('summer') !== t.has('winter');
      })));

    // The count the page works out must agree with what it can generate.
    check('the count agrees with the stream it came from',
      await p.evaluate(()=>{
        let n = 0; for(const c of comboGenerator()){ if(comboMatchesTag(c)) n++; if(n > 60000) break; }
        return n === totalComboCount();
      }), String(await p.evaluate(()=>totalComboCount())));

    await tap(p, 'summer');
    check('tapping one again takes only that one off',
      JSON.stringify(await on(p))===JSON.stringify(['winter']), (await on(p)).join(', '));
    await tap(p, 'winter');
    check('and the last one off leaves the filter empty',
      (await on(p)).length === 0 &&
      await p.evaluate(()=>totalComboCount() === comboCountWhere(false)));
    await p.close();
  }

  // ---- 2. The pill counts the facet, not the values ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await tap(p, 'summer');
    const one = (await p.textContent('#filters-fab')).replace(/\s+/g,' ').trim();
    await tap(p, 'winter');
    const two = (await p.textContent('#filters-fab')).replace(/\s+/g,' ').trim();
    // Under OR a second tag widens the results, so counting it as a second
    // filter would be saying the page is more narrowed than it is.
    check('one tag reads as one filter', /\b1\b/.test(one), one);
    check('and two tags still read as one', /\b1\b/.test(two) && !/\b2\b/.test(two), two);

    await p.evaluate(()=>{ outfitFilters['Jackets'] = {type:'none', ids:[]};
                           renderFilterControls(); renderFiltersFab(); });
    await p.waitForTimeout(400);
    check('a piece filter beside them is a second',
      /\b2\b/.test((await p.textContent('#filters-fab')).replace(/\s+/g,' ')),
      (await p.textContent('#filters-fab')).replace(/\s+/g,' ').trim());
    await p.close();
  }

  // ---- 3. The same on Faves, including what it says ----
  {
    const p=await open(b);
    // Keep a couple of outfits.
    await p.click('#nav-outfits-btn');
    await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.click('.outfit-gallery .outfit-fav-btn');
    await p.waitForFunction(()=>favoriteOutfits.length === 1);

    await p.click('#nav-saved-btn'); await p.waitForTimeout(1100);
    await tap(p, 'summer');
    await tap(p, 'winter');
    check('Faves keeps two as well',
      JSON.stringify(await on(p))===JSON.stringify(['summer','winter']));
    // The page prints no count line any more — the cards are the count —
    // so the phrase is read where it still earns its place: the empty
    // state, which has to say which of the two empty states it is.
    await p.evaluate(()=>{ savedTags = ['wool']; renderSavedOutfits(); });
    await p.waitForTimeout(400);
    check('a tag nothing carries says so by name',
      /Nothing tagged wool/.test(await p.textContent('#saved-empty-title')),
      (await p.textContent('#saved-empty-title')).trim());

    const line = await p.evaluate(()=>tagPhrase(['wool','sleet','hail']));
    check('three read as a list with "or" before the last',
      line === 'wool, sleet or hail', line);
    check('and two read as one or the other',
      (await p.evaluate(()=>tagPhrase(['wool','sleet']))) === 'wool or sleet');

    // And the two pages still keep their own.
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1200);
    check('the Outfits row is not wearing the Faves tags',
      (await on(p)).length === 0, (await on(p)).join(', '));
    await p.close();
  }

  // ---- 4. Clearing, renaming and deleting still reach every one ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    await tap(p, 'summer'); await tap(p, 'winter');
    await p.click('#filter-sheet-clear'); await p.waitForTimeout(800);
    check('Clear all takes both off', (await on(p)).length === 0);

    await tap(p, 'summer'); await tap(p, 'winter');
    await p.evaluate(async()=>{ await retagAll('summer', 'sunny');
                                outfitTags = outfitTags.map(t=>t==='summer'?'sunny':t);
                                afterTagChange(); });
    await p.waitForTimeout(900);
    check('renaming one follows it and leaves the other alone',
      JSON.stringify(await on(p))===JSON.stringify(['sunny','winter']),
      (await on(p)).join(', '));

    await p.evaluate(async()=>{ await retagAll('winter', null); afterTagChange(); });
    await p.waitForTimeout(900);
    check('deleting one drops just that one',
      JSON.stringify(await on(p))===JSON.stringify(['sunny']), (await on(p)).join(', '));
    check('and the page still filters by what is left',
      await p.evaluate(()=>outfitDisplayed.length > 0 && outfitDisplayed.every(c =>
        comboPieces(c).some(x => (x.tags||[]).includes('sunny')))));
    await p.close();
  }

  // ---- 5. The featured outfit is re-picked when the tags change ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(1400);
    const sig = await p.evaluate(()=>heroSignature());
    await tap(p, 'summer');
    check('the hero knows the pool changed',
      (await p.evaluate(()=>heroSignature())) !== sig);
    check('and it is drawn from the narrowed pool',
      await p.evaluate(()=>!heroCombo || comboPieces(heroCombo)
        .some(x => (x.tags||[]).includes('summer'))));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
