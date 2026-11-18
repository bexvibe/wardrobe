// /api/link-preview: finds the picture for a pasted link, for people who are
// signed in, without ever being made to reach somewhere private.
const path = require('path');
const lp = require(path.join(__dirname, '..', 'api', 'link-preview.js'));
const results=[]; const check=(n,p,d)=>{results.push(p);console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

function call(handler, { method='GET', headers={}, url='/api/link-preview?url=' } = {}){
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v){ this.headers[k] = v; },
      end(body){ resolve({ status: this.statusCode, body: JSON.parse(body), headers: this.headers }); } };
    handler({ method, headers, url }, res);
  });
}
const withUrl = u => '/api/link-preview?url=' + encodeURIComponent(u);
const signedIn = { authorization: 'Bearer good' };
const verify = async t => t === 'good';
const page = (html, type='text/html; charset=utf-8', url='https://shop.test/p/1') =>
  async () => ({ status: 200, headers: { 'content-type': type }, body: Buffer.from(html), url });

(async()=>{
  // ---- Which addresses count as private ----
  const priv = ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254',
    '0.0.0.0','100.64.0.1','224.0.0.1','::1','::','fe80::1','fd00::1','::ffff:127.0.0.1','::ffff:10.0.0.1','nonsense'];
  const pub = ['8.8.8.8','93.184.216.34','172.15.0.1','172.32.0.1','2606:4700:4700::1111'];
  check('private, loopback and metadata addresses are refused',
    priv.every(a => lp.isPrivateAddress(a)), priv.filter(a => !lp.isPrivateAddress(a)).join(', '));
  check('and public ones are not', pub.every(a => !lp.isPrivateAddress(a)),
    pub.filter(a => lp.isPrivateAddress(a)).join(', '));

  // ---- Reading a page ----
  const og = lp.extractPreview(
    '<head><meta property="og:image" content="https://cdn.test/a.jpg?x=1&amp;y=2"><meta property="og:site_name" content="Pinterest"></head>',
    'https://www.pinterest.com/pin/1/');
  check('the page\'s preview image and site name are found, entities decoded',
    og.imageUrl === 'https://cdn.test/a.jpg?x=1&y=2' && og.source === 'Pinterest', JSON.stringify(og));
  check('a relative image is made absolute against the page',
    lp.extractPreview('<meta name="twitter:image" content="/img/p.png">', 'https://shop.test/a/b').imageUrl === 'https://shop.test/img/p.png');
  check('attributes may come in any order, and with single quotes',
    lp.extractPreview("<meta content='https://c.test/z.jpg' property='og:image'>", 'https://x.test').imageUrl === 'https://c.test/z.jpg');
  check('og:image wins over twitter:image',
    lp.extractPreview('<meta name="twitter:image" content="https://t.test/t.jpg"><meta property="og:image" content="https://o.test/o.jpg">', 'https://x.test').imageUrl === 'https://o.test/o.jpg');
  check('image_src is the last resort',
    lp.extractPreview('<link rel="image_src" href="https://l.test/l.jpg">', 'https://x.test').imageUrl === 'https://l.test/l.jpg');
  check('a page with no picture says so rather than guessing',
    lp.extractPreview('<html><title>Nothing</title></html>', 'https://x.test').imageUrl === null);
  check('and an image that is not a web address is dropped',
    lp.extractPreview('<meta property="og:image" content="javascript:alert(1)">', 'https://x.test').imageUrl === null);

  // ---- The route ----
  let r = await call(lp.createHandler({ verify, fetchPage: page('') }), { url: withUrl('https://a.test') });
  check('no token, no answer', r.status === 401, r.status);
  r = await call(lp.createHandler({ verify, fetchPage: page('') }), { headers: { authorization: 'Bearer nope' }, url: withUrl('https://a.test') });
  check('a token that is not a signed-in user is turned away', r.status === 401, r.status);
  r = await call(lp.createHandler({ verify: async () => 'unconfigured', fetchPage: page('') }), { headers: signedIn, url: withUrl('https://a.test') });
  check('without its two environment variables it says it is not set up', r.status === 503, r.status);
  r = await call(lp.createHandler({ verify, fetchPage: page('') }), { method: 'POST', headers: signedIn, url: withUrl('https://a.test') });
  check('only GET', r.status === 405, r.status);
  for(const bad of ['', 'nonsense', 'javascript:alert(1)', 'ftp://a.test/x', 'file:///etc/passwd']){
    r = await call(lp.createHandler({ verify, fetchPage: page('') }), { headers: signedIn, url: withUrl(bad) });
    check(`"${bad}" is not a link`, r.status === 400, r.status);
  }
  r = await call(lp.createHandler({ verify, fetchPage: page('<meta property="og:image" content="/p.jpg">') }),
    { headers: signedIn, url: withUrl('https://shop.test/p/1') });
  check('a page gives its picture and its host as the source',
    r.status === 200 && r.body.imageUrl === 'https://shop.test/p.jpg' && r.body.source === 'shop.test', JSON.stringify(r.body));
  r = await call(lp.createHandler({ verify, fetchPage: page('', 'image/png', 'https://img.test/a.png') }),
    { headers: signedIn, url: withUrl('https://img.test/a.png') });
  check('a link that is an image is its own picture',
    r.status === 200 && r.body.imageUrl === 'https://img.test/a.png', JSON.stringify(r.body));
  r = await call(lp.createHandler({ verify, fetchPage: async () => { throw new Error('boom'); } }),
    { headers: signedIn, url: withUrl('https://down.test') });
  check('a site that cannot be opened is an error the app can ignore', r.status === 400, r.status);

  // ---- The fetch itself never reaches somewhere private ----
  for(const target of ['http://127.0.0.1/', 'http://localhost/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/',
                       'http://10.0.0.1/', 'https://example.com:8443/', 'http://user:pw@example.com/']){
    let blocked = false;
    try{ await lp.fetchPage(target); }catch(e){ blocked = true; }
    check(`fetching ${target} is refused`, blocked);
  }

  const failed=results.filter(x=>!x).length;
  console.log(`\n${results.length-failed}/${results.length} checks passed`);
  process.exit(failed?1:0);
})();
