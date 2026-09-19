// Every page opens with its own name. The things that can go wrong are that
// a title belongs to the wrong page, that more than one is on screen at once,
// or that the room the block takes pushes something that mattered off the
// bottom of the phone.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

const FOLD = 844;

async function open(b){
  const p=await b.newPage({viewport:{width:390,height:FOLD},deviceScaleFactor:2});
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

// Only the title on the page you are looking at counts as on screen.
const visibleTitles = p => p.evaluate(()=>
  Array.from(document.querySelectorAll('#app-root h1'))
    .filter(h => h.offsetParent !== null)
    .map(h => h.textContent.trim()));

const rect = (p, sel) => p.evaluate(s=>{
  const e=document.querySelector(s); if(!e) return null;
  const r=e.getBoundingClientRect();
  return {top:Math.round(r.top), bottom:Math.round(r.bottom)};
}, sel);

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // ---- 1. One title per page, and it names the page ----
  {
    const p=await open(b);
    const steps = [
      ['Wardrobe', '#nav-inventory-btn'],
      ['Outfits',  '#nav-outfits-btn'],
      ['Faves',    '#nav-saved-btn'],
    ];
    for(const [name, btn] of steps){
      await p.click(btn); await p.waitForTimeout(600);
      const titles = await visibleTitles(p);
      check(`${name} opens with its own title`,
        titles.length===1 && titles[0]===name, titles.join(' / '));
    }

    // Capsules only appears once the tables are there; the fake has them.
    if(await p.isVisible('#nav-capsules-btn')){
      await p.click('#nav-capsules-btn'); await p.waitForTimeout(600);
      const titles = await visibleTitles(p);
      check('Capsules opens with its own title',
        titles.length===1 && titles[0]==='Capsules', titles.join(' / '));
    } else {
      check('Capsules opens with its own title', false, 'nav button missing');
    }

    await p.click('#nav-inventory-btn'); await p.waitForTimeout(400);
    await p.evaluate(()=>setMode('archive')); await p.waitForTimeout(500);
    const arch = await visibleTitles(p);
    check('Archive opens with its own title',
      arch.length===1 && arch[0]==='Archive', arch.join(' / '));

    // The way back sits above the head now — it has to still be the way back.
    await p.click('#archive-view .back-link'); await p.waitForTimeout(500);
    check('the back link above the title still returns to the wardrobe',
      JSON.stringify(await visibleTitles(p))===JSON.stringify(['Wardrobe']));
    await p.close();
  }

  // ---- 2. The block is a heading, not a picture of one ----
  {
    const p=await open(b);
    const head = await p.evaluate(()=>{
      const h = document.querySelector('#inventory-view .page-head');
      const t = h.querySelector('h1');
      return {
        tag: h.tagName,
        titleSize: Math.round(parseFloat(getComputedStyle(t).fontSize)),
        titleFont: getComputedStyle(t).fontFamily.split(',')[0].replace(/"/g,''),
        rule: getComputedStyle(h).borderBottomWidth,
        // The folio line and the standfirst are gone; the row holds the
        // title and the page's own controls, nothing else.
        extras: h.querySelectorAll('.eyebrow, .sub').length,
      };
    });
    check('it is a real <header> with an <h1> inside it', head.tag==='HEADER');
    check('the title is set in the display serif', head.titleFont==='Fraunces', head.titleFont);
    // 43, 35, 19, 26, 34, and settled at 28: it names the page clearly
    // without reading as a masthead.
    check('and set to name the page, not announce it', head.titleSize===28, head.titleSize+'px');
    check('no rule under it — the space does that work', head.rule==='0px', head.rule);
    check('no folio line or standfirst is left', head.extras===0, head.extras+' found');

    // Title on the left, everything you can do on the right, on one line.
    const row = await p.evaluate(()=>{
      const h=document.querySelector('#inventory-view .page-head');
      const t=h.querySelector('h1').getBoundingClientRect();
      const btns=Array.from(h.querySelectorAll('.icon-btn'))
        .filter(x=>x.offsetParent!==null)
        .map(x=>({id:x.id, r:x.getBoundingClientRect()}));
      return {
        titleLeft: Math.round(t.left), titleMid: Math.round((t.top+t.bottom)/2),
        buttons: btns.map(x=>x.id),
        allRight: btns.every(x=>x.r.left > t.right),
        allInLine: btns.every(x=>Math.abs((x.r.top+x.r.bottom)/2 - (t.top+t.bottom)/2) <= 6),
        order: btns.slice().sort((a,c)=>a.r.left-c.r.left).map(x=>x.id),
        headLeft: Math.round(h.getBoundingClientRect().left),
      };
    });
    check('the title starts at the left edge of the page',
      row.titleLeft === row.headLeft, `${row.titleLeft} vs ${row.headLeft}`);
    check('every control sits to the right of it', row.allRight, row.buttons.join(','));
    check('and in line with it', row.allInLine);
    check('search, then list view, then add',
      JSON.stringify(row.order)===JSON.stringify(['search-btn','view-toggle-btn','add-item-btn']),
      row.order.join(' → '));

    // Capsules brings its own action up beside its title.
    await p.click('#nav-capsules-btn'); await p.waitForTimeout(600);
    check('the new-capsule button moved up beside the Capsules title',
      await p.evaluate(()=>{
        const h=document.querySelector('#capsules-view .page-head');
        const t=h.querySelector('h1').getBoundingClientRect();
        const btn=document.getElementById('new-capsule-btn').getBoundingClientRect();
        return btn.left > t.right && Math.abs((btn.top+btn.bottom)/2 - (t.top+t.bottom)/2) <= 6;
      }));
    await p.close();
  }

  // ---- 3. Nothing that mattered fell off the bottom ----
  {
    const p=await open(b);
    const tabs = await rect(p, '#tabs');
    check('the wardrobe still shows its categories without scrolling',
      tabs.bottom < FOLD, `tabs end at ${tabs.bottom}, fold at ${FOLD}`);
    const firstTile = await rect(p, '#gallery .tile');
    check('and the first pieces with them',
      firstTile.top < FOLD, `first piece starts at ${firstTile.top}`);

    await p.click('#nav-outfits-btn'); await p.waitForTimeout(800);
    const sheet = await rect(p, '#filter-sheet');
    const hero = await rect(p, '.hero-card');
    check('Outfits keeps the filters reachable, docked under the title',
      await p.evaluate(()=>filterSheetOpen()) && sheet.top < FOLD,
      `panel starts at ${sheet.top}, fold at ${FOLD}`);
    check('the lead outfit is whole on screen above it',
      hero.bottom <= sheet.top, `card ends at ${hero.bottom}, panel starts at ${sheet.top}`);
    await p.screenshot({path:shot('ti-outfits.png')});
    await p.close();
  }

  // ---- 4. The title does not become a second scroll of its own ----
  {
    const p=await open(b);
    const h = await p.evaluate(()=>
      Math.round(document.querySelector('#inventory-view .page-head').getBoundingClientRect().height));
    check('the head stays under a tenth of the screen', h < FOLD/10, `${h}px of ${FOLD}`);
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
