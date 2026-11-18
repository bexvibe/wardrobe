// Editing a piece you opened from the wardrobe turns its card over: the
// front goes edge-on, the back (the form) comes round from the far edge, and
// Cancel or Save turns it back. Scrolling the back unfolds the card to the
// whole screen. From an outfit or capsule page, or for a new piece, there is
// no card to turn and nothing changes.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b, opts){
  const p=await b.newPage(Object.assign({viewport:{width:390,height:844}}, opts||{}));
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);
  return p;
}
const up = (p, id) => p.evaluate(i=>document.getElementById(i).classList.contains('open'), id);
const rot = (p, sel) => p.evaluate(s=>{
  const m = new DOMMatrix(getComputedStyle(document.querySelector(s)).transform);
  return Math.round(Math.atan2(m.m13 || 0, m.m11 || 1) * 180 / Math.PI) || Math.round(Math.asin(-m.m13||0)*180/Math.PI);
}, sel);
const box = (p, sel) => p.evaluate(s=>{ const r=document.querySelector(s).getBoundingClientRect();
  return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; }, sel);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  fs.mkdirSync(SHOTS,{recursive:true});

  // ---- the turn, from the wardrobe -------------------------------------
  {
    const p=await open(b);
    const id = await p.evaluate(()=>ITEMS.find(i=>tabForItem(i)==='Tops').id);
    await p.evaluate(i=>openPieceSheet(i), id); await p.waitForTimeout(600);
    check('a piece from the wardrobe is a card',
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('item-card')));

    await p.click('#item-page-edit');
    await p.waitForTimeout(60);
    check('the front starts turning at once',
      await p.evaluate(()=>document.getElementById('modal').classList.contains('flip-out-fwd')));
    check('and the form is not up yet', !(await up(p,'form-backdrop')));
    await p.screenshot({path:path.join(SHOTS,'flip_1_front_turning.png')});
    await p.waitForTimeout(150);
    check('halfway the back is the one showing',
      await up(p,'form-backdrop') && !(await up(p,'modal-backdrop')));
    await p.screenshot({path:path.join(SHOTS,'flip_2_back_arriving.png')});
    await p.waitForTimeout(400);
    check('settled: the back is a card, not a sheet',
      await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('item-card-back')));
    check('no flip classes left behind', await p.evaluate(()=>
      !document.querySelector('.modal[class*="flip-"]')));
    check('the trail is item > form',
      JSON.stringify(await p.evaluate(()=>sheetTrail.map(e=>e.sheet)))==='["item","form"]');
    const front = await p.evaluate(id=>0, id);
    const cardBox = await box(p,'#form-backdrop .modal');
    check('same card geometry as the front: inset 14px each side',
      Math.abs(cardBox.l-14)<1 && Math.abs(390-cardBox.r-14)<1, JSON.stringify(cardBox));
    check('the form has the piece in it',
      (await p.inputValue('#form-name')).length > 0);
    await p.screenshot({path:path.join(SHOTS,'flip_3_back.png')});

    // ---- scrolling the back unfolds it ---------------------------------
    const room = await p.evaluate(()=>{const m=document.querySelector('#form-backdrop .modal');return m.scrollHeight-m.clientHeight;});
    check('the form has something to scroll to', room > 0, 'room '+room);
    check('not unfolded before it is scrolled',
      !(await p.evaluate(()=>document.querySelector('#form-backdrop .modal').classList.contains('card-full'))));
    await p.evaluate(()=>{document.querySelector('#form-backdrop .modal').scrollTop = 40;});
    await p.waitForTimeout(80);
    await p.screenshot({path:path.join(SHOTS,'flip_4_unfolding.png')});
    await p.waitForTimeout(400);
    const full = await box(p,'#form-backdrop .modal');
    check('scrolled: it has grown to the whole screen',
      full.l<=0.5 && Math.abs(full.r-390)<1 && full.t<=1 && Math.abs(full.b-844)<1, JSON.stringify(full));
    await p.screenshot({path:path.join(SHOTS,'flip_5_full.png')});
    check('...and no longer once it is scrolled back to the top: it is a card again', await (async()=>{
      await p.evaluate(()=>{document.querySelector('#form-backdrop .modal').scrollTop = 60;});
      await p.waitForTimeout(600);
      await p.evaluate(()=>{document.querySelector('#form-backdrop .modal').scrollTop = 0;});
      await p.waitForTimeout(500);
      const bx = await box(p,'#form-backdrop .modal');
      return !(await p.evaluate(()=>document.querySelector('#form-backdrop .modal').classList.contains('card-full')))
        && Math.abs(bx.l-14)<1 && bx.t>40;
    })());
    check('the bar is still at the foot', (await box(p,'#form-backdrop .sheet-footer-inner')).b > 800);

    // ---- cancel turns it back ------------------------------------------
    await p.click('#form-backdrop .sheet-footer .btn.secondary');
    await p.waitForTimeout(60);
    check('Cancel turns the back away', await p.evaluate(()=>
      document.querySelector('#form-backdrop .modal').classList.contains('flip-out-back')));
    await p.waitForTimeout(500);
    check('and the front is a card again',
      await up(p,'modal-backdrop') && !(await up(p,'form-backdrop')) &&
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('item-card')));
    check('trail is back to the piece',
      JSON.stringify(await p.evaluate(()=>sheetTrail.map(e=>e.sheet)))==='["item"]');
    check('no flip classes left behind (back)', await p.evaluate(()=>
      !document.querySelector('.modal[class*="flip-"]')));

    // ---- the second time starts folded again ---------------------------
    await p.click('#item-page-edit'); await p.waitForTimeout(600);
    check('opens as a card again, not still unfolded',
      !(await p.evaluate(()=>document.querySelector('#form-backdrop .modal').classList.contains('card-full'))));

    // ---- save turns it back with the change on the front ---------------
    await p.fill('#form-name','Flip test tee');
    await p.click('#form-save-btn'); await p.waitForTimeout(700);
    check('Save turns back to the front',
      await up(p,'modal-backdrop') && !(await up(p,'form-backdrop')));
    check('and the front shows what was saved',
      (await p.textContent('#modal .modal-name')).trim()==='Flip test tee');

    // ---- taps during the turn are ignored ------------------------------
    await p.evaluate(()=>{ openItemForm(sheetTrail[0].id); openItemForm(sheetTrail[0].id); });
    await p.waitForTimeout(700);
    check('a double tap is one step deeper, not two',
      JSON.stringify(await p.evaluate(()=>sheetTrail.map(e=>e.sheet)))==='["item","form"]');
    await p.close();
  }

  // ---- the front of the card: fixed height, unfolds on scroll -------------
  {
    const p=await open(b, {viewport:{width:390,height:440}});
    const ids = await p.evaluate(()=>[ITEMS[0].id, ITEMS[ITEMS.length-1].id]);
    const heights = [];
    for(const id of ids){
      await p.evaluate(i=>openPieceSheet(i), id); await p.waitForTimeout(600);
      heights.push(Math.round((await box(p,'#modal')).h));
      await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
    }
    check('two different pieces get the same card height', heights[0]===heights[1], heights.join(' vs '));
    await p.evaluate(i=>openPieceSheet(i), ids[0]); await p.waitForTimeout(600);
    const room = await p.evaluate(()=>{const m=document.getElementById('modal');return m.scrollHeight-m.clientHeight;});
    const isFull = () => p.evaluate(()=>document.getElementById('modal').classList.contains('card-full'));
    check('a short screen gives the card something to scroll', room > 100, 'room '+room);
    if(room > 100){
      check('not unfolded before it is scrolled', !(await isFull()));
      await p.evaluate(()=>{document.getElementById('modal').scrollTop = 50;}); await p.waitForTimeout(500);
      const full = await box(p,'#modal');
      check('scrolling the front unfolds it to the whole screen',
        await isFull() && full.l<=0.5 && Math.abs(full.r-390)<1 && full.t<=1, JSON.stringify(full));
      // Turned over while unfolded: the back arrives the same size.
      await p.click('#item-page-edit'); await p.waitForTimeout(600);
      const back = await box(p,'#form-backdrop .modal');
      check('turned over unfolded, the back arrives unfolded too', back.l<=0.5 && back.t<=1, JSON.stringify(back));
      await p.click('#form-backdrop .sheet-footer .btn.secondary'); await p.waitForTimeout(600);
      check('and turns back to an unfolded front', await isFull());
      await p.evaluate(()=>{document.getElementById('modal').scrollTop = 60;}); await p.waitForTimeout(500);
      await p.evaluate(()=>{document.getElementById('modal').scrollTop = 0;}); await p.waitForTimeout(500);
      check('scrolled back to the top it folds into the card again', !(await isFull()));
    } else {
      check('(this piece fits its card, nothing to unfold)', true, 'room '+room);
    }
    await p.close();
  }

  // ---- the outfit and capsule pages do the same --------------------------
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.evaluate(()=>openOutfitPage(comboKey(outfitDisplayed[0]), null)); await p.waitForTimeout(800);
    const ex = () => p.evaluate(()=>document.getElementById('outfit-page').classList.contains('expanded'));
    check('an outfit opens as a card', !(await ex()));
    await p.evaluate(()=>document.getElementById('outfit-page').scrollTo({top:200})); await p.waitForTimeout(700);
    check('scrolled, the outfit becomes the full page', await ex());
    await p.evaluate(()=>document.getElementById('outfit-page').scrollTo({top:0})); await p.waitForTimeout(700);
    check('and a card again at the top', !(await ex()));
    await p.close();
  }
  {
    const p=await open(b);
    await p.evaluate(()=>{ capsules.push({id:'cap_t',name:'Test',description:'',itemIds:ITEMS.slice(0,12).map(i=>i.id)}); });
    await p.evaluate(()=>openCapsulePage('cap_t', null)); await p.waitForTimeout(800);
    const ex = () => p.evaluate(()=>document.getElementById('outfit-page').classList.contains('expanded'));
    check('a capsule opens as a card', await p.evaluate(()=>document.getElementById('outfit-page').classList.contains('open')) && !(await ex()));
    await p.evaluate(()=>document.getElementById('outfit-page').scrollTo({top:300})); await p.waitForTimeout(700);
    check('scrolled, the capsule becomes the full page', await ex());
    await p.evaluate(()=>document.getElementById('outfit-page').scrollTo({top:0})); await p.waitForTimeout(700);
    check('and a card again at the top', !(await ex()));
    await p.close();
  }

  // ---- heart up top, capsule on white, piece from a page unfolds it first --
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.evaluate(()=>openOutfitPage(comboKey(outfitDisplayed[0]), null)); await p.waitForTimeout(800);
    const heart = await p.evaluate(()=>{
      const h=document.querySelector('#outfit-page .outfit-page-flat .outfit-fav-btn');
      const f=document.querySelector('#outfit-page .outfit-page-flat');
      if(!h) return null; const hr=h.getBoundingClientRect(), fr=f.getBoundingClientRect();
      return {top:Math.round(hr.top-fr.top), right:Math.round(fr.right-hr.right), onBar:!!document.querySelector('#outfit-page .sheet-footer .outfit-fav-btn')};
    });
    check('the heart is on the outfit picture, top right', heart && heart.top<=14 && heart.right<=14, JSON.stringify(heart));
    check('and no longer down on the bar', heart && !heart.onBar);
    const lvl = () => p.evaluate(()=>document.querySelector('#outfit-page .fave-heart').dataset.level);
    const before = await lvl();
    await p.click('#outfit-page .outfit-page-flat .fave-heart'); await p.waitForTimeout(500);
    check('tapping it still changes the fave level', (await lvl()) !== before, before+' > '+(await lvl()));

    // A piece from the page: the page unfolds first, then the piece rises.
    const ex = () => p.evaluate(()=>document.getElementById('outfit-page').classList.contains('expanded'));
    check('the outfit is a card before a piece is chosen', !(await ex()));
    await p.click('#outfit-page .outfit-piece-row'); await p.waitForTimeout(60);
    check('choosing a piece unfolds the page at once', await ex());
    check('...before the piece is up', !(await up(p,'modal-backdrop')));
    await p.waitForTimeout(600);
    check('then the piece rises over the full page', await up(p,'modal-backdrop') && await ex());
    await p.close();
  }
  {
    const p=await open(b);
    await p.evaluate(()=>{ capsules.push({id:'cap_w',name:'White',description:'x',itemIds:ITEMS.slice(0,6).map(i=>i.id)}); });
    await p.evaluate(()=>openCapsulePage('cap_w', null)); await p.waitForTimeout(800);
    const bg = await p.evaluate(()=>{ const l=document.querySelector('#outfit-page .outfit-page-list');
      return l && {bg:getComputedStyle(l).backgroundColor, rows:l.querySelectorAll('.outfit-piece-row').length}; });
    const surf = await p.evaluate(()=>{const d=document.createElement('i');d.style.background='var(--surface)';document.body.appendChild(d);const c=getComputedStyle(d).backgroundColor;d.remove();return c;});
    check('the capsule\'s pieces sit on a white card', bg && bg.bg===surf && bg.rows===6, JSON.stringify(bg)+' vs '+surf);
    await p.click('#outfit-page .outfit-piece-row'); await p.waitForTimeout(900);
    check('a piece from a capsule unfolds the page then opens', await up(p,'modal-backdrop') &&
      await p.evaluate(()=>document.getElementById('outfit-page').classList.contains('expanded')));
    await p.close();
  }

  // ---- the page behind does not scroll ----------------------------------
  {
    const p=await open(b);
    const id = await p.evaluate(()=>ITEMS.find(i=>tabForItem(i)==='Tops').id);
    const refused = sel => p.evaluate(s=>{
      const e = new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});
      document.querySelector(s).dispatchEvent(e); return e.defaultPrevented; }, sel);
    check('with nothing open the page scrolls freely', !(await refused('#gallery')));
    await p.evaluate(i=>openPieceSheet(i), id); await p.waitForTimeout(500);
    check('a piece open: a wheel over the dimmed page is refused', await refused('#modal-backdrop'));
    await p.click('#item-page-edit'); await p.waitForTimeout(600);
    check('the form open: the same', await refused('#form-backdrop'));
    await p.close();
  }

  // ---- the sheets put away mid-turn --------------------------------------
  {
    const p=await open(b);
    const id = await p.evaluate(()=>ITEMS.find(i=>tabForItem(i)==='Tops').id);
    await p.evaluate(i=>openPieceSheet(i), id); await p.waitForTimeout(500);
    await p.click('#item-page-edit'); await p.waitForTimeout(40);
    await p.evaluate(()=>closeModal());
    await p.waitForTimeout(500);
    check('closed mid-turn: nothing is left edge-on or half open',
      !(await up(p,'form-backdrop')) && !(await up(p,'modal-backdrop')) &&
      await p.evaluate(()=>!document.querySelector('.modal[class*="flip-"]') && sheetTrail.length===0));
    await p.click('#add-item-btn'); await p.waitForTimeout(400);
    check('and the next thing opens normally, as a plain sheet',
      await up(p,'form-backdrop') &&
      JSON.stringify(await p.evaluate(()=>sheetTrail.map(e=>e.sheet)))==='["form"]');
    await p.close();
  }
  {
    const p=await open(b);
    const id = await p.evaluate(()=>ITEMS.find(i=>tabForItem(i)==='Tops').id);
    await p.evaluate(i=>openPieceSheet(i), id); await p.waitForTimeout(500);
    await p.click('#item-page-edit'); await p.waitForTimeout(600);
    await p.click('#form-backdrop .sheet-footer .btn.secondary'); await p.waitForTimeout(40);
    await p.evaluate(()=>closeModal());
    await p.waitForTimeout(500);
    check('closed mid-turn-back: it stays closed, trail empty',
      !(await up(p,'form-backdrop')) && !(await up(p,'modal-backdrop')) &&
      await p.evaluate(()=>sheetTrail.length===0 && !document.querySelector('.modal[class*="flip-"]')));
    await p.close();
  }

  // ---- no card, no turn --------------------------------------------------
  {
    const p=await open(b);
    await p.click('#add-item-btn'); await p.waitForTimeout(500);
    check('a new piece is the ordinary sheet',
      await up(p,'form-backdrop') &&
      !(await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('item-card-back'))));
    await p.close();
  }
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.evaluate(()=>openOutfitPage(comboKey(outfitDisplayed[0]), null)); await p.waitForTimeout(700);
    await p.evaluate(()=>openPieceSheet(comboPieces(comboForKey(sheetTrail[0].id))[0].id)); await p.waitForTimeout(700);
    check('a piece over an outfit page is the same card as from the wardrobe',
      (await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('item-card'))));
    await p.click('#item-page-edit'); await p.waitForTimeout(100);
    await p.waitForTimeout(600);
    check('so its form is the back of that card',
      await up(p,'form-backdrop') &&
      (await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('item-card-back'))));
    await p.close();
  }

  // ---- reduced motion: same states, at once ----------------------------
  {
    const p=await open(b,{reducedMotion:'reduce'});
    const id = await p.evaluate(()=>ITEMS.find(i=>tabForItem(i)==='Tops').id);
    await p.evaluate(i=>openPieceSheet(i), id); await p.waitForTimeout(400);
    await p.click('#item-page-edit'); await p.waitForTimeout(80);
    check('reduced motion: the form is up straight away, no turn',
      await up(p,'form-backdrop') && !(await up(p,'modal-backdrop')));
    await p.click('#form-backdrop .sheet-footer .btn.secondary'); await p.waitForTimeout(80);
    check('and Cancel goes straight back',
      await up(p,'modal-backdrop') && !(await up(p,'form-backdrop')));
    await p.close();
  }

  await b.close();
  const ok=results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  process.exit(ok===results.length?0:1);
})();
