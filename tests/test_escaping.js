// Adding a piece whose text contains HTML-significant characters must render
// as text, not break the markup.
const { chromium } = require('playwright');
// Search now lives behind an icon, in a bar that opens over the page.
async function typeSearch(page, text){
  const open = await page.evaluate(()=>document.getElementById('search-overlay').classList.contains('open'));
  if(!open){ await page.click('#search-btn'); await page.waitForTimeout(250); }
  await page.fill('#filter-search', text);
  await page.waitForTimeout(350);
}
const fs=require('fs'), path=require('path');
const REPO = require('path').join(__dirname, '..');
const SHOTS = require('path').join(__dirname, 'shots');
const shot = name => { require('fs').mkdirSync(SHOTS, {recursive:true});
                       return require('path').join(SHOTS, name); };
const fake=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const seed=fs.readFileSync(REPO + '/supabase/seed-items.json','utf8');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
  await p.route('**/vendor/supabase-js-*.js',r=>r.fulfill({contentType:'application/javascript',body:`window.__SEED_ITEMS = ${seed};\n${fake}`}));
  await p.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'wardrobe@the-archive.app'};`}));
  await p.goto('http://localhost:8933/index.html');
  await p.waitForTimeout(300);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(250);

  const NASTY = `Levi's 6" <b>heel</b> & co`;
  await p.click('#add-item-btn'); await p.waitForTimeout(200);
  await p.fill('#form-name', NASTY);
  await p.fill('#form-brand', '<img src=x onerror=window.__XSS=1>');
  await p.fill('#form-category','Shoes');
  await p.click('#form-save-btn'); await p.waitForTimeout(400);

  // switch to list view so the name is rendered as text
  await p.click('#view-toggle-btn'); await p.waitForTimeout(300);
  await typeSearch(p, 'Levi');

  const titles = await p.$$eval('.name-row-title', els=>els.map(e=>e.textContent));
  const exact = titles.includes(NASTY);
  console.log(exact?'PASS  name with quotes/angle-brackets renders verbatim':'FAIL  got: '+JSON.stringify(titles.slice(0,3)));

  const injected = await p.evaluate(()=>({xss:Boolean(window.__XSS), bolds:document.querySelectorAll('.name-row-title b').length}));
  console.log(!injected.xss?'PASS  no script executed from item text':'FAIL  XSS payload fired');
  console.log(injected.bolds===0?'PASS  markup in item text is inert':'FAIL  <b> was parsed as HTML');
  await p.screenshot({path:shot('v5-escaping.png')});
  await b.close();
  // Summarised like the rest, so a crash and a pass do not look the same
  // to whatever is running this.
  const checks = [exact, !injected.xss, injected.bolds===0];
  const failed = checks.filter(c=>!c).length;
  console.log(`\n${checks.length-failed}/${checks.length} checks passed`);
  process.exit(failed?1:0);
})();
