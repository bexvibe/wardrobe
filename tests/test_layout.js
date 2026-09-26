const { chromium } = require('playwright');
const { toFaves } = require('./nav');
const fs=require('fs'), pathmod=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(pathmod.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
// The app sits behind a password gate now, so these tests stub the backend
// and sign in, the way the rest of the suite does.
async function prepare(p){
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
}
async function signIn(p){
  await p.fill('#gate-password','correct-horse');
  await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'});
  await p.waitForTimeout(400);
}

const results=[];
const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

  // --- generated outfits: worn order ---
  {
    const p=await b.newPage({viewport:{width:390,height:900}});
    p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
    await prepare(p);
    await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
    await signIn(p);
    await p.click('#nav-outfits-btn'); await p.waitForTimeout(800);

    const s=await p.evaluate(()=>{
      const combo=outfitDisplayed.find(c=>c.jacket&&c.top&&c.bottom);
      const l=combo?outfitLayout(combo):null;
      const card=document.querySelector('#outfit-gallery .outfit-card');
      return {
        // Asked of the gallery rather than of the first card: a dress
        // with nothing over it has a lower row and no upper one, and
        // which outfit leads the grid depends on the visit's shuffle and
        // on which one the lead card took out of it.
        hasUpper:[...document.querySelectorAll('#outfit-gallery .outfit-card')]
          .some(c=>c.querySelector('.outfit-upper')),
        hasLower:[...document.querySelectorAll('#outfit-gallery .outfit-card')]
          .every(c=>c.querySelector('.outfit-lower')),
        // upper must be layers+top, lower must be the bottom
        upperIsWornTop: l? l.upper[0]===combo.jacket && l.upper[l.upper.length-1]===combo.top : false,
        lowerIsBottom: l? l.lower===combo.bottom : false,
        thumbBg: getComputedStyle(card.querySelector('.outfit-thumbs img')).backgroundColor,
        // cards in the same row must match height, and a simpler outfit
        // should spend the slack on a bigger bottom rather than a gap
        rowHeights: (()=>{
          const cards=[...document.querySelectorAll('#outfit-gallery .outfit-card')];
          const top=cards[0].getBoundingClientRect().top;
          const row=cards.filter(c=>Math.abs(c.getBoundingClientRect().top-top)<2);
          const hs=row.map(c=>Math.round(c.getBoundingClientRect().height));
          const lows=row.map(c=>Math.round(c.querySelector('.outfit-lower').getBoundingClientRect().height));
          const uppers=row.map(c=>c.querySelectorAll('.outfit-upper > *').length);
          // gap between the last rendered row of garments and the card's
          // inner bottom edge — this is the dead space we must not have
          const slack=row.map(c=>{
            const kids=c.querySelectorAll('.outfit-thumbs > *');
            const last=kids[kids.length-1];
            return Math.round(c.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom);
          });
          return {count:row.length, heights:hs, lows, uppers, slack};
        })(),
      };
    });
    check('cards use upper/lower rows', s.hasUpper && s.hasLower);
    check('upper row is outer-layer → top', s.upperIsWornTop);
    check('lower row is the bottom', s.lowerIsBottom);
    check('thumbnails have no background colour', /rgba\(0, 0, 0, 0\)|transparent/.test(s.thumbBg), s.thumbBg);
    const rh=s.rowHeights;
    check('cards in a row are equal height',
      rh.count>1 && new Set(rh.heights).size===1, `heights=${rh.heights.join(', ')}`);
    // 8px padding + 1px border; anything much beyond that is a void
    check('no dead space left under a simpler outfit',
      rh.slack.every(px => px <= 14),
      `bottom slack=${rh.slack.join(', ')}px for upper counts=${rh.uppers.join(', ')}`);

    // dress path
    // Shape is set through the base slots now: no dress means tops and
    // bottoms, so ruling tops out is how you ask for dresses.
    await p.evaluate(()=>{
      outfitFilters = emptySlotFilters();
      outfitFilters.top = {type:'none', ids:[]};
      renderFilterControls();
      resetOutfitResults();
    }); await p.waitForTimeout(700);
    const d=await p.evaluate(()=>{
      const combo=outfitDisplayed.find(c=>c.dress&&c.jacket);
      const l=outfitLayout(combo);
      return {lowerIsDress:l.lower===combo.dress, dressNotInUpper:!l.upper.includes(combo.dress)};
    });
    check('dress sits in the lower row', d.lowerIsDress && d.dressNotInUpper);
    await p.close();
  }

  // --- a saved outfit from when shoes were included keeps a feet row ---
  {
    const p=await b.newPage({viewport:{width:390,height:900}});
    p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
    await p.addInitScript(()=>{
      localStorage.setItem('wardrobe-favorite-outfits', JSON.stringify([{
        key:'tb|seed_22|seed_11|none|none|seed_9', base:'topbottom',
        top:'seed_22', bottom:'seed_11', dress:null, jumper:null, jacket:null, shoe:'seed_9'
      }]));
    });
    await prepare(p);
    await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
    await signIn(p);
    await toFaves(p, 600);
    const s=await p.evaluate(()=>{
      const card=document.querySelector('#saved-gallery .outfit-card');
      return {
        upper:card.querySelectorAll('.outfit-upper > *').length,
        lower:card.querySelectorAll('.outfit-lower > *').length,
        feet:card.querySelectorAll('.outfit-extras > *').length,
      };
    });
    check('an outfit carried over from localStorage still shows its shoes',
      s.upper===1 && s.lower===1 && s.feet===1, `upper=${s.upper} lower=${s.lower} feet=${s.feet}`);
    await p.screenshot({path:shot('saved-with-shoes.png')});
    await p.close();
  }

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
