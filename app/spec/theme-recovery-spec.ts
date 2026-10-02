import {
  resetThemeForRecovery,
  SAFE_THEME_SETTINGS,
  themeCompileCachePaths,
} from '../src/browser/theme-recovery';

describe('theme recovery', () => {
  it('restores bundled automatic, light, and dark theme selections', () => {
    const config = { set: jasmine.createSpy('set').andReturn(true) };
    const fileSystem = { rmSync: jasmine.createSpy('rmSync') };

    resetThemeForRecovery(config, '/tmp/profile', fileSystem as any);

    for (const [keyPath, value] of SAFE_THEME_SETTINGS) {
      expect(config.set).toHaveBeenCalledWith(keyPath, value);
    }
  });

  it('clears both left-to-right and right-to-left LESS caches', () => {
    const config = { set: jasmine.createSpy('set').andReturn(true) };
    const fileSystem = { rmSync: jasmine.createSpy('rmSync') };

    resetThemeForRecovery(config, '/tmp/profile', fileSystem as any);

    for (const cachePath of themeCompileCachePaths('/tmp/profile')) {
      expect(fileSystem.rmSync).toHaveBeenCalledWith(cachePath, { recursive: true, force: true });
    }
  });

  it('returns cache failures after restoring safe theme settings', () => {
    const config = { set: jasmine.createSpy('set').andReturn(true) };
    const cacheError = new Error('cache is locked');
    const fileSystem = {
      rmSync: jasmine.createSpy('rmSync').andCallFake(() => {
        throw cacheError;
      }),
    };

    const errors = resetThemeForRecovery(config, '/tmp/profile', fileSystem as any);

    expect(errors).toEqual([cacheError, cacheError]);
  });
});
