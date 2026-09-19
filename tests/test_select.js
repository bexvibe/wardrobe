// Selecting is a mode, so it gets what a mode needs: the count next to the
// buttons that act on it, both pinned where your thumb is, and a way out
// that is on screen however far you have scrolled. Plus the detail sheet
// under a piece's photo, which had eight type treatments and no hierarchy.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const TAGS={seed_0:['summer','work']};
const CAPS=[{id:'c1',name:'Weekend',archived_at:null,created_at:'2026-01-01'}];
const CAPITEMS=[{capsule_id:'c1',item_id:'seed_0',created_at:'2026-01-01'}];
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

async function open(b, w){
  const p=await b.newPage({viewport:{width:w||390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__WITH_CAPSULES=true;`+
         `window.__SEED_TAGS=${JSON.stringify(TAGS)};window.__SEED_CAPSULES=${JSON.stringify(CAPS)};`+
         `window.__SEED_CAPSULE_ITEMS=${JSON.stringify(CAPITEMS)};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(900);
  return p;
}

const bar = p => p.textContent('#bulk-bar').then(t=>t.replace(/\s+/g,' ').trim());
async function longPress(p, sel){
  const box = await p.locator(sel).first().boundingBox();
  await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
  await p.waitForTimeout(500);
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. What the mode looks like ----
  {
    const p=await open(b);
    check('the navigation is there at rest', await p.isVisible('.bottom-bar'));
    check('and no action bar', !(await p.isVisible('#bulk-bar')));

    await longPress(p, '#gallery .tile');
    check('holding a piece enters the mode holding that piece',
      await p.evaluate(()=>editMode && selectedIds.size===1));
    // No title: the checkboxes and the action bar already say what is going
    // on, and naming it as well was a third voice saying the same thing.
    check('the head carries no title in the mode',
      await p.evaluate(()=>document.getElementById('wardrobe-title').offsetParent === null));
    check('the count is in the bar, with the buttons that act on it',
      (await bar(p))==='1 selected Select all Delete selected', await bar(p));
    check('and the navigation stands down', !(await p.isVisible('.bottom-bar')));
    check('the way out is the arrow every sheet uses, on the left',
      (await p.isVisible('#edit-back-btn')) &&
      (await p.evaluate(()=>{
        const bk=document.getElementById('edit-back-btn').getBoundingClientRect();
        const head=document.getElementById('wardrobe-head').getBoundingClientRect();
        return Boolean(document.querySelector('#edit-back-btn .back-glyph')) &&
               bk.left - head.left < 24;
      })));
    check('and there is no Done button any more',
      await p.evaluate(()=>!document.getElementById('edit-done-btn')));
    check('and the icons are not', await p.evaluate(()=>
      ['search-btn','view-toggle-btn','add-item-btn'].every(id =>
        getComputedStyle(document.getElementById(id)).display === 'none')));
    await p.close();
  }

  // ---- 2. Both fixtures survive a scroll, which is the whole point ----
  {
    const p=await open(b);
    const restHeight = await p.evaluate(()=>
      Math.round(document.getElementById('wardrobe-head').getBoundingClientRect().height));
    await longPress(p, '#gallery .tile');
    // What the bar looks like before a single pixel of scrolling: it should
    // already be sitting where it will sit once it sticks, rather than
    // dropping the page's top padding the moment you move.
    const selectingRest = await p.evaluate(()=>{
      const r = document.getElementById('wardrobe-head').getBoundingClientRect();
      return {top: Math.round(r.top), height: Math.round(r.height)};
    });
    await p.evaluate(()=>window.scrollTo({top:2200})); await p.waitForTimeout(600);
    const g = await p.evaluate(rest => {
      const on = el => { const r=el.getBoundingClientRect();
                         return r.top >= 0 && r.bottom <= innerHeight; };
      return {
        scrolled: Math.round(scrollY),
        done: on(document.getElementById('edit-back-btn')),
        doneTop: Math.round(document.getElementById('edit-back-btn').getBoundingClientRect().top),
        bar: on(document.getElementById('bulk-bar')),
        headTop: Math.round(document.getElementById('wardrobe-head').getBoundingClientRect().top),
        headHeight: Math.round(document.getElementById('wardrobe-head').getBoundingClientRect().height),
        restHeight: rest.page,
        selectingRestTop: rest.selecting.top,
        selectingRestHeight: rest.selecting.height,
        title: document.getElementById('wardrobe-title').textContent.trim(),
      };
    }, {page: restHeight, selecting: selectingRest});
    check('scrolled a long way down', g.scrolled > 1800, String(g.scrolled));
    check('the head is stuck to the top of the screen', g.headTop === 0, `${g.headTop}px`);
    check('so the way out is still on screen', g.done, `Back at ${g.doneTop}px`);
    check('the action bar is still on screen too', g.bar);
    check('and the head is shallower than the page head it replaced',
      g.headHeight <= 60 && g.headHeight < g.restHeight,
      `${g.headHeight}px vs ${g.restHeight}px at rest`);
    check('and it is the same bar it was before you scrolled',
      g.headHeight === g.selectingRestHeight && g.selectingRestTop === 0,
      `${g.selectingRestTop}..${g.selectingRestTop + g.selectingRestHeight} at rest, ` +
      `${g.headTop}..${g.headTop + g.headHeight} stuck`);
    // Two buttons a thumb has to hit while the other hand holds the phone.
    check('both actions are thumb-sized', await p.evaluate(()=>
      Array.from(document.querySelectorAll('#bulk-bar .btn'))
        .every(x => x.getBoundingClientRect().height >= 44 &&
                    x.getBoundingClientRect().width >= 80)),
      await p.evaluate(()=>Array.from(document.querySelectorAll('#bulk-bar .btn'))
        .map(x=>`${x.textContent.trim()} ${Math.round(x.getBoundingClientRect().width)}x${Math.round(x.getBoundingClientRect().height)}`).join(', ')));
    check('and the bar still fits the screen without scrolling',
      await p.evaluate(()=>{
        const b=document.getElementById('bulk-bar');
        return b.scrollWidth <= b.clientWidth && b.getBoundingClientRect().left >= 0;
      }));

    // Clickable, not merely visible — the nav pill used to sit over it.
    await p.click('#bulk-bar button:has-text("Select all")'); await p.waitForTimeout(500);
    check('the bar can actually be tapped where it sits',
      (await p.evaluate(()=>selectedIds.size)) > 1, await bar(p));
    await p.close();
  }

  // ---- 3. The bar says what it will do ----
  {
    const p=await open(b);
    await longPress(p, '#gallery .tile');
    await p.click('#bulk-bar button:has-text("Select all")'); await p.waitForTimeout(500);
    const all = await p.evaluate(()=>visibleFilteredItems('').length);
    check('Select all takes everything on the page',
      (await p.evaluate(()=>selectedIds.size))===all, `${await p.evaluate(()=>selectedIds.size)} of ${all}`);
    check('and the button offers to put them back',
      await p.isVisible('#bulk-bar button:has-text("Deselect all")'), await bar(p));
    await p.click('#bulk-bar button:has-text("Deselect all")'); await p.waitForTimeout(500);
    check('which it does', (await p.evaluate(()=>selectedIds.size))===0);
    check('with nothing selected it says so rather than counting zero',
      (await bar(p)).startsWith('Select pieces'), await bar(p));
    check('and there is nothing to delete',
      await p.evaluate(()=>document.querySelector('#bulk-bar button:last-child').disabled));
    await p.close();
  }

  // ---- 4. Two ways out, and neither strands you ----
  {
    const p=await open(b);
    await longPress(p, '#gallery .tile');
    await p.evaluate(()=>window.scrollTo({top:1500})); await p.waitForTimeout(400);
    await p.click('#edit-back-btn'); await p.waitForTimeout(600);
    check('Back leaves the mode', !(await p.evaluate(()=>editMode)));
    check('the navigation comes back', await p.isVisible('.bottom-bar'));
    check('the action bar goes', !(await p.isVisible('#bulk-bar')));
    check('and nothing is left selected', (await p.evaluate(()=>selectedIds.size))===0);
    check('the head is a normal head again, with the page name back',
      await p.evaluate(()=>!document.getElementById('wardrobe-head').classList.contains('selecting') &&
        document.getElementById('wardrobe-title').offsetParent !== null &&
        document.getElementById('wardrobe-title').textContent.trim()==='Wardrobe'));

    await longPress(p, '#gallery .tile');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    check('Escape is the other way out', !(await p.evaluate(()=>editMode)));
    check('and it restores the navigation too', await p.isVisible('.bottom-bar'));
    await p.close();
  }

  // ---- 5. A selection cannot follow you to another page ----
  {
    const p=await open(b);
    await longPress(p, '#gallery .tile');
    await p.evaluate(()=>setMode('outfits')); await p.waitForTimeout(900);
    check('leaving the wardrobe ends the selection', !(await p.evaluate(()=>editMode)));
    check('so the navigation cannot be left hidden on a page that needs it',
      await p.isVisible('.bottom-bar'));
    await p.close();
  }

  // ---- 6. The detail sheet has a hierarchy now ----
  {
    const p=await open(b);
    await p.evaluate(()=>openModal('seed_0')); await p.waitForTimeout(900);
    const d = await p.evaluate(()=>{
      const facts = Array.from(document.querySelectorAll('.detail-facts dt'))
        .map(dt => [dt.textContent.trim(), dt.nextElementSibling.textContent.trim()]);
      const name = document.querySelector('.modal-name');
      const sub = document.querySelector('.detail-sub');
      return {
        name: name.textContent.trim(),
        nameSize: parseFloat(getComputedStyle(name).fontSize),
        sub: sub.textContent.trim(),
        subSize: parseFloat(getComputedStyle(sub).fontSize),
        facts,
        labelCols: [...new Set(Array.from(document.querySelectorAll('.detail-facts dt'))
          .map(dt => Math.round(dt.getBoundingClientRect().left)))],
        valueCols: [...new Set(Array.from(document.querySelectorAll('.detail-facts dd'))
          .map(dd => Math.round(dd.getBoundingClientRect().left)))],
        chip: Boolean(document.querySelector('.detail-chip')),
      };
    });
    check('the name leads', d.name==='Fleece jacket' && d.nameSize >= 20, `${d.name} at ${d.nameSize}px`);
    check('brand and category are one quiet line under it, not two treatments',
      d.sub==='Patagonia · Jackets' && d.subSize < d.nameSize, `${d.sub} at ${d.subSize}px`);
    check('the loose category chip is gone', !d.chip);
    check('every other fact is labelled',
      JSON.stringify(d.facts.map(f=>f[0])) ===
        JSON.stringify(['Price','From','Tags','Capsules']),
      d.facts.map(f=>f[0]).join(', '));
    check('and the values are what they say',
      d.facts[0][1]==='NZD $142.00' && d.facts[1][1]==='Depop' &&
      /summer/.test(d.facts[2][1]) && d.facts[3][1]==='Weekend',
      JSON.stringify(d.facts));
    check('labels share one column', d.labelCols.length===1, JSON.stringify(d.labelCols));
    check('and values share another', d.valueCols.length===1, JSON.stringify(d.valueCols));

    // Size is "-" on this piece, which is not a fact worth a row.
    check('a fact with nothing in it is left out, not stated',
      !d.facts.some(f=>f[0]==='Size'), d.facts.map(f=>f[0]).join(', '));
    check('and "not in a capsule yet" is not a line either',
      !/not in a capsule/i.test(await p.textContent('.modal-body')));
    await p.close();
  }

  // ---- 7. A piece with nothing on it shows nothing ----
  {
    const p=await open(b);
    const bare = await p.evaluate(()=>{
      // Not seed_0 — that one is in a capsule, which is a detail.
      const i = ITEMS.find(x=>x.photo && !capsulesForItem(x.id).length);
      i.price=''; i.source=''; i.size='-'; i.tags=[];
      return i.id;
    });
    await p.evaluate(id=>openModal(id), bare); await p.waitForTimeout(700);
    check('no empty label grid on a piece with no details',
      await p.evaluate(()=>!document.querySelector('.detail-facts')));
    check('the name and what it is are still there',
      await p.evaluate(()=>Boolean(document.querySelector('.modal-name').textContent.trim() &&
                                   document.querySelector('.detail-sub').textContent.trim())));
    await p.close();
  }

  // ---- 8. Tapping the piece you are already on takes you to the top ----
  {
    const p=await open(b);
    const id = await p.evaluate(()=>ITEMS.find(i=>tabForItem(i)==='Jackets').id);
    await p.evaluate(i=>openModal(i), id); await p.waitForTimeout(1300);
    await p.click('#m-outfit-gallery .outfit-card'); await p.waitForTimeout(600);
    await p.evaluate(()=>document.getElementById('modal-backdrop').scrollTo({top:1400}));
    await p.waitForTimeout(500);
    check('scrolled down the piece\'s own sheet',
      (await p.evaluate(()=>document.getElementById('modal-backdrop').scrollTop)) > 1000);

    const rows = await p.evaluate(i=>Array.from(document.querySelectorAll('#m-outfit-gallery .outfit-piece-row'))
      .map(r=>(r.getAttribute('onclick')||'').includes(i)), id);
    const self = rows.indexOf(true);
    check('the piece itself is listed under one of its own outfits', self >= 0);
    await p.locator('#m-outfit-gallery .outfit-piece-row').nth(self).click();
    await p.waitForTimeout(900);
    const after = await p.evaluate(i=>({
      top: document.getElementById('modal-backdrop').scrollTop,
      open: document.getElementById('modal-backdrop').classList.contains('open'),
      same: sheetTrail[sheetTrail.length-1].id===i,
    }), id);
    check('tapping it takes you back up to it', after.top===0, `${after.top}px`);
    check('rather than nowhere — the sheet is still open', after.open);
    check('and still on the same piece', after.same);
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
