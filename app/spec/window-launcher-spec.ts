import WindowLauncher from '../src/browser/window-launcher';

describe('WindowLauncher', () => {
  let originalPlatform;

  const launcherWithConfig = (settings: Record<string, unknown>) =>
    new WindowLauncher({
      devMode: false,
      safeMode: false,
      specMode: true,
      resourcePath: '',
      configDirPath: '',
      onCreatedHotWindow: () => {},
      config: { get: (key) => settings[key] } as any,
    });

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  describe('createDefaultWindowOpts on Linux', () => {
    it('uses the custom frame when menubarStyle has never been set', () => {
      const opts = launcherWithConfig({}).createDefaultWindowOpts();
      expect(opts.frame).toBe(false);
      expect(opts.toolbar).toBe(true);
    });

    it('uses the custom frame when menubarStyle is hamburger', () => {
      const opts = launcherWithConfig({
        'core.workspace.menubarStyle': 'hamburger',
      }).createDefaultWindowOpts();
      expect(opts.frame).toBe(false);
      expect(opts.toolbar).toBe(true);
    });

    it('keeps the native frame when menubarStyle is default', () => {
      const opts = launcherWithConfig({
        'core.workspace.menubarStyle': 'default',
      }).createDefaultWindowOpts();
      expect(opts.frame).toBe(true);
      expect(opts.autoHideMenuBar).toBe(false);
    });

    it('keeps the native frame and hides the menu bar when menubarStyle is autohide', () => {
      const opts = launcherWithConfig({
        'core.workspace.menubarStyle': 'autohide',
      }).createDefaultWindowOpts();
      expect(opts.frame).toBe(true);
      expect(opts.autoHideMenuBar).toBe(true);
    });
  });
});
