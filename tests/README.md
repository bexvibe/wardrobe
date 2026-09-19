# Tests

Thirty-odd Playwright suites, about nine hundred checks, run against the
real `index.html` over a local file server with Supabase stubbed out.

```sh
node tests/run.js                 # everything, four at a time
node tests/run.js chips trail     # only suites whose names contain these
node tests/run.js --serial        # one at a time
node tests/run.js --verbose       # every check, not just failures
```

The runner starts the file server on port 8933 if nothing is serving
there, and leaves it up afterwards so the next run and any one-off script
find it already going. `pkill -f "http.server 8933"` to stop it.

It exits non-zero if any suite fails, and treats a suite that produced no
summary line as a failure — a crash and a pass should never look alike.

## What a suite is

A plain Node script. No framework: it prints `PASS`/`FAIL` lines and a
`N/M checks passed` summary, and exits non-zero if anything failed. That
is the whole contract, and it is why the runner can be forty lines.

Each one launches Chromium, stubs `window.supabase` with
`fake-supabase.js`, seeds it from `supabase/seed-items.json`, and drives
the app the way a person would — tapping what is on screen rather than
calling functions, wherever tapping is possible.

## Writing one

Copy the top of any existing suite. The parts that matter:

- **Route the vendor script**, which is where the stub goes in. Seed data,
  tags, capsules and kept outfits are passed as `window.__SEED_*` globals
  ahead of it.
- **Route `config.js`**, or the app will look for the real project.
- **The password is `correct-horse`** — the stub accepts that and nothing
  else.
- **Screenshots go through `shot('name.png')`**, which puts them in
  `tests/shots/`. That directory is ignored by git.

Name it `test_<thing>.js` and the runner picks it up.

## Things that have bitten us

- **The docked filter panel covers the bottom third of the screen.** A tap
  aimed at something under it hits the panel instead. Close it first:
  `await p.evaluate(() => closeFilterSheet())`.
- **Playwright scrolls an element into view before clicking it.** If the
  test is measuring where the page was, that click has already moved it.
  Click through `p.evaluate` instead, and pick an element already on
  screen.
- **Outfits are generated, so card heights vary run to run.** Anything
  that depends on where a card lands is a flake waiting to happen. Wait
  for state (`p.waitForFunction(() => favoriteOutfits.length === 1)`)
  rather than for milliseconds, wherever there is state to wait for.
- **`expandedComboKey` is shared** between a page and the outfit list
  inside a detail sheet, so what is open in the sheet may be nothing at
  all. Open the card you want explicitly.
- **Both sheet backdrops keep a back button.** `.sheet-back` matches the
  hidden one too; check which backdrop is up first.
