// A transparent cutout must survive the upload downscale with its
// transparency intact, not come out on a black square.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);

  const out = await p.evaluate(async () => {
    // build a big transparent PNG (>1MB so it takes the canvas path, like the real cutout)
    const c=document.createElement('canvas'); c.width=c.height=1400;
    const g=c.getContext('2d');
    // Random noise in the middle only: incompressible, so the PNG clears 1MB
    // and takes the canvas path, while the outer margin stays truly transparent.
    const img=g.createImageData(1200,1200);
    for(let i=0;i<img.data.length;i+=4){
      img.data[i]=Math.random()*255; img.data[i+1]=Math.random()*255;
      img.data[i+2]=Math.random()*255; img.data[i+3]=255;
    }
    g.putImageData(img,100,100);
    const pngBlob = await new Promise(r=>c.toBlob(r,'image/png'));
    const file = new File([pngBlob],'cutout.png',{type:'image/png'});

    const res = await downscaleImage(file);

    // decode the result and look at a corner that was transparent
    const bmp = await createImageBitmap(res.blob);
    const c2=document.createElement('canvas'); c2.width=bmp.width; c2.height=bmp.height;
    c2.getContext('2d').drawImage(bmp,0,0);
    const corner=c2.getContext('2d').getImageData(2,2,1,1).data;
    return { ext:res.ext, type:res.blob.type, size:res.blob.size, srcSize:file.size,
             cornerAlpha:corner[3], cornerRGB:[corner[0],corner[1],corner[2]] };
  });

  check('an oversized cutout takes the resize path', out.srcSize >= 1000000,
    `source ${(out.srcSize/1048576).toFixed(2)}MB`);
  // WebP carries alpha, so cutouts no longer have to stay as heavyweight PNGs.
  // A browser that cannot encode WebP must hand back a PNG instead, and the
  // extension has to follow whatever the blob actually is either way.
  check('cutout is encoded as WebP, which keeps transparency',
    out.type==='image/webp' && out.ext==='webp', `${out.ext} / ${out.type}`);
  check('the extension always matches the blob it describes',
    out.ext === out.type.split('/')[1].replace('jpeg','jpg'), `${out.ext} / ${out.type}`);
  check('transparency survives the upload', out.cornerAlpha===0,
    `corner alpha=${out.cornerAlpha} rgb=${out.cornerRGB.join(',')}`);
  check('background is not flattened to black', !(out.cornerAlpha===255 && out.cornerRGB.every(v=>v===0)));

  // The whole point of the change: what gets uploaded is small.
  check('the upload is cut down to something worth serving',
    out.size < 150_000 && out.size < out.srcSize / 10,
    `${(out.srcSize/1048576).toFixed(2)}MB in -> ${(out.size/1024).toFixed(0)}KB out`);

  // A photo with no alpha takes the same path now — no format fork to get wrong.
  const jpg = await p.evaluate(async () => {
    const c=document.createElement('canvas'); c.width=c.height=2000;
    const g=c.getContext('2d'); g.fillStyle='#777'; g.fillRect(0,0,2000,2000);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.9));
    const file=new File([blob],'photo.jpg',{type:'image/jpeg'});
    const res=await downscaleImage(file);
    const bmp=await createImageBitmap(res.blob);
    return { ext:res.ext, type:res.blob.type, w:bmp.width, h:bmp.height };
  });
  check('an ordinary photo takes the same WebP path', jpg.ext==='webp' && jpg.type==='image/webp',
    `${jpg.ext} / ${jpg.type}`);
  check('and is resized to the edge the app actually draws', Math.max(jpg.w,jpg.h)===600,
    `${jpg.w}x${jpg.h}`);

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
