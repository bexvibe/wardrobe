#!/usr/bin/env node
// The regression runner.
//
// It was a shell loop: thirty-odd suites one after another, each launching
// its own Chromium, about ten minutes a run. The suites are independent
// processes reading a static file over HTTP, so nothing stops them running
// at once. Four cores, so four at a time.
//
//   node run.js                 everything
//   node run.js chips trail     only the suites whose names contain these
//   node run.js --serial        one at a time, for when output order matters
//   node run.js --verbose       every check, not just the failures
//
// It starts the file server itself and stops it again, because the one
// thing that reliably wasted a minute was finding out it had died.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8933;
const HERE = __dirname;
const args = process.argv.slice(2);
const serial = args.includes('--serial');
const verbose = args.includes('--verbose');
const patterns = args.filter(a => !a.startsWith('--'));

const suites = fs.readdirSync(HERE)
  .filter(f => /^test_.*\.js$/.test(f))
  .filter(f => !patterns.length || patterns.some(p => f.includes(p)))
  .sort();

if(!suites.length){
  console.error(patterns.length ? `No suite matches ${patterns.join(', ')}` : 'No suites found');
  process.exit(1);
}

const alive = () => new Promise(done => {
  const req = http.get(`http://127.0.0.1:${PORT}/index.html`, r => {
    r.resume(); done(r.statusCode === 200);
  });
  req.on('error', () => done(false));
  req.setTimeout(1000, () => { req.destroy(); done(false); });
});

async function serve(){
  if(await alive()) return null;
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)],
                    {cwd: ROOT, stdio: 'ignore', detached: true});
  for(let i = 0; i < 40; i++){
    await new Promise(r => setTimeout(r, 150));
    if(await alive()) return srv;
  }
  throw new Error(`Nothing serving ${ROOT} on ${PORT}`);
}

// A suite reports "N/M checks passed" on its last line and exits non-zero
// if any failed. Anything else — a page error, a timeout that killed the
// process — has no summary at all, which is its own kind of failure and
// the one most easily read as a pass.
function runOne(file){
  return new Promise(done => {
    const started = Date.now();
    const child = spawn('node', [path.join(HERE, file)], {
      cwd: HERE,
      env: {...process.env, NODE_PATH: '/opt/node22/lib/node_modules'},
    });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    child.on('close', code => {
      const summary = (out.match(/(\d+)\/(\d+) checks passed/) || []);
      const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
      const noise = out.split('\n').filter(l => /PAGEERROR|TimeoutError|Error:/.test(l));
      done({
        file, code,
        passed: Number(summary[1] || 0),
        total: Number(summary[2] || 0),
        ran: Boolean(summary.length),
        fails, noise, out,
        ms: Date.now() - started,
      });
    });
  });
}

function report(r){
  const ok = r.ran && r.code === 0 && !r.fails.length;
  const secs = (r.ms / 1000).toFixed(1) + 's';
  const name = r.file.replace(/^test_|\.js$/g, '').padEnd(12);
  if(ok){
    console.log(`  ok   ${name} ${String(r.passed).padStart(3)} checks  ${secs}`);
    if(verbose) console.log(r.out.replace(/^/gm, '       '));
    return;
  }
  console.log(`  FAIL ${name} ${r.ran ? `${r.passed}/${r.total}` : 'did not finish'}  ${secs}`);
  r.fails.forEach(l => console.log('       ' + l));
  r.noise.slice(0, 4).forEach(l => console.log('       ' + l.trim()));
  if(!r.ran && !r.noise.length) console.log(r.out.split('\n').slice(-12).join('\n       '));
}

(async () => {
  const srv = await serve();
  const started = Date.now();
  console.log(`${suites.length} suites, ${serial ? 'one at a time' : '4 at a time'}\n`);

  const queue = suites.slice();
  const done = [];
  async function worker(){
    while(queue.length){
      const r = await runOne(queue.shift());
      report(r);
      done.push(r);
    }
  }
  await Promise.all(Array.from({length: serial ? 1 : 4}, worker));

  const bad = done.filter(r => !r.ran || r.code !== 0 || r.fails.length);
  const checks = done.reduce((n, r) => n + r.passed, 0);
  console.log(`\n${checks} checks passed across ${done.length} suites` +
              `  ·  ${((Date.now() - started) / 1000).toFixed(0)}s` +
              (bad.length ? `  ·  ${bad.length} SUITE${bad.length > 1 ? 'S' : ''} FAILING: ` +
                            bad.map(r => r.file).join(', ') : ''));

  // The server is left up on purpose. It costs nothing, the next run
  // reuses it, and the ad-hoc probes and screenshot scripts in here expect
  // to find it — tearing it down just moved the wasted minute somewhere
  // else. `pkill -f "http.server 8933"` if it ever needs to go.
  if(srv) srv.unref();
  process.exit(bad.length ? 1 : 0);
})();
