import AutoUpdateManager from '../src/browser/autoupdate-manager';

describe('AutoUpdateManager', () => {
  it('does not offer upstream updates, including after explicit update commands', () => {
    const manager = new AutoUpdateManager();
    expect(manager.getState()).toBe('unsupported');
    manager.check();
    manager.install();
    expect(manager.getState()).toBe('unsupported');
  });
});
