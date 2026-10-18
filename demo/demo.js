// Sets up the demo pages: the stand-in database in tests/fake-supabase.js,
// seeded from the snapshot (or nothing), kept in this browser only.
(function () {
  var kind = window.__DEMO;
  var snap = window.__DEMO_SNAPSHOT || {};
  var t = function (k) { return (snap[k] || []).slice(); };

  window.WARDROBE_CONFIG = { supabaseUrl: 'demo', supabaseAnonKey: 'demo', authEmail: 'demo' };
  window.__FAKE_DB_KEY = 'wardrobe-demo-' + kind;
  window.__FAKE_SESSION_KEY = 'wardrobe-demo-session';
  window.__FAKE_PASSWORD = 'demo';
  window.__SESSION_SEED_FREE = true;
  window.__WITH_TAGS = true;
  // Skip the password screen: the fake restores this as a signed-in session.
  try { localStorage.setItem(window.__FAKE_SESSION_KEY, JSON.stringify({ user: { email: 'demo' } })); } catch (e) {}

  // The fake builds its first state from seed-items-shaped rows; the snapshot
  // is already database rows, so hand it over directly instead.
  try {
    if (!localStorage.getItem(window.__FAKE_DB_KEY)) {
      localStorage.setItem(window.__FAKE_DB_KEY, JSON.stringify({
        items: t('items'), saved_outfits: t('saved_outfits'), hidden_combos: [],
        outfit_extras: t('outfit_extras'), capsules: t('capsules'),
        capsule_items: t('capsule_items'), storage: {}
      }));
    }
  } catch (e) {}

  // Photos added in the demo are kept as data URLs, since there is no bucket.
  // The app asks for its client before the page finishes loading, so the
  // fake is wrapped the moment tests/fake-supabase.js installs it.
  function wrap(sb) {
    var make = sb.createClient;
    sb.createClient = function () {
      var c = make.apply(null, arguments);
      var store = window.__WARDROBE_STATE.storage;
      var url = function (p) { return typeof store[p] === 'string' ? store[p] : ''; };
      c.storage.from = function () {
        return {
          createSignedUrls: async function (ps) { return { data: ps.map(function (p) { return { path: p, signedUrl: url(p) }; }), error: null }; },
          createSignedUrl: async function (p) { return { data: { signedUrl: url(p) }, error: null }; },
          upload: function (p, blob) {
            return new Promise(function (res) {
              var r = new FileReader();
              r.onload = function () {
                store[p] = r.result;
                try { localStorage.setItem(window.__FAKE_DB_KEY, JSON.stringify(window.__WARDROBE_STATE)); } catch (e) {}
                res({ data: { path: p }, error: null });
              };
              r.readAsDataURL(blob);
            });
          }
        };
      };
      c.auth.signOut = async function () { return { error: null }; };
      return c;
    };
    return sb;
  }
  var installed;
  Object.defineProperty(window, 'supabase', {
    configurable: true,
    get: function () { return installed; },
    set: function (v) { installed = wrap(v); }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var out = document.querySelector('.signout-btn');
    if (out) out.style.display = 'none';

    var bar = document.createElement('div');
    bar.style.cssText = 'position:sticky;top:0;z-index:9999;display:flex;gap:12px;justify-content:center;align-items:center;padding:8px 16px;font:13px/1.3 system-ui,sans-serif;background:#2b2b2b;color:#fff';
    // Full | Empty: a two-way switch between the demos; the one you are on is filled in.
    var seg = 'font:inherit;color:inherit;text-decoration:none;padding:2px 10px;';
    var on = 'background:#fff;color:#2b2b2b;';
    bar.innerHTML = '<span>Demo — changes stay on this device only</span>' +
      '<span style="display:inline-flex;flex:none;white-space:nowrap;border:1px solid #fff8;border-radius:6px;overflow:hidden">' +
        '<a href="/demo" style="' + seg + (kind === 'empty' ? '' : on) + '"' + (kind === 'empty' ? '' : ' aria-current="page"') + '>Full</a>' +
        '<a href="/demo-empty" style="' + seg + (kind === 'empty' ? on : '') + '"' + (kind === 'empty' ? ' aria-current="page"' : '') + '>Empty</a>' +
      '</span>' +
      '<button style="flex:none;font:inherit;color:inherit;background:none;border:1px solid #fff8;border-radius:6px;padding:2px 10px;cursor:pointer">Reset</button>';
    bar.querySelector('button').onclick = function () {
      try { localStorage.removeItem(window.__FAKE_DB_KEY); } catch (e) {}
      location.reload();
    };
    document.body.prepend(bar);
  });
})();
