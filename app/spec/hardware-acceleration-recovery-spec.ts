import {
  applyPersistentSoftwareRendering,
  attemptEarlyRendererCrashRecovery,
  isPrimaryWindow,
  resetRecoveryStateForTests,
  shouldRecoverFromEarlyRendererCrash,
  softwareRenderingMarkerPath,
} from '../src/browser/hardware-acceleration-recovery';

const CONFIG_DIR = '/tmp/mailspring-profile';

describe('hardware acceleration recovery', () => {
  beforeEach(() => resetRecoveryStateForTests());

  const buildFileSystem = (existing: string[]) => ({
    existsSync: jasmine
      .createSpy('existsSync')
      .andCallFake((filePath: string) => existing.includes(filePath)),
    rmSync: jasmine.createSpy('rmSync'),
    writeFileSync: jasmine.createSpy('writeFileSync'),
  });
  const buildApp = () => ({
    disableHardwareAcceleration: jasmine.createSpy('disableHardwareAcceleration'),
    exit: jasmine.createSpy('exit'),
    relaunch: jasmine.createSpy('relaunch'),
  });

  describe('shouldRecoverFromEarlyRendererCrash', () => {
    const crashed = { platform: 'win32', primaryWindow: true, loaded: false, reason: 'crashed' };

    it('recovers when a primary window crashes on Windows before it has loaded', () => {
      expect(shouldRecoverFromEarlyRendererCrash(crashed)).toBe(true);
      expect(shouldRecoverFromEarlyRendererCrash({ ...crashed, reason: 'abnormal-exit' })).toBe(
        true
      );
      expect(shouldRecoverFromEarlyRendererCrash({ ...crashed, reason: 'launch-failed' })).toBe(
        true
      );
    });

    it('leaves the normal crash handling in place otherwise', () => {
      expect(shouldRecoverFromEarlyRendererCrash({ ...crashed, loaded: true })).toBe(false);
      expect(shouldRecoverFromEarlyRendererCrash({ ...crashed, primaryWindow: false })).toBe(false);
      expect(shouldRecoverFromEarlyRendererCrash({ ...crashed, platform: 'linux' })).toBe(false);
      expect(shouldRecoverFromEarlyRendererCrash({ ...crashed, reason: 'oom' })).toBe(false);
      expect(shouldRecoverFromEarlyRendererCrash({ ...crashed, reason: 'clean-exit' })).toBe(false);
    });
  });

  it('treats the main window and onboarding as primary', () => {
    expect(isPrimaryWindow({ mainWindow: true, windowType: 'default' })).toBe(true);
    expect(isPrimaryWindow({ mainWindow: false, windowType: 'onboarding' })).toBe(true);
    expect(isPrimaryWindow({ mainWindow: false, windowType: 'composer' })).toBe(false);
  });

  it('writes the marker and relaunches at most once', () => {
    const app = {
      disableHardwareAcceleration: jasmine.createSpy('disableHardwareAcceleration'),
      exit: jasmine.createSpy('exit'),
      relaunch: jasmine.createSpy('relaunch'),
    };
    const fileSystem = {
      existsSync: jasmine.createSpy('existsSync'),
      rmSync: jasmine.createSpy('rmSync'),
      writeFileSync: jasmine.createSpy('writeFileSync'),
    };
    const options = {
      app,
      configDirPath: CONFIG_DIR,
      loaded: false,
      primaryWindow: true,
      platform: 'win32',
      reason: 'crashed',
      fileSystem,
    };

    expect(attemptEarlyRendererCrashRecovery(options)).toBe(true);
    expect(fileSystem.writeFileSync.mostRecentCall.args[0]).toBe(
      softwareRenderingMarkerPath(CONFIG_DIR)
    );
    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);

    expect(attemptEarlyRendererCrashRecovery(options)).toBe(false);
    expect(app.relaunch.callCount).toBe(1);
  });

  describe('after applyPersistentSoftwareRendering', () => {
    const crashOptions = (fileSystem: ReturnType<typeof buildFileSystem>) => ({
      configDirPath: CONFIG_DIR,
      loaded: false,
      primaryWindow: true,
      platform: 'win32',
      reason: 'crashed',
      fileSystem,
    });

    it('leaves an early crash to the crash dialog once software rendering is in effect', () => {
      const app = buildApp();
      const fileSystem = buildFileSystem([softwareRenderingMarkerPath(CONFIG_DIR)]);
      applyPersistentSoftwareRendering(app, CONFIG_DIR, 'win32', fileSystem);
      fileSystem.writeFileSync.reset();

      expect(attemptEarlyRendererCrashRecovery({ app, ...crashOptions(fileSystem) })).toBe(false);
      expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
      expect(app.relaunch).not.toHaveBeenCalled();
      expect(app.exit).not.toHaveBeenCalled();
    });

    it('still relaunches when the launch started without the marker', () => {
      const app = buildApp();
      const fileSystem = buildFileSystem([]);
      applyPersistentSoftwareRendering(app, CONFIG_DIR, 'win32', fileSystem);

      expect(attemptEarlyRendererCrashRecovery({ app, ...crashOptions(fileSystem) })).toBe(true);
      expect(app.relaunch).toHaveBeenCalled();
    });
  });

  describe('applyPersistentSoftwareRendering', () => {
    it('does nothing without the marker', () => {
      const app = buildApp();
      expect(applyPersistentSoftwareRendering(app, CONFIG_DIR, 'win32', buildFileSystem([]))).toBe(
        false
      );
      expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
    });

    it('disables acceleration and clears Chromium caches once when the marker exists', () => {
      const app = buildApp();
      const fileSystem = buildFileSystem([softwareRenderingMarkerPath(CONFIG_DIR)]);

      expect(applyPersistentSoftwareRendering(app, CONFIG_DIR, 'win32', fileSystem)).toBe(true);
      expect(app.disableHardwareAcceleration).toHaveBeenCalled();
      expect(fileSystem.rmSync.callCount).toBe(3);
      expect(fileSystem.writeFileSync).toHaveBeenCalled();
    });

    it('does not clear caches again on later launches', () => {
      const app = buildApp();
      const fileSystem = buildFileSystem([
        softwareRenderingMarkerPath(CONFIG_DIR),
        `${CONFIG_DIR}/software-rendering-cache-cleared`,
      ]);

      expect(applyPersistentSoftwareRendering(app, CONFIG_DIR, 'win32', fileSystem)).toBe(true);
      expect(app.disableHardwareAcceleration).toHaveBeenCalled();
      expect(fileSystem.rmSync).not.toHaveBeenCalled();
    });
  });
});
