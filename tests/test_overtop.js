// An outfit can wear two tops, e.g. a tee and a shirt, in either stacking order.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = path.join(__dirname, '..');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};window.__SEED_OUTFITS=[];\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(800);

  const r = await p.evaluate(() => {
    const mk = (id, category) => ({id, category, photo:'x'});
    const shirt = mk('s','Shirts'), blouse = mk('b','Blouses'), tee = mk('t','T-shirts'),
          cami = mk('c','Camisoles'), plain = mk('p','Tops'), jeans = mk('j','Jeans');
    const out = {
      shirtOverTee: canLayerOver(shirt, tee),
      blouseOverCami: canLayerOver(blouse, cami),
      shirtOverTop: canLayerOver(shirt, plain),
      teeOverShirt: canLayerOver(tee, shirt),
      teeOverTee: canLayerOver(tee, mk('t2','T-shirts')) !== canLayerOver(mk('t2','T-shirts'), tee),
      shirtOverShirt: canLayerOver(shirt, mk('s2','Shirts')) !== canLayerOver(mk('s2','Shirts'), shirt),
      shirtOverSelf: canLayerOver(shirt, shirt),
      shirtOverJeans: canLayerOver(shirt, jeans),
    };
    const combo = {base:'topbottom', top:tee, overtop:shirt, bottom:jeans, jumper:null, jacket:null};
    out.key = comboKey(combo);
    out.plainKey = comboKey({...combo, overtop:null});
    out.pieces = comboPieces(combo).map(x => x.id);
    out.upper = outfitLayout(combo).upper.map(x => x.id);
    let seen = 0, layered = 0, bad = 0;
    const g = comboGenerator();
    for(let i = 0; i < 4000; i++){
      const n = g.next(); if(n.done) break;
      const c = n.value; seen++;
      if(c.overtop){ layered++; if(!canLayerOver(c.overtop, c.top)) bad++; }
    }
    out.seen = seen; out.layered = layered; out.bad = bad;
    return out;
  });
  check('shirt goes over a tee', r.shirtOverTee);
  check('blouse goes over a camisole', r.blouseOverCami);
  check('shirt goes over a plain top', r.shirtOverTop);
  check('a pair is one outfit, not two mirror images', !r.teeOverShirt);
  check('two tees pair up once', r.teeOverTee);
  check('two shirts pair up once', r.shirtOverShirt);
  check('nothing goes over itself', !r.shirtOverSelf);
  check('only tops are layered over', !r.shirtOverJeans);
  check('key without a layer is the old key', r.plainKey === 'tb|t|j|none|none|none', r.plainKey);
  check('key with a layer appends it', r.key === 'tb|t|j|none|none|none|s', r.key);
  check('layered shirt is one of the pieces', r.pieces.includes('s'));
  check('layered shirt sits in the upper row', r.upper.join() === 's,t', r.upper.join());
  check('generator makes some layered outfits', r.layered > 0, `${r.layered} of ${r.seen}`);
  check('every generated layer obeys the rule', r.bad === 0);
  await b.close();
  const f = results.filter(x=>!x).length;
  console.log(`\n${results.length-f}/${results.length} checks passed`);
  process.exit(f?1:0);
})();
