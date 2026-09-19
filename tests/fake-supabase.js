// In-memory stand-in for supabase-js, injected in place of the real bundle so
// the app's own code paths run for real against a fake transport.
(function () {
  const PASSWORD = 'correct-horse';

  function makeState(seedItems) {
    return {
      items: seedItems.map((it, i) => ({
        id: 'seed_' + i,
        name: it.name, brand: it.brand || '', size: it.size || '',
        category: it.category || '', price: it.price || '', source: it.source || '',
        notes: it.notes || '', photo: it.photo || null, photo_path: null,
        // Omitted entirely unless asked for, so the "column not added yet"
        // path is exercised by default just as it is on a real database.
        ...(window.__WITH_TAGS ? { tags: (window.__SEED_TAGS || {})['seed_' + i] || [] } : {}),
        archived_at: null,
        created_at: new Date(1700000000000 + i * 1000).toISOString(),
        updated_at: new Date(1700000000000 + i * 1000).toISOString(),
      })),
      saved_outfits: (window.__SEED_OUTFITS || []).slice(),
      hidden_combos: [],
      // Set __NO_CAPSULES to stand in for a database where
      // supabase/add-capsules.sql has not been run: the tables are absent
      // and every query against them errors, as Postgres would.
      ...(window.__NO_CAPSULES ? {} : {
        capsules: (window.__SEED_CAPSULES || []).slice(),
        capsule_items: (window.__SEED_CAPSULE_ITEMS || []).slice(),
      }),
      storage: {},
    };
  }

  // A real Postgres keeps its rows across a page reload; persist the fake's
  // to localStorage so reload-survival is actually testable. Tests wanting a
  // clean slate get one, since each test runs in a fresh browser context.
  const DB_KEY = 'fake-sb-db';
  function loadState() {
    try {
      const stored = localStorage.getItem(DB_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return makeState(window.__SEED_ITEMS || []);
  }
  function persist() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(window.__WARDROBE_STATE)); } catch (e) {}
  }
  window.__WARDROBE_STATE = loadState();
  window.__WARDROBE_CALLS = [];

  // Real supabase-js persists the session to localStorage (persistSession
  // defaults to true) and restores it in getSession(). Mirror that, or the
  // "stays unlocked on this device" behaviour cannot be tested.
  const SESSION_KEY = 'fake-sb-session';

  function createClient() {
    const state = window.__WARDROBE_STATE;
    let session = null;
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) session = JSON.parse(stored);
    } catch (e) { session = null; }

    function from(tableName) {
      const q = { op: null, payload: null, onConflict: null, filters: [], single: false };
      const rows = () => state[tableName];
      const match = (r) => q.filters.every((f) => f(r));

      function run() {
        window.__WARDROBE_CALLS.push({ table: tableName, op: q.op });
        const out = execute();
        if (q.op !== 'select') persist();
        return out;
      }

      function execute() {
        try {
          // A table that was never created rejects everything, the way a
          // real Postgres does before its migration has been run.
          if (!rows()) {
            return { data: null, error: {
              code: '42P01',
              message: `relation "public.${tableName}" does not exist`,
            } };
          }
          if (q.op === 'select') {
            const data = rows().filter(match);
            return { data: q.single ? data[0] || null : data, error: null };
          }
          if (q.op === 'insert') {
            const payload = Array.isArray(q.payload) ? q.payload : [q.payload];
            const created = payload.map((p) => {
              const row = Object.assign(
                { archived_at: null, photo: null, photo_path: null,
                  created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
                p
              );
              rows().push(row);
              return row;
            });
            return { data: q.single ? created[0] : created, error: null };
          }
          if (q.op === 'update') {
            const hit = rows().filter(match);
            hit.forEach((r) => Object.assign(r, q.payload, { updated_at: new Date().toISOString() }));
            return { data: q.single ? hit[0] || null : hit, error: null };
          }
          if (q.op === 'upsert') {
            const payload = Array.isArray(q.payload) ? q.payload : [q.payload];
            // onConflict can name a composite key, e.g. 'capsule_id,item_id'.
            const keys = (q.onConflict || 'id').split(',').map((k) => k.trim());
            const out = payload.map((p) => {
              const existing = rows().find((r) => keys.every((k) => r[k] === p[k]));
              if (existing) { Object.assign(existing, p); return existing; }
              const row = Object.assign({ created_at: new Date().toISOString() }, p);
              rows().push(row);
              return row;
            });
            return { data: q.single ? out[0] : out, error: null };
          }
          if (q.op === 'delete') {
            const list = rows();
            const removed = list.filter(match);
            removed.forEach((r) => list.splice(list.indexOf(r), 1));
            return { data: removed, error: null };
          }
          return { data: null, error: { message: 'unsupported op ' + q.op } };
        } catch (e) {
          return { data: null, error: { message: String(e) } };
        }
      }

      const builder = {
        select() { if (q.op) { /* returning clause */ } else { q.op = 'select'; } return builder; },
        insert(p) { q.op = 'insert'; q.payload = p; return builder; },
        update(p) { q.op = 'update'; q.payload = p; return builder; },
        upsert(p, o) { q.op = 'upsert'; q.payload = p; q.onConflict = o && o.onConflict; return builder; },
        delete() { q.op = 'delete'; return builder; },
        eq(c, v) { q.filters.push((r) => r[c] === v); return builder; },
        is(c, v) { q.filters.push((r) => (r[c] === undefined ? null : r[c]) === v); return builder; },
        in(c, vals) { q.filters.push((r) => vals.includes(r[c])); return builder; },
        order() { return builder; },
        single() { q.single = true; return builder; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return builder;
    }

    return {
      from,
      auth: {
        async getSession() { return { data: { session }, error: null }; },
        async signInWithPassword({ email, password }) {
          if (password !== PASSWORD) return { data: {}, error: { message: 'Invalid login credentials' } };
          session = { user: { email } };
          try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
          return { data: { session }, error: null };
        },
        async signOut() {
          session = null;
          try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
          return { error: null };
        },
      },
      storage: {
        from() {
          return {
            async createSignedUrls(paths) {
              return { data: paths.map((p) => ({ path: p, signedUrl: 'https://signed.test/' + p })), error: null };
            },
            async createSignedUrl(path) {
              return { data: { signedUrl: 'https://signed.test/' + path }, error: null };
            },
            async upload(path, blob) {
              state.storage[path] = blob && blob.size ? blob.size : 0;
              persist();
              return { data: { path }, error: null };
            },
          };
        },
      },
    };
  }

  window.supabase = { createClient };
})();
