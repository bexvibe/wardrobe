// Getting to the two halves of the Outfits destination, the way a thumb
// does.
//
// Faves is a switch inside Outfits rather than a destination of its own,
// but both halves of that switch are on the bar at all times, so either is
// one tap from anywhere. Going through here rather than through a raw
// click means a suite that only wants to be on a page says so, and the
// one suite that is about the bar itself is where the bar is checked.
module.exports = {
  // The kept half.
  async toFaves(page, settle){
    await page.click('#nav-saved-btn');
    await page.waitForFunction(() => appMode === 'saved');
    await page.waitForTimeout(settle === undefined ? 900 : settle);
  },

  // The generated half.
  async toAll(page, settle){
    await page.click('#nav-outfits-btn');
    await page.waitForFunction(() => appMode === 'outfits');
    await page.waitForTimeout(settle === undefined ? 1200 : settle);
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
  // `save` picks the side on a staged sheet, and defaults to keeping your
  // work. The piece form is on a backdrop of its own, so it is looked for
  // first: when it is up, it is the sheet you are on.
  async leaveSheet(page, opts){
    const save = !opts || opts.save !== false;
    const side = save ? ':not(.secondary)' : '.secondary';

    if(await page.$('#form-backdrop.open .sheet-footer .btn')){
      await page.click('#form-backdrop .sheet-footer .btn' + side);
    } else if(await page.$('#modal .sheet-footer.split .btn')){
      await page.click('#modal .sheet-footer .btn' + side);
    } else if(await page.$('#modal .sheet-footer .btn')){
      await page.click('#modal .sheet-footer .btn');          // live: Done
    } else {
      // Read-only: tap the page showing above the sheet, which means the
      // same as pushing the sheet down.
      await page.click('#modal-backdrop', { position: { x: 180, y: 18 } });
    }
    await page.waitForTimeout((opts && opts.settle) || 600);
  },
};
