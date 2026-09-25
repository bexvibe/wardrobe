// A toast that only tells you what happened is a receipt. These ones offer
// the action back, so what matters is that the offer is there when something
// was taken away, that taking it up really reverses the change in the
// database and not just on screen, and that the toast is somewhere a thumb
// can reach it.
const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(700);
  return p;
}

const toast = p => p.evaluate(()=>{
  const t = document.getElementById('toast');
  return {
    shown: t.classList.contains('show'),
    msg: (t.querySelector('.toast-msg')||{}).textContent || '',
    undo: Boolean(t.querySelector('.toast-undo')),
  };
});
const shown = p => p.evaluate(()=>document.querySelectorAll('#gallery .tile').length);
// A real tap, so a toast that is behind the nav bar fails rather than passes.
const tapUndo = async p => { await p.click('.toast-undo'); await p.waitForTimeout(600); };

async function holdFirstTile(p){
  const box = await p.locator('#gallery .tile').first().boundingBox();
  await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
  await p.waitForTimeout(300);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. Where the toast sits ----
  {
    const p=await open(b);
    await p.evaluate(()=>showToast('Something happened', ()=>{}));
    await p.waitForTimeout(350);
    const geo = await p.evaluate(()=>{
      const t=document.getElementById('toast').getBoundingClientRect();
      const nav=document.getElementById('bottom-bar').getBoundingClientRect();
      return {toastBottom:Math.round(t.bottom), navTop:Math.round(nav.top),
              toastTop:Math.round(t.top), fold:window.innerHeight};
    });
    check('the toast clears the nav bar instead of hiding behind it',
      geo.toastBottom <= geo.navTop, `toast ends ${geo.toastBottom}, nav starts ${geo.navTop}`);
    check('and is still on screen', geo.toastTop > 0 && geo.toastBottom < geo.fold,
      `${geo.toastTop}–${geo.toastBottom} of ${geo.fold}`);

    // The undo is the only part that takes a tap; the rest must not block
    // the page it is floating over.
    const pe = await p.evaluate(()=>({
      body: getComputedStyle(document.getElementById('toast')).pointerEvents,
      undo: getComputedStyle(document.querySelector('.toast-undo')).pointerEvents,
    }));
    check('the toast body lets taps through to the page', pe.body==='none', pe.body);
    check('but the undo itself takes them', pe.undo==='auto', pe.undo);

    const size = await p.evaluate(()=>{
      const r=document.querySelector('.toast-undo').getBoundingClientRect();
      return {w:Math.round(r.width), h:Math.round(r.height)};
    });
    check('the undo is a proper thumb target', size.h>=44 && size.w>=44, `${size.w}x${size.h}`);

    // The box has the whole width to lay itself out in, not the half that a
    // left:50% anchor would have left it — a three-word message on two lines
    // reads as a mistake.
    const lines = await p.evaluate(()=>{
      showToast('Moved to Archive', ()=>{});
      const msg = document.querySelector('.toast-msg');
      const one = parseFloat(getComputedStyle(msg).lineHeight) || 16;
      return Math.round(msg.getBoundingClientRect().height / one);
    });
    check('a short message does not wrap', lines === 1, lines + ' lines');

    const wide = await p.evaluate(()=>{
      showToast('Moved 12 items to Archive and then some more words besides', ()=>{});
      const r = document.getElementById('toast').getBoundingClientRect();
      return {left:Math.round(r.left), right:Math.round(r.right), vw:window.innerWidth};
    });
    check('a long one still stays inside the screen',
      wide.left >= 8 && wide.right <= wide.vw - 8, `${wide.left}–${wide.right} of ${wide.vw}`);

    await p.evaluate(()=>showToast('Just saying'));
    await p.waitForTimeout(250);
    check('a toast with nothing to reverse offers no undo', !(await toast(p)).undo);
    await p.close();
  }

  // ---- 2. Archiving one piece ----
  {
    const p=await open(b);
    const before = await shown(p);
    const id = await p.evaluate(()=>document.querySelector('#gallery .tile').dataset.id);
    await p.click('#gallery .tile'); await p.waitForTimeout(400);
    // Archiving lives under Edit now, with Replace photo.
    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(450);
    await p.click('#form-item-actions button:has-text("Archive")'); await p.waitForTimeout(500);
    const t = await toast(p);
    check('archiving a piece offers it back', t.shown && t.undo, `${t.msg} undo=${t.undo}`);
    check('and it is gone meanwhile', (await shown(p)) === before-1);

    await tapUndo(p);
    check('undo puts the piece back in the wardrobe', (await shown(p)) === before, String(await shown(p)));
    check('and clears archived_at in the database',
      await p.evaluate(i=>{
        const r = window.__WARDROBE_STATE.items.find(x=>x.id===i);
        return r && !r.archived_at;
      }, id));
    check('the archive is empty again',
      await p.evaluate(()=>window.__WARDROBE_STATE.items.filter(r=>r.archived_at).length)===0);
    const after = await toast(p);
    check('the toast that replaces it just confirms, with nothing left to undo',
      after.shown && !after.undo, after.msg);
    await p.close();
  }

  // ---- 3. Archiving several at once ----
  {
    const p=await open(b);
    const before = await shown(p);
    await holdFirstTile(p);
    await p.locator('#gallery .tile').nth(1).click(); await p.waitForTimeout(200);
    await p.locator('#gallery .tile').nth(2).click(); await p.waitForTimeout(200);
    await p.click('button:has-text("Delete selected")'); await p.waitForTimeout(700);
    const t = await toast(p);
    check('a bulk archive offers the lot back', t.undo, t.msg);
    check('three are gone', (await shown(p)) === before-3, String(await shown(p)));

    await tapUndo(p);
    check('undo brings all three back', (await shown(p)) === before, String(await shown(p)));
    check('and none is left archived in the database',
      await p.evaluate(()=>window.__WARDROBE_STATE.items.filter(r=>r.archived_at).length)===0);
    await p.close();
  }

  // ---- 4. Un-hearting, from both pages ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    await p.click('.outfit-gallery .outfit-fav-btn'); await p.waitForTimeout(500);
    const key = await p.evaluate(()=>favoriteOutfits[0].key);
    check('hearting says so without offering an undo — nothing was lost',
      !(await toast(p)).undo, (await toast(p)).msg);

    await p.click('.outfit-gallery .outfit-fav-btn'); await p.waitForTimeout(500);
    const t = await toast(p);
    check('un-hearting offers it back', t.undo && /Faves/.test(t.msg), t.msg);
    check('it is off the list meanwhile',
      await p.evaluate(k=>!favoriteOutfits.some(f=>f.key===k), key));

    await tapUndo(p);
    check('undo hearts it again',
      await p.evaluate(k=>favoriteOutfits.some(f=>f.key===k), key));
    check('and the row is live again in the database',
      await p.evaluate(k=>{
        const r = window.__WARDROBE_STATE.saved_outfits.find(x=>x.combo_key===k);
        return Boolean(r) && !r.archived_at;
      }, key));

    // Now the same thing from the Faves page, where the card disappears.
    await toFaves(p, 600);
    check('the outfit is listed under Faves',
      (await p.locator('#saved-gallery .outfit-card').count()) === 1);
    await p.click('#saved-gallery .outfit-fav-btn'); await p.waitForTimeout(500);
    check('removing it there offers it back too', (await toast(p)).undo);
    check('and the card goes', (await p.locator('#saved-gallery .outfit-card').count()) === 0);
    await tapUndo(p);
    check('undo brings the card back to Faves',
      (await p.locator('#saved-gallery .outfit-card').count()) === 1);
    await p.close();
  }

  // ---- 5. Hiding a combination — the one with no other way back ----
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(900);
    await p.click('.outfit-gallery .outfit-card'); await p.waitForTimeout(400);
    const key = await p.evaluate(()=>expandedComboKey);
    await p.click('button:has-text("Hide this combo")'); await p.waitForTimeout(600);
    check('hiding offers the combination back', (await toast(p)).undo);
    check('it is hidden meanwhile', await p.evaluate(k=>hiddenCombos.includes(k), key));

    await tapUndo(p);
    check('undo unhides it', await p.evaluate(k=>!hiddenCombos.includes(k), key));
    check('and the row is gone from hidden_combos',
      await p.evaluate(k=>!window.__WARDROBE_STATE.hidden_combos.some(r=>r.combo_key===k), key));
    check('the combination is generated again',
      await p.evaluate(k=>outfitDisplayed.some(c=>comboKey(c)===k), key));
    await p.close();
  }

  // ---- 6. Capsules: a piece out, and a whole capsule out ----
  {
    const p=await open(b);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(700);
    await p.click('#new-capsule-btn'); await p.waitForTimeout(500);
    await p.fill('#capsule-name-input', 'Evening');
    await p.locator('#capsule-editor-gallery .picker-tile').nth(0).click();
    await p.locator('#capsule-editor-gallery .picker-tile').nth(1).click();
    await p.locator('#capsule-editor-gallery .picker-tile').nth(2).click();
    await p.click('#capsule-save-btn'); await p.waitForTimeout(700);

    const capsuleId = await p.evaluate(()=>capsules[0].id);
    const order = await p.evaluate(()=>capsules[0].itemIds.slice());

    // The per-row Remove button is gone; a piece leaves a capsule by being
    // deselected in the editor, so that save is what has to be undoable.
    await p.click('#capsule-gallery .outfit-card'); await p.waitForTimeout(400);
    await p.click('#capsule-gallery button:has-text("Edit capsule")'); await p.waitForTimeout(450);
    await p.locator('#capsule-editor-gallery .picker-tile.picker-selected').first().click();
    await p.waitForTimeout(200);
    await p.click('#capsule-save-btn'); await p.waitForTimeout(700);
    check('saving a capsule with a piece taken out offers it back', (await toast(p)).undo);
    check('the capsule is down to two',
      (await p.evaluate(c=>capsules.find(x=>x.id===c).itemIds.length, capsuleId)) === 2);

    await tapUndo(p);
    check('undo puts the membership back as it was',
      JSON.stringify((await p.evaluate(c=>capsules.find(x=>x.id===c).itemIds, capsuleId)).slice().sort())
        === JSON.stringify(order.slice().sort()),
      (await p.evaluate(c=>capsules.find(x=>x.id===c).itemIds, capsuleId)).join(','));
    check('and the membership row is back in the database',
      await p.evaluate(([c,i])=>window.__WARDROBE_STATE.capsule_items
        .some(r=>r.capsule_id===c && r.item_id===i), [capsuleId, order[0]]));

    // The whole capsule. There is no archive page for capsules, so the
    // toast is the only way back.
    await p.click('#capsule-gallery button:has-text("Delete")'); await p.waitForTimeout(700);
    check('deleting a capsule offers it back', (await toast(p)).undo);
    check('it is gone meanwhile', (await p.evaluate(()=>capsules.length)) === 0);

    await tapUndo(p);
    check('undo restores the capsule whole',
      await p.evaluate(([c,o])=>{
        const cap = capsules.find(x=>x.id===c);
        return Boolean(cap) && JSON.stringify(cap.itemIds)===JSON.stringify(o);
      }, [capsuleId, order]));
    check('and it is unarchived in the database',
      await p.evaluate(c=>{
        const r = window.__WARDROBE_STATE.capsules.find(x=>x.id===c);
        return Boolean(r) && !r.archived_at;
      }, capsuleId));
    await p.close();
  }

  // ---- 7. The offer expires with the toast ----
  {
    const p=await open(b);
    const before = await shown(p);
    await p.click('#gallery .tile'); await p.waitForTimeout(400);
    await p.click('.modal button:has-text("Edit")'); await p.waitForTimeout(450);
    await p.click('#form-item-actions button:has-text("Archive")'); await p.waitForTimeout(400);
    check('the offer is up to begin with', (await toast(p)).shown);
    // Ten seconds, not six: reading it, deciding, and reaching for Undo with
    // the hand holding the phone used to run out mid-reach.
    await p.waitForTimeout(7000);
    check('it is still there seven seconds later', (await toast(p)).shown);
    await p.waitForTimeout(4000);
    check('it is gone once the toast fades', !(await toast(p)).shown);
    check('and the archive stands', (await shown(p)) === before-1);
    await p.close();
  }

  // ---- 8. Saved is called Faves now ----
  {
    const p=await open(b);
    // The bar no longer spells it out — the switch is a heart, which is
    // the same mark the cards use — so the page is where the word lives.
    await toFaves(p, 600);
    check('the switch is the heart the cards use',
      (await p.textContent('#nav-saved-btn')).trim() === '\u2665',
      (await p.textContent('#nav-saved-btn')).trim());
    check('so does the page',
      (await p.textContent('#saved-view h1')).trim() === 'Faves');
    check('and the empty state',
      /fave/i.test(await p.textContent('#saved-empty-title')),
      (await p.textContent('#saved-empty-title')).trim());

    // Nothing anywhere should still be calling it Saved.
    const strays = await p.evaluate(()=>{
      const out = [];
      for(const mode of ['inventory','outfits','saved','capsules','archive']){
        setMode(mode);
        const root = document.getElementById('app-root');
        const nav = document.getElementById('bottom-bar');
        for(const el of [root, nav]){
          for(const n of el.querySelectorAll('*')){
            if(n.offsetParent === null) continue;
            for(const c of n.childNodes){
              if(c.nodeType === 3 && /\bsaved\b/i.test(c.textContent)) out.push(mode+': '+c.textContent.trim());
            }
          }
        }
      }
      return out;
    });
    check('no page still calls it saved', strays.length === 0, strays.join(' | '));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
