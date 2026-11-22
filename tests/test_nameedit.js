const { chromium } = require('playwright');
const { addTags } = require('./nav');
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
    body:`window.__SEED_ITEMS=${seed};window.__WITH_TAGS=true;window.__SEED_TAGS={};\n${fake}`}));
  await p.route('**/config.js', r=>r.fulfill({contentType:'application/javascript',
    body:`window.WARDROBE_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseAnonKey:'anon',authEmail:'x@y.z'};`}));
  await p.goto('http://localhost:8933/index.html'); await p.waitForTimeout(400);
  await p.fill('#gate-password','correct-horse'); await p.click('#gate-submit');
  await p.waitForSelector('#app-root',{state:'visible'}); await p.waitForTimeout(400);
  await p.evaluate(() => { ITEMS[0].tags=['alpha']; ITEMS[0].source='Shop A'; ITEMS[1].source='Shop A'; });
  // the piece form's tags picker
  await p.evaluate(() => { openItemForm(ITEMS[0].id); openFormTagsPicker(); });
  await p.waitForTimeout(500);
  check('tag picker row has the app pencil', await p.evaluate(() => !!document.querySelector('#form-pick-list .pick-edit svg path[d^="M21.174"]')));
  await p.click('#form-pick-list .pick-edit'); await p.waitForTimeout(250);
  check('popup opens', await p.evaluate(() => document.getElementById('name-edit-backdrop').classList.contains('open')));
  check('delete icon sits in the title row', await p.evaluate(() => !!document.querySelector('#name-edit-backdrop .sheet-title-row #name-edit-delete')));
  await p.click('#name-edit-backdrop .btn.secondary'); await p.waitForTimeout(250);
  check('cancel closes the popup', await p.evaluate(() => !document.getElementById('name-edit-backdrop').classList.contains('open')));
  check('and the tags picker is still there', await p.evaluate(() => formPickKind === 'tags' && !!document.querySelector('#form-pick-list .pick-edit')));
  // rename follows into the staged form
  await p.click('#form-pick-list .pick-edit'); await p.fill('#name-edit-input','beta'); await p.click('#name-edit-save'); await p.waitForTimeout(500);
  check('rename closes popup and renames the tag', await p.evaluate(() => !document.getElementById('name-edit-backdrop').classList.contains('open') && ITEMS[0].tags.includes('beta') && !ITEMS[0].tags.includes('alpha')));
  check('picker shows the new name', await p.evaluate(() => document.getElementById('form-pick-list').textContent.includes('beta')));
  // delete asks first
  await p.click('#form-pick-list .pick-edit'); await p.click('#name-edit-delete'); await p.waitForTimeout(250);
  check('delete asks first', await p.evaluate(() => document.getElementById('confirm-backdrop').classList.contains('open')));
  await p.click('#confirm-stay'); await p.waitForTimeout(200);
  check('keeping it leaves the popup up', await p.evaluate(() => document.getElementById('name-edit-backdrop').classList.contains('open') && ITEMS[0].tags.includes('beta')));
  await p.click('#name-edit-delete'); await p.click('#confirm-go'); await p.waitForTimeout(500);
  check('confirming deletes the tag', await p.evaluate(() => !ITEMS[0].tags.includes('beta') && !document.getElementById('name-edit-backdrop').classList.contains('open')));
  // sources
  await p.evaluate(() => openFormSourcePicker()); await p.waitForTimeout(500).catch(()=>{});
  const has = await p.evaluate(() => !!document.querySelector('#form-pick-list .pick-edit'));
  check('source picker row has a pencil', has);
  if(has){
    await p.click('#form-pick-list .pick-edit-wrap:has-text("Shop A") .pick-edit'); await p.fill('#name-edit-input','Shop B'); await p.click('#name-edit-save'); await p.waitForTimeout(500);
    check('source rename hits every piece', await p.evaluate(() => ITEMS[0].source==='Shop B' && ITEMS[1].source==='Shop B'));
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`); process.exitCode = results.every(Boolean) ? 0 : 1;
  await b.close();
})();
