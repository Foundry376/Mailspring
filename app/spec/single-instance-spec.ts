import { EventEmitter } from 'events';
import { claimSingleInstance } from '../src/browser/single-instance';

describe('claimSingleInstance', () => {
  const launcherArgv = [
    '/usr/lib/electron44/electron',
    '--require',
    '/usr/lib/mailspring/mailspring.js',
    '--app',
    '/usr/lib/mailspring/app.asar',
  ];
  // What Electron 44 hands `second-instance` for launcherArgv.
  const forwardedCommandLine = [
    '/usr/lib/electron44/electron',
    '--require',
    '--app',
    '--allow-file-access-from-files',
    '/usr/lib/mailspring/mailspring.js',
    '/usr/lib/mailspring/app.asar',
  ];

  const buildApp = (gotTheLock: boolean) => {
    const app: any = new EventEmitter();
    app.requestSingleInstanceLock = jasmine
      .createSpy('requestSingleInstanceLock')
      .andReturn(gotTheLock);
    return app;
  };

  it('sends its own arguments along with the request for the lock', () => {
    const app = buildApp(true);
    claimSingleInstance(app, launcherArgv, () => {});
    expect(app.requestSingleInstanceLock).toHaveBeenCalledWith({ argv: launcherArgv });
  });

  it('reports whether it got the lock', () => {
    expect(claimSingleInstance(buildApp(true), launcherArgv, () => {})).toBe(true);
    expect(claimSingleInstance(buildApp(false), launcherArgv, () => {})).toBe(false);
  });

  it('does not listen for later launches without the lock', () => {
    const app = buildApp(false);
    claimSingleInstance(app, launcherArgv, () => {});
    expect(app.listenerCount('second-instance')).toBe(0);
  });

  it("passes on a later launch's arguments as it sent them", () => {
    const app = buildApp(true);
    const onSecondInstance = jasmine.createSpy('onSecondInstance');
    claimSingleInstance(app, launcherArgv, onSecondInstance);

    app.emit('second-instance', {}, forwardedCommandLine, '/home/user', { argv: launcherArgv });

    expect(onSecondInstance).toHaveBeenCalledWith(launcherArgv);
  });

  it('passes on the forwarded command line when a later launch sent no arguments of its own', () => {
    const app = buildApp(true);
    const onSecondInstance = jasmine.createSpy('onSecondInstance');
    claimSingleInstance(app, launcherArgv, onSecondInstance);

    app.emit('second-instance', {}, forwardedCommandLine, '/home/user', undefined);

    expect(onSecondInstance).toHaveBeenCalledWith(forwardedCommandLine);
  });

  it('passes on the forwarded command line when a later launch sent malformed arguments', () => {
    const app = buildApp(true);
    const onSecondInstance = jasmine.createSpy('onSecondInstance');
    claimSingleInstance(app, launcherArgv, onSecondInstance);

    for (const additionalData of [{}, { argv: 'mailto:a@example.com' }, { argv: ['ok', 42] }]) {
      onSecondInstance.reset();
      app.emit('second-instance', {}, forwardedCommandLine, '/home/user', additionalData);
      expect(onSecondInstance).toHaveBeenCalledWith(forwardedCommandLine);
    }
  });
});
