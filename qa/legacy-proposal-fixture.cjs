'use strict';
// Fixture-only access to the retained local engine handlers. These are NOT
// visible UI interactions: proposal management now belongs to Dashboard.
// Keep lifecycle/isolation tests exercising the existing engine, not a forced
// click on a retired drawer or a second implementation of draft creation.
module.exports = async function legacyProposalFixture(page, action) {
  if (!['pmNew', 'pmDup'].includes(action)) throw new Error('Unsupported proposal fixture action');
  const previous = await page.evaluate(id => {
    const previous = Proposals.activeId();
    document.getElementById(id).click();
    return previous;
  }, action);
  await page.waitForFunction(`window.Proposals.activeId() !== ${JSON.stringify(previous)}`);
};
