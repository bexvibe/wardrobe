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
};
