// GET /api/link-preview?url=...
//
// Finds the picture for a link someone pasted as inspo: the link itself if it
// is an image, otherwise the page's preview image (og:image and friends). A
// browser cannot read another site's page, so this is the one place the app
// needs a server.
//
// Two things matter more than the feature itself.
//
//  1. Only someone signed in may use it. The caller sends their Supabase
//     access token, which is checked against the project here. Without that,
//     anyone who found the URL could use it to fetch pages for them.
//  2. It fetches addresses other people chose, so it must never be talked into
//     reaching somewhere private: localhost, the cloud metadata address, the
//     network it runs inside. Every connection is checked against the address
//     it actually resolved to, redirects included, and only ports 80 and 443
//     are allowed.
//
// Needs two environment variables in Vercel (Project > Settings > Environment
// Variables): SUPABASE_URL and SUPABASE_ANON_KEY, the same two values as in
// config.js. Without them the route answers 503 and the app saves the link
// without a picture, which is a fine way to run.

const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const MAX_BYTES = 1024 * 1024;       // enough for the <head> of any page
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 6000;

// Addresses that are not the public internet.
function isPrivateAddress(ip){
  if(net.isIPv4(ip)){
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||     // carrier-grade NAT
      (a === 169 && b === 254) ||               // link-local, incl. cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;                                 // multicast and reserved
  }
  if(net.isIPv6(ip)){
    const x = ip.toLowerCase();
    if(x === '::' || x === '::1') return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if(mapped) return isPrivateAddress(mapped[1]);
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
  }
  return true;                                   // not an address at all
}

// A resolver that refuses private answers, so the check is made on the very
// address the socket will use and cannot be swapped between check and connect.
function safeLookup(hostname, options, callback){
  if(typeof options === 'function'){ callback = options; options = {}; }
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if(err) return callback(err);
    if(!addrs.length || addrs.some(a => isPrivateAddress(a.address))){
      return callback(new Error('blocked address'));
    }
    if(options && options.all) return callback(null, addrs);
    callback(null, addrs[0].address, addrs[0].family);
  });
}

// One request, no redirects. Resolves with { status, headers, body, url }.
function requestOnce(urlText){
  return new Promise((resolve, reject) => {
    let url;
    try{ url = new URL(urlText); }catch(e){ return reject(new Error('bad url')); }
    if(url.protocol !== 'http:' && url.protocol !== 'https:') return reject(new Error('bad protocol'));
    if(url.port && url.port !== '80' && url.port !== '443') return reject(new Error('bad port'));
    if(url.username || url.password) return reject(new Error('bad url'));
    if(net.isIP(url.hostname) && isPrivateAddress(url.hostname)) return reject(new Error('blocked address'));

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
      headers: {
        // Many sites only put a preview in the page for something that looks
        // like a link unfurler.
        'User-Agent': 'Mozilla/5.0 (compatible; WardrobeLinkPreview/1.0)',
        'Accept': 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5',
      },
    }, res => {
      const type = String(res.headers['content-type'] || '');
      // Images are not read at all: knowing it is one is the answer.
      if(res.statusCode < 300 || res.statusCode >= 400){
        if(type.startsWith('image/')){
          res.destroy();
          return resolve({ status: res.statusCode, headers: res.headers, body: Buffer.alloc(0), url: url.href });
        }
      }
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if(size > MAX_BYTES){ res.destroy(); return; }
        chunks.push(c);
      });
      const done = () => resolve({ status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks), url: url.href });
      res.on('end', done);
      res.on('close', done);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchPage(urlText){
  let current = urlText;
  for(let hop = 0; hop <= MAX_REDIRECTS; hop++){
    const res = await requestOnce(current);
    if(res.status >= 300 && res.status < 400 && res.headers.location){
      current = new URL(res.headers.location, current).href;
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}

function decodeEntities(text){
  return String(text)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function metaAttributes(tag){
  const attrs = {};
  const re = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while((m = re.exec(tag))) attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return attrs;
}

// The picture and the site name a page offers, resolved against its address.
function extractPreview(html, baseUrl){
  const found = {};
  const metas = String(html).match(/<meta\b[^>]*>/gi) || [];
  for(const tag of metas){
    const a = metaAttributes(tag);
    const name = (a.property || a.name || '').toLowerCase();
    if(!a.content) continue;
    if(['og:image', 'og:image:url', 'og:image:secure_url'].includes(name)) found.og = found.og || a.content;
    else if(name === 'twitter:image' || name === 'twitter:image:src') found.tw = found.tw || a.content;
    else if(name === 'og:site_name') found.site = found.site || a.content;
  }
  if(!found.og && !found.tw){
    const link = String(html).match(/<link\b[^>]*rel\s*=\s*["']?image_src["']?[^>]*>/i);
    if(link){ const a = metaAttributes(link[0]); if(a.href) found.og = a.href; }
  }
  const raw = found.og || found.tw || null;
  let imageUrl = null;
  if(raw){
    try{
      const u = new URL(raw, baseUrl);
      if(u.protocol === 'http:' || u.protocol === 'https:') imageUrl = u.href;
    }catch(e){ /* a bad address is the same as none */ }
  }
  return { imageUrl, source: found.site || null };
}

function hostOf(url){
  try{ return new URL(url).hostname.replace(/^www\./, ''); }catch(e){ return ''; }
}

// Whether this access token belongs to someone signed in to the project.
async function verifySession(token){
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if(!base || !key) return 'unconfigured';
  try{
    const res = await fetch(base.replace(/\/$/, '') + '/auth/v1/user', {
      headers: { apikey: key, Authorization: 'Bearer ' + token },
    });
    return res.ok;
  }catch(e){ return false; }
}

function createHandler(deps){
  const verify = (deps && deps.verify) || verifySession;
  const fetchIt = (deps && deps.fetchPage) || fetchPage;

  return async function handler(req, res){
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };

    if(req.method && req.method !== 'GET') return send(405, { error: 'GET only' });

    const auth = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if(!token) return send(401, { error: 'sign in first' });

    const ok = await verify(token);
    if(ok === 'unconfigured') return send(503, { error: 'not set up' });
    if(!ok) return send(401, { error: 'sign in first' });

    let target;
    try{
      const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      target = new URL(String(query.url || ''));
      if(target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('protocol');
    }catch(e){ return send(400, { error: 'that is not a link' }); }

    let page;
    try{ page = await fetchIt(target.href); }
    catch(e){ return send(400, { error: 'could not open that link' }); }

    const type = String((page.headers && page.headers['content-type']) || '');
    if(type.startsWith('image/')) return send(200, { imageUrl: page.url, source: hostOf(page.url) });

    const { imageUrl, source } = extractPreview(page.body.toString('utf8'), page.url);
    return send(200, { imageUrl, source: source || hostOf(page.url) });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.isPrivateAddress = isPrivateAddress;
module.exports.extractPreview = extractPreview;
module.exports.fetchPage = fetchPage;
module.exports.safeLookup = safeLookup;
