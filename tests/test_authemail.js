// The app must sign in using whatever authEmail config supplies, and must
// reject a password that doesn't match that account.
const { chromium } = require('playwright');
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
const EMAIL='rebeccastory11@gmail.com';
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

// The wardrobe stopped printing a count, so count what it actually drew.
const shown = p => p.evaluate(() =>
  document.getElementById('gallery').style.display === 'none'
    ? document.querySelectorAll('#name-list .name-row').length
    : document.querySelectorAll('#gallery .tile').length);


(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('  PAGEERROR:',e.message));
  // record what email the app actually submits
  await p.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}\n(function(){
      const orig=window.supabase.createClient;
      window.supabase.createClient=function(){
        const c=orig.apply(this,arguments);
        const inner=c.auth.signInWithPassword.bind(c.auth);
        c.auth.signInWithPassword=function(creds){ window.__SUBMITTED_EMAIL=creds.email; return inner(creds); };
        return c;
      };
    })();`}));
  // serve the REAL config.js from disk — that is what we're testing
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(500);

  const cfg = await p.evaluate(()=>window.WARDROBE_CONFIG);
  check('app loaded the real config', cfg.authEmail===EMAIL && Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey),
    `authEmail=${cfg.authEmail}`);
  check('password screen is shown', await p.isVisible('#gate-login'));

  await p.fill('#gate-password','correct-horse');
  await p.click('#gate-submit'); await p.waitForTimeout(500);
  const submitted = await p.evaluate(()=>window.__SUBMITTED_EMAIL);
  check('app signs in using the configured email', submitted===EMAIL, submitted);
  check('correct password unlocks the wardrobe', await p.isVisible('#app-root'));
  check('items load after login', (await shown(p)) === 80);

  // wrong password must be refused
  const p2=await b.newPage({viewport:{width:390,height:844}});
  await p2.route('**/vendor/supabase-js-*.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.__SEED_ITEMS=${seed};\n${fake}`}));
  await p2.goto('http://localhost:8933/index.html'); await p2.waitForTimeout(400);
  await p2.fill('#gate-password','not-the-password'); await p2.click('#gate-submit'); await p2.waitForTimeout(400);
  check('wrong password is still refused',
    (await p2.textContent('#gate-login-error')).includes('did not work') && !(await p2.isVisible('#app-root')));

  await b.close();
  const failed=results.filter(r=>!r).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
