// Capsules: named collections of pieces, one large card per row.
const { chromium } = require('playwright');
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


async function open(b, opts){
  const o = opts || {};
  const p = await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  p.setDefaultTimeout(8000);
  const pre = [
    `window.__SEED_ITEMS=${seed};`,
    o.noCapsules ? 'window.__NO_CAPSULES=true;' : '',
    o.capsules ? `window.__SEED_CAPSULES=${JSON.stringify(o.capsules)};` : '',
    o.members ? `window.__SEED_CAPSULE_ITEMS=${JSON.stringify(o.members)};` : '',
  ].join('');
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`${pre}\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(500);
  return p;
}

const cards = p => p.evaluate(()=>document.querySelectorAll('#capsule-gallery .outfit-card').length);
// Tapping a card toggles it, so only tap when it is not already open.
async function expandCard(p){
  const open = await p.evaluate(()=>Boolean(document.querySelector('#capsule-gallery .outfit-card.expanded')));
  if(!open){
    await p.click('#capsule-gallery .outfit-card');
    await p.waitForTimeout(400);
  }
}
const db = p => p.evaluate(()=>({
  capsules: window.__WARDROBE_STATE.capsules,
  members: window.__WARDROBE_STATE.capsule_items,
}));

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. The destination, and building the first capsule ----
  {
    const p=await open(b);
    check('Capsules is a destination in the bottom bar', await p.isVisible('#nav-capsules-btn'));
    check('four destinations fit the screen without clipping',
      await p.evaluate(()=>{
        const bar=document.getElementById('bottom-bar');
        const r=bar.getBoundingClientRect();
        return bar.scrollWidth <= Math.ceil(r.width) + 1 && r.left >= 0 && r.right <= window.innerWidth;
      }),
      await p.evaluate(()=>{
        const bar=document.getElementById('bottom-bar');
        return `content ${bar.scrollWidth}px in ${Math.round(bar.getBoundingClientRect().width)}px box`;
      }));

    await p.click('#nav-capsules-btn'); await p.waitForTimeout(400);
    check('empty state explains what a capsule is', await p.isVisible('#capsule-empty'));
    check('the Filters pill stays out of the capsules page', !(await p.isVisible('#filters-fab')));

    // build one
    await p.click('#new-capsule-btn'); await p.waitForTimeout(400);
    await p.click('#capsule-save-btn'); await p.waitForTimeout(300);
    check('a capsule cannot be saved without a name',
      (await p.textContent('#capsule-error')).includes('name'),
      (await p.textContent('#capsule-error')).trim());

    await p.fill('#capsule-name-input','winter');
    const tiles = await p.evaluate(()=>document.querySelectorAll('#capsule-editor-gallery .picker-tile').length);
    check('the editor offers the whole wardrobe to pick from', tiles===80, `${tiles} tiles`);

    await p.click('#capsule-editor-gallery .picker-tile:nth-child(1)');
    await p.click('#capsule-editor-gallery .picker-tile:nth-child(2)');
    await p.click('#capsule-editor-gallery .picker-tile:nth-child(3)');
    await p.waitForTimeout(200);
    // No count line: the tiles tick where you tap them, which is the same
    // news said once instead of twice.
    check('nothing counts them back at you',
      await p.evaluate(()=>!document.getElementById('capsule-editor-count')));
    check('the draft holds all three all the same',
      await p.evaluate(()=>capsuleDraft.itemIds.size===3),
      String(await p.evaluate(()=>capsuleDraft.itemIds.size)));
    check('selected tiles are marked',
      await p.evaluate(()=>document.querySelectorAll('#capsule-editor-gallery .picker-selected').length)===3);

    await p.click('#capsule-save-btn'); await p.waitForTimeout(600);
    check('saving lands back on the capsules page', await p.isVisible('#capsules-view'));
    check('the capsule is on screen', await cards(p)===1);
    check('the card is named', (await p.textContent('.capsule-name'))==='winter',
      await p.textContent('.capsule-name'));
    check('and does not count its pieces at you',
      await p.evaluate(()=>!document.querySelector('.capsule-count') &&
                           !document.getElementById('capsule-count-line')));
    check('the pieces themselves are drawn',
      await p.evaluate(()=>document.querySelectorAll('#capsule-gallery .capsule-band > *').length)===3,
      String(await p.evaluate(()=>document.querySelectorAll('#capsule-gallery .capsule-band > *').length)));

    const state = await db(p);
    check('one capsules row written, with its name',
      state.capsules.length===1 && state.capsules[0].name==='winter' && !state.capsules[0].archived_at);
    check('three membership rows written, all pointing at it',
      state.members.length===3 && state.members.every(m=>m.capsule_id===state.capsules[0].id),
      `${state.members.length} rows`);
    await p.screenshot({path:shot('cap1-one.png')});
    await p.close();
  }

  // ---- 2. One card per row on a phone ----
  {
    const p=await open(b, {
      capsules:[{id:'cap_a',name:'winter',archived_at:null,created_at:'2026-01-01'},
                {id:'cap_b',name:'evening',archived_at:null,created_at:'2026-01-02'}],
      members:[{capsule_id:'cap_a',item_id:'seed_0',created_at:'2026-01-01'},
               {capsule_id:'cap_a',item_id:'seed_1',created_at:'2026-01-01'},
               {capsule_id:'cap_b',item_id:'seed_0',created_at:'2026-01-02'}],
    });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
    check('both capsules load from the database', await cards(p)===2);

    const rows = await p.evaluate(()=>{
      const cs=Array.from(document.querySelectorAll('#capsule-gallery .outfit-card'));
      return cs.map(c=>{const r=c.getBoundingClientRect();return {top:Math.round(r.top),width:Math.round(r.width)};});
    });
    check('one capsule per row on a phone', rows[0].top !== rows[1].top,
      `tops ${rows.map(r=>r.top).join(', ')}`);
    check('a card spans the full content width', rows[0].width > 300, `${rows[0].width}px`);

    check('a piece can sit in more than one capsule',
      await p.evaluate(()=>capsules.filter(c=>c.itemIds.includes('seed_0')).length)===2);
    await p.screenshot({path:shot('cap2-two.png')});
    await p.close();
  }

  // ---- 2b. Laid out as worn, and every piece inside the card ----
  {
    // a hat, two jackets, a dress and a pair of boots
    const p=await open(b, {
      capsules:[{id:'cap_a',name:'Summer',archived_at:null,created_at:'2026-01-01'}],
      members:[69,68,3,4,32,9].map(i=>({capsule_id:'cap_a',item_id:'seed_'+i,created_at:'2026-01-01'})),
    });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(600);

    const bands = await p.evaluate(()=>
      Array.from(document.querySelectorAll('#capsule-gallery .capsule-band'))
        .map(band=>Array.from(band.children).map(c=>{
          const item=ITEMS.find(i=>i.name===c.getAttribute('alt'));
          return item ? tabForItem(item) : 'none';
        })));
    check('hats and accessories sit at the top, worn highest',
      bands[0].every(t=>t==='Hats'||t==='Accessories'), JSON.stringify(bands));
    check('layers and tops come next', bands[1].every(t=>t==='Jackets'));
    check('bottoms and dresses below those', bands[2].every(t=>t==='Dresses'));
    check('shoes at the foot', bands[bands.length-1].every(t=>t==='Shoes'));

    // the bug that started this: pieces spilling out of the bottom of the card
    const fit = await p.evaluate(()=>{
      const card=document.querySelector('#capsule-gallery .outfit-card');
      const cr=card.getBoundingClientRect();
      const kids=Array.from(card.querySelectorAll('.capsule-band > *'));
      return {
        count: kids.length,
        overflowing: kids.filter(k=>k.getBoundingClientRect().bottom > cr.bottom + 1).length,
        widest: Math.max(...kids.map(k=>Math.round(k.getBoundingClientRect().right))),
        cardRight: Math.round(cr.right),
      };
    });
    check('every piece is drawn, none hidden behind a "+N"', fit.count===6, `${fit.count} thumbs`);
    check('every piece sits inside the card', fit.overflowing===0,
      `${fit.overflowing} of ${fit.count} spilling out`);
    check('nothing overflows the card sideways either', fit.widest <= fit.cardRight,
      `${fit.widest} vs ${fit.cardRight}`);

    // a thumbnail must never be sized by a percentage height: that is what
    // let Safari fall back to the image's natural height and burst the card
    check('thumbnails are sized by width and aspect-ratio, not a % height',
      await p.evaluate(()=>{
        const s=getComputedStyle(document.querySelector('.capsule-band > *'));
        return s.aspectRatio.replace(/\s/g,'')==='1/1';
      }));

    await p.screenshot({path:shot('cap2b-worn-order.png')});
    await p.close();
  }

  // ---- 3. Adding and removing pieces ----
  {
    const p=await open(b, {
      capsules:[{id:'cap_a',name:'winter',archived_at:null,created_at:'2026-01-01'}],
      members:[{capsule_id:'cap_a',item_id:'seed_0',created_at:'2026-01-01'},
               {capsule_id:'cap_a',item_id:'seed_1',created_at:'2026-01-01'}],
    });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);

    // expand to see the pieces
    await expandCard(p);
    check('expanding lists every piece by name',
      await p.evaluate(()=>document.querySelectorAll('#capsule-gallery .outfit-piece-row').length)===2);
    await p.screenshot({path:shot('cap3-expanded.png')});

    // The per-row Remove button is gone: a piece leaves through the editor,
    // which is also the only place it can be added.
    check('no Remove button on a capsule row',
      await p.evaluate(()=>!Array.from(document.querySelectorAll('#capsule-gallery button'))
        .some(x=>x.textContent.trim()==='Remove')));
    check('the row is the way to the piece instead',
      await p.evaluate(()=>Array.from(document.querySelectorAll('#capsule-gallery .outfit-piece-row'))
        .every(r=>r.classList.contains('tappable'))));

    await p.click('#capsule-gallery button:has-text("Edit capsule")'); await p.waitForTimeout(400);
    await p.locator('#capsule-editor-gallery .picker-tile.picker-selected').first().click(); await p.waitForTimeout(200);
    await p.click('#capsule-save-btn'); await p.waitForTimeout(700);
    check('deselecting in the editor takes the piece out of the capsule',
      await p.evaluate(()=>capsules[0].itemIds.length)===1,
      await p.evaluate(()=>capsules[0].itemIds.join(',')));
    check('the membership row is deleted, the piece is not',
      await p.evaluate(()=>window.__WARDROBE_STATE.capsule_items.length)===1 &&
      await p.evaluate(()=>window.__WARDROBE_STATE.items.length)===80);
    check('the piece is still in the wardrobe',
      await p.evaluate(()=>ITEMS.some(i=>i.id==='seed_0')));

    // add more through the editor
    await p.click('#capsule-gallery button:has-text("Edit capsule")'); await p.waitForTimeout(400);
    check('the editor opens with the capsule\'s current pieces selected',
      await p.evaluate(()=>document.querySelectorAll('#capsule-editor-gallery .picker-selected').length)===1);
    await p.click('#capsule-editor-gallery .picker-tile:nth-child(5)');
    await p.click('#capsule-editor-gallery .picker-tile:nth-child(6)');
    await p.click('#capsule-save-btn'); await p.waitForTimeout(600);
    check('added pieces are saved', await p.evaluate(()=>capsules[0].itemIds.length)===3,
      await p.evaluate(()=>capsules[0].itemIds.join(',')));
    check('the card draws all three', await p.evaluate(()=>
      document.querySelectorAll('#capsule-gallery .capsule-band > *').length === capsules[0].itemIds.length),
      String(await p.evaluate(()=>document.querySelectorAll('#capsule-gallery .capsule-band > *').length)));

    // deselecting in the editor removes
    await expandCard(p);
    await p.click('#capsule-gallery button:has-text("Edit capsule")'); await p.waitForTimeout(400);
    await p.locator('#capsule-editor-gallery .picker-tile.picker-selected').first().click(); await p.waitForTimeout(200);
    await p.click('#capsule-save-btn'); await p.waitForTimeout(600);
    check('deselecting in the editor removes the piece too',
      await p.evaluate(()=>capsules[0].itemIds.length)===2);
    check('no orphan membership rows left behind',
      await p.evaluate(()=>window.__WARDROBE_STATE.capsule_items.length)===2);
    await p.close();
  }

  // ---- 4. Renaming ----
  {
    const p=await open(b, {
      capsules:[{id:'cap_a',name:'winter',archived_at:null,created_at:'2026-01-01'}],
      members:[{capsule_id:'cap_a',item_id:'seed_0',created_at:'2026-01-01'}],
    });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
    await expandCard(p);
    await p.click('#capsule-gallery button:has-text("Edit capsule")'); await p.waitForTimeout(400);
    await p.fill('#capsule-name-input','evening');
    await p.click('#capsule-save-btn'); await p.waitForTimeout(600);
    check('renaming shows the new name', (await p.textContent('.capsule-name'))==='evening');
    check('the rename is written to the database',
      await p.evaluate(()=>window.__WARDROBE_STATE.capsules[0].name)==='evening');
    check('renaming keeps the pieces', await p.evaluate(()=>capsules[0].itemIds.length)===1);

    // and it survives a reload
    await p.reload(); await p.waitForTimeout(900);
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
    check('the capsule survives a reload, renamed',
      await cards(p)===1 && (await p.textContent('.capsule-name'))==='evening');
    await p.close();
  }

  // ---- 5. Deleting archives rather than erases ----
  {
    const p=await open(b, {
      capsules:[{id:'cap_a',name:'winter',archived_at:null,created_at:'2026-01-01'}],
      members:[{capsule_id:'cap_a',item_id:'seed_0',created_at:'2026-01-01'},
               {capsule_id:'cap_a',item_id:'seed_1',created_at:'2026-01-01'}],
    });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
    await expandCard(p);
    await p.click('#capsule-gallery button:has-text("Delete")'); await p.waitForTimeout(700);
    check('deleting does not ask first',
      await p.evaluate(()=>!Array.from(document.querySelectorAll('button'))
        .some(x=>/Yes, delete/.test(x.textContent))));
    check('it offers the capsule back instead',
      await p.evaluate(()=>Boolean(document.querySelector('.toast-undo'))));

    check('the capsule leaves the page', await cards(p)===0 && await p.isVisible('#capsule-empty'));
    const state = await db(p);
    check('the row is archived, not removed',
      state.capsules.length===1 && Boolean(state.capsules[0].archived_at),
      `rows=${state.capsules.length} archived=${Boolean(state.capsules[0]&&state.capsules[0].archived_at)}`);
    check('its memberships are kept, so a restore brings it back whole',
      state.members.length===2);
    check('no piece left the wardrobe',
      await p.evaluate(()=>ITEMS.length)===80);
    await p.close();
  }

  // ---- 6. Archiving a piece, and the un-migrated database ----
  {
    const p=await open(b, {
      capsules:[{id:'cap_a',name:'winter',archived_at:null,created_at:'2026-01-01'}],
      members:[{capsule_id:'cap_a',item_id:'seed_0',created_at:'2026-01-01'},
               {capsule_id:'cap_a',item_id:'seed_1',created_at:'2026-01-01'}],
    });
    await p.evaluate(async()=>{ await archiveItems(['seed_0']); });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(500);
    check('an archived piece drops out of the capsule display',
      await p.evaluate(()=>capsuleItems(capsules[0]).length)===1,
      String(await p.evaluate(()=>capsuleItems(capsules[0]).length)));
    check('but keeps its membership, so restoring puts it back',
      await p.evaluate(()=>window.__WARDROBE_STATE.capsule_items.length)===2);
    await p.evaluate(async()=>{ await restoreItem('seed_0'); });
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(400);
    check('restoring the piece restores it to the capsule',
      await p.evaluate(()=>capsuleItems(capsules[0]).length)===2,
      String(await p.evaluate(()=>capsuleItems(capsules[0]).length)));
    await p.close();
  }
  {
    const p=await open(b, {noCapsules:true});
    check('before the migration the app still loads',
      (await shown(p)) === 80);
    check('and Capsules stays out of the nav rather than leading nowhere',
      !(await p.isVisible('#nav-capsules-btn')));
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
