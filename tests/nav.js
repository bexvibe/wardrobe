// Getting to the two halves of the Outfits destination, the way a thumb
// does.
//
// Faves is a switch inside Outfits rather than a destination of its own,
// but both halves of that switch are on the bar at all times, so either is
// one tap from anywhere. Going through here rather than through a raw
// click means a suite that only wants to be on a page says so, and the
// one suite that is about the bar itself is where the bar is checked.
// Search takes the navigation's place at the foot of the screen while it is
// open, so the way to a tab is Back first.
async function leaveSearch(page){
  if(await page.isVisible('#search-overlay')) await page.click('#search-back');
}

module.exports = {
  // The kept half.
  async toFaves(page, settle){
    await leaveSearch(page);
    // The heart only shows once you are on Outfits.
    if(!(await page.$('#nav-saved-btn'))){
      await page.click('#nav-outfits-btn');
      await page.waitForSelector('#nav-saved-btn');
    }
    await page.click('#nav-saved-btn');
    await page.waitForFunction(() => appMode === 'saved');
    await page.waitForTimeout(settle === undefined ? 900 : settle);
  },

  // The generated half.
  async toAll(page, settle){
    await leaveSearch(page);
    await page.click('#nav-outfits-btn');
    await page.waitForFunction(() => appMode === 'outfits');
    await page.waitForTimeout(settle === undefined ? 1200 : settle);
  },

  // The Filters sheet is four rows, and each opens a page. These do what a
  // thumb does: open a row, open a category inside Pieces, come back.
  async openFilterSection(page, name, settle){
    await page.click(`#filter-sheet [data-filter-row="${name}"]`);
    await page.waitForTimeout(settle === undefined ? 450 : settle);
  },
  async openFilterCategory(page, tab, settle){
    if(!(await page.$('#filter-sheet [data-filter-cat]'))) await module.exports.openFilterSection(page, 'pieces');
    await page.click(`#filter-sheet [data-filter-cat="${tab}"]`);
    await page.waitForTimeout(settle === undefined ? 450 : settle);
  },
  async filterBack(page, settle){
    await page.click('#filter-sheet-back');
    await page.waitForTimeout(settle === undefined ? 450 : settle);
  },
  // A tag, a capsule or a level, ticked or unticked on its own page, then back
  // to the rows.
  async tickFilter(page, section, label){
    await module.exports.openFilterSection(page, section);
    await page.click(`#filter-section-list .capsule-pick:has-text("${label}")`);
    await page.waitForTimeout(350);
    await module.exports.filterBack(page);
  },

  // Leaving whichever sheet is up.
  //
  // The control differs by what the sheet is for: one that applies live
  // has a single Done, one holding a draft has Cancel and Save at
  // opposite ends, one with nothing on it has only the strip of page
  // above it. A suite that merely wants to be somewhere else should not
  // have to know which — but a suite that is about the leaving still
  // reaches for the control it means.
  //
  // An outfit's page is left by its Back, whichever side `save` asks for.
  //
  // `save` picks the side on a staged sheet, and defaults to keeping your
  // work. The piece form is on a backdrop of its own, so it is looked for
  // first: when it is up, it is the sheet you are on.
  async leaveSheet(page, opts){
    const save = !opts || opts.save !== false;
    const side = save ? ':not(.secondary)' : '.secondary';

    if(await page.evaluate(() => typeof filterSheetOpen === 'function' && filterSheetOpen()
        && !document.querySelector('.modal-backdrop.open, #form-backdrop.open'))){
      await page.click('#filter-sheet-see');           // the filters: See N outfits
    } else if(await page.$('#modal-backdrop.open.as-page #item-page-back')){
      await page.click('#item-page-back');             // a piece's page: Back
    } else if(await page.$('#form-backdrop.open .sheet-footer .btn')){
      await page.click('#form-backdrop .sheet-footer .btn' + side);
    } else if(await page.$('#modal-backdrop.open #modal .sheet-footer.split .btn')){
      // A picker page that applies as you tick has only Back.
      const want = await page.$('#modal .sheet-footer .btn' + side);
      await page.click(want ? '#modal .sheet-footer .btn' + side : '#modal .sheet-footer .btn');
    } else if(await page.$('#modal-backdrop.open #modal .sheet-footer .btn')){
      await page.click('#modal .sheet-footer .btn');          // live: Done
    } else if(!(await page.$('#modal-backdrop.open')) && await page.$('#outfit-page.open #outfit-page-back')){
      // An outfit's page has one way out, on its bar: Back. Its other
      // button is for the outfit, not for leaving.
      await page.click('#outfit-page-back');
    } else {
      // Read-only: tap the page showing above the sheet, which means the
      // same as pushing the sheet down.
      await page.click('#modal-backdrop', { position: { x: 180, y: 18 } });
    }
    await page.waitForTimeout((opts && opts.settle) || 600);
  },

  // The form picks its category and tags on pages of their own, the way
  // capsules are picked. Ticks land on the form as they are made, and Back
  // is the only way out. These do what a thumb does there.
  //
  // A category is found by typing it; Enter takes it as typed or as the
  // list spells it, so a new one works the same as an old one.
  async chooseCategory(page, name){
    await page.click('#form-category-field button'); await page.waitForTimeout(350);
    await page.fill('#form-pick-input', name);
    await page.press('#form-pick-input', 'Enter');
    await page.click('#modal .sheet-footer .btn.secondary'); await page.waitForTimeout(450);
  },

  // Adds these tags (comma separated, as the field has always taken them)
  // to whichever the piece already has.
  async addTags(page, text){
    await page.click('#form-tags-field button'); await page.waitForTimeout(350);
    await page.fill('#form-pick-input', text);
    await page.press('#form-pick-input', 'Enter');
    await page.click('#modal .sheet-footer .btn.secondary'); await page.waitForTimeout(450);
  },
};
