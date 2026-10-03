// A throw at import time takes down the whole main window, and only opening the app would show it.
describe('events package', function () {
  it('loads its entry point', function () {
    const main = require('../lib/main');
    expect(typeof main.activate).toBe('function');
    expect(typeof main.deactivate).toBe('function');
  });

  it('loads the event header', function () {
    expect(require('../lib/event-header').EventHeader).toBeDefined();
  });
});
