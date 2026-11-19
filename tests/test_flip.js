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
    // Folding back needs some room to have scrolled in: a shorter screen.
    await p.setViewportSize({width:390,height:520}); await p.waitForTimeout(400);
    check('...and no longer once it is scrolled back to the top: it is a card again', await (async()=>{
      await p.evaluate(()=>{document.querySelector('#form-backdrop .modal').scrollTop = 60;});
      await p.waitForTimeout(600);
      await p.evaluate(()=>{document.querySelector('#form-backdrop .modal').scrollTop = 0;});
      await p.waitForTimeout(500);
      const bx = await box(p,'#form-backdrop .modal');
      return !(await p.evaluate(()=>document.querySelector('#form-backdrop .modal').classList.contains('card-full')))
        && Math.abs(bx.l-14)<1 && bx.t>40;
    })());
    check('the bar is still at the foot', (await box(p,'#form-backdrop .sheet-footer-inner')).b > (await p.evaluate(()=>innerHeight)) - 50);

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
    check('and its title and line are in that same card',
      await p.evaluate(()=>{ const l=document.querySelector('#outfit-page .outfit-page-list');
        return !!l.querySelector('.modal-name') && !!l.querySelector('.detail-sub') &&
          !document.querySelector('#outfit-page .outfit-page-body > .modal-name'); }));
    await p.click('#outfit-page .outfit-piece-row'); await p.waitForTimeout(900);
    check('a piece from a capsule unfolds the page then opens', await up(p,'modal-backdrop') &&
      await p.evaluate(()=>document.getElementById('outfit-page').classList.contains('expanded')));
    await p.close();
  }

  // ---- Edit capsule and Add accessories are full pages, not sheets --------
  {
    const p=await open(b);
    const page = async () => p.evaluate(()=>{
      const m=document.getElementById('modal'), r=m.getBoundingClientRect(), cs=getComputedStyle(m);
      return {t:Math.round(r.top), b:Math.round(r.bottom), l:Math.round(r.left), r:Math.round(r.right),
        radius:cs.borderTopLeftRadius, grip:!!m.querySelector('.sheet-grip'),
        asPage:document.getElementById('modal-backdrop').classList.contains('as-page'),
        bar:Math.round(m.querySelector('.sheet-footer-inner').getBoundingClientRect().bottom)};
    });
    const fullPage = (n, g) => check(n+' is a full page', g.asPage && g.t===0 && g.b===844 && g.l===0 && g.r===390 &&
      g.radius==='0px' && !g.grip && g.bar>=800, JSON.stringify(g));

    await p.evaluate(()=>{ capsules.push({id:'cap_e',name:'Edit me',description:'',itemIds:ITEMS.slice(0,4).map(i=>i.id)}); });
    await p.evaluate(()=>openCapsulePage('cap_e', null)); await p.waitForTimeout(700);
    await p.click('#capsule-page-edit'); await p.waitForTimeout(700);
    fullPage('Edit capsule', await page());
    await p.click('#modal .sheet-footer .btn.secondary'); await p.waitForTimeout(600);
    check('Cancel goes back to the capsule', !(await up(p,'modal-backdrop')) &&
      await p.evaluate(()=>document.getElementById('outfit-page').classList.contains('open')));

    await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
    await p.click('#nav-outfits-btn'); await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.evaluate(()=>openOutfitPage(comboKey(outfitDisplayed[0]), null)); await p.waitForTimeout(800);
    await p.click('#outfit-page-extras'); await p.waitForTimeout(700);
    fullPage('Add accessories', await page());
    await p.click('#modal .sheet-footer .btn.secondary'); await p.waitForTimeout(600);
    check('Cancel goes back to the outfit', !(await up(p,'modal-backdrop')) &&
      await p.evaluate(()=>document.getElementById('outfit-page').classList.contains('open')));
    await p.close();
  }

  // ---- the rule: buttons have a shadow and no outline; selectors the reverse --
  {
    const p=await open(b);
    const look = sel => p.evaluate(s=>{ const e=document.querySelector(s); if(!e) return null;
      const c=getComputedStyle(e); const clear=v=>/rgba\(0, 0, 0, 0\)|transparent/.test(v);
      return {outline:!clear(c.borderTopColor) && c.borderTopWidth!=='0px', shadow:c.boxShadow!=='none'}; }, sel);
    const isButton = (n, l) => check(n+' is a button: shadow, no outline', l && l.shadow && !l.outline, JSON.stringify(l));
    const isSelector = (n, l) => check(n+' is a selector: outline, no shadow', l && l.outline && !l.shadow, JSON.stringify(l));
    isSelector('a category tab', await look('#tabs .tab:not(.active)'));
    isButton('the add button', await look('#add-item-btn'));
    // The edit form: a Save button, and a category option to pick.
    await p.evaluate(()=>openPieceSheet(ITEMS[0].id)); await p.waitForTimeout(500);
    await p.click('#item-page-edit'); await p.waitForTimeout(700);
    isButton('Save piece', await look('#form-save-btn'));
    isButton('Cancel', await look('#form-backdrop .sheet-footer .btn.secondary'));
    isButton('Replace photo', await look('.form-photo'));
    await p.click('#form-category-field'); await p.waitForTimeout(400);
    isSelector('a category option', await look('#form-pick-list .capsule-pick'));
    isButton('Done on the category page', await look('#form-pick-done'));
    await p.close();
  }

  // ---- category and tags are picked on pages, like capsules ---------------
  {
    const p=await open(b);
    await p.evaluate(()=>{ const it=ITEMS.find(i=>i.id==='seed_0'); it.tags=['summer','work']; });
    await p.evaluate(()=>openPieceSheet('seed_0')); await p.waitForTimeout(500);
    await p.click('#item-page-edit'); await p.waitForTimeout(700);
    const rows = await p.evaluate(()=>({
      cat:document.getElementById('form-category-summary').textContent,
      tags:document.getElementById('form-tags-summary').textContent,
      oldFields: !!document.querySelector('#form-backdrop label #form-category, #form-backdrop label #form-tags')}));
    check('category and tags are rows showing their value, like capsules',
      rows.cat.length>0 && rows.tags==='summer, work' && !rows.oldFields, JSON.stringify(rows));

    // Category: find, pick, Done.
    await p.click('#form-category-field'); await p.waitForTimeout(400);
    check('the category page is a full page',
      await p.evaluate(()=>document.getElementById('modal-backdrop').classList.contains('as-page')));
    await p.fill('#form-pick-input','sho'); await p.waitForTimeout(200);
    const opts = await p.evaluate(()=>Array.from(document.querySelectorAll('#form-pick-list .capsule-pick')).map(e=>e.textContent.trim()));
    check('typing filters it, and offers to add what you typed',
      opts.some(o=>o.startsWith('Shorts')) && opts.some(o=>o.startsWith('Add')), opts.join(' | '));
    await p.locator('#form-pick-list .capsule-pick', {hasText:'Shorts'}).first().click();
    await p.click('#form-pick-done'); await p.waitForTimeout(500);
    check('Done puts it on the form', (await p.textContent('#form-category-summary')).trim()==='Shorts' &&
      await p.inputValue('#form-category')==='Shorts');
    check('and back on the card, not a new sheet',
      await p.evaluate(()=>document.getElementById('form-backdrop').classList.contains('item-card-back')));

    // A brand new category, by typing it.
    await p.click('#form-category-field'); await p.waitForTimeout(400);
    await p.fill('#form-pick-input','Kimonos'); await p.press('#form-pick-input','Enter');
    check('a new category is added and ticked',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#form-pick-list .capsule-pick.picked')).some(e=>e.textContent.includes('Kimonos'))));
    await p.click('#form-pick-done'); await p.waitForTimeout(500);
    check('and lands on the form', await p.inputValue('#form-category')==='Kimonos');

    // Tags: tick, untick, add new.
    await p.click('#form-tags-field'); await p.waitForTimeout(400);
    const picked = () => p.evaluate(()=>Array.from(document.querySelectorAll('#form-pick-list .capsule-pick.picked')).map(e=>e.textContent.replace('✓','').trim()));
    check('the piece\'s tags are ticked', JSON.stringify((await picked()).sort())==='["summer","work"]', (await picked()).join(','));
    await p.locator('#form-pick-list .capsule-pick', {hasText:'work'}).first().click();
    await p.fill('#form-pick-input','Linen, Brand New'); await p.click('#form-pick-add');
    check('untick one, add two new: new tags lead the list, ticked',
      JSON.stringify((await picked()).sort())==='["brand new","linen","summer"]', (await picked()).join(','));
    await p.click('#form-pick-done'); await p.waitForTimeout(500);
    check('Done stages them in the form, in order',
      await p.inputValue('#form-tags')==='summer, linen, brand new');
    // Back with a change asks first.
    await p.click('#form-tags-field'); await p.waitForTimeout(400);
    await p.locator('#form-pick-list .capsule-pick', {hasText:'summer'}).first().click();
    await p.click('#modal .sheet-footer .btn.secondary'); await p.waitForTimeout(300);
    check('Back with a change asks first',
      await p.evaluate(()=>document.getElementById('confirm-backdrop').classList.contains('open')));
    await p.click('#confirm-go'); await p.waitForTimeout(500);
    check('and Discard leaves the form as it was', await p.inputValue('#form-tags')==='summer, linen, brand new');
    // Save writes it.
    await p.click('#form-save-btn'); await p.waitForTimeout(600);
    const saved = await p.evaluate(()=>{const r=window.__WARDROBE_STATE.items.find(x=>x.id==='seed_0');return {c:r.category,t:r.tags};});
    check('saving keeps the category and tags', saved.c==='Kimonos' && JSON.stringify(saved.t)==='["summer","linen","brand new"]', JSON.stringify(saved));
    await p.close();
  }

  // ---- the outfit and its items are one container -----------------------
  {
    const p=await open(b);
    await p.click('#nav-outfits-btn'); await p.waitForSelector('.outfit-gallery .outfit-fav-btn');
    await p.waitForTimeout(900);
    await p.evaluate(()=>closeFilterSheet()); await p.waitForTimeout(500);
    await p.evaluate(()=>openOutfitPage(comboKey(outfitDisplayed[0]), null)); await p.waitForTimeout(800);
    const c = await p.evaluate(()=>{
      const card=document.querySelector('#outfit-page .outfit-page-card');
      if(!card) return null;
      const fl=card.querySelector('.outfit-page-flat'), li=card.querySelector('.outfit-page-list');
      const own = e => { const s=getComputedStyle(e); return s.backgroundColor!=='rgba(0, 0, 0, 0)' || s.borderTopWidth!=='0px'; };
      return {both:!!fl&&!!li, innerBoxed: own(fl)||own(li)};
    });
    check('the outfit and its item list share one card, with no boxes inside it',
      c && c.both && !c.innerBoxed, JSON.stringify(c));
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
