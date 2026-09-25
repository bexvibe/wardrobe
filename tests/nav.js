// Getting to the two halves of the Outfits destination, the way a thumb
// does.
//
// Faves is a switch inside Outfits rather than a destination of its own,
// and the switch is only in the bar once you are on that destination. So
// reaching what you kept from the wardrobe is two taps, not one, and a
// test that wants to be there has to take both — which is also the point:
// if the bar stops offering the switch, every suite that goes to Faves
// says so.
module.exports = {
  // The kept half. Safe to call from anywhere, including from the other
  // half, where the first tap is a no-op.
  async toFaves(page, settle){
    await page.click('#nav-outfits-btn');
    await page.waitForSelector('#nav-saved-btn');
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
