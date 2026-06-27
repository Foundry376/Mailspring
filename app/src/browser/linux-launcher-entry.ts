export const LAUNCHER_ENTRY_INTERFACE = 'com.canonical.Unity.LauncherEntry';
export const LAUNCHER_ENTRY_PATH = '/com/canonical/unity/launcherentry/mailspring';
export const APP_URI = 'application://Mailspring.desktop';

export interface LauncherEntryUpdate {
  path: string;
  interface: string;
  member: 'Update';
  signature: 'sa{sv}';
  appUri: string;
  count: number;
  countVisible: boolean;
}

export function buildLauncherEntryUpdate(appUri: string, count: number): LauncherEntryUpdate {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return {
    path: LAUNCHER_ENTRY_PATH,
    interface: LAUNCHER_ENTRY_INTERFACE,
    member: 'Update',
    signature: 'sa{sv}',
    appUri,
    count: safe,
    countVisible: safe > 0,
  };
}

/* eslint global-require: 0 */
let _bus: any = null;

// Test seam: clear the cached bus so specs can stub dbus-next.sessionBus().
export function _resetLauncherBusForSpec(): void {
  _bus = null;
}

export function emitLauncherEntryBadge(count: number, appUri: string = APP_URI): void {
  if (process.platform !== 'linux') return;
  if (!process.env.DBUS_SESSION_BUS_ADDRESS) return;
  try {
    const dbus = require('dbus-next');
    if (!_bus) {
      _bus = dbus.sessionBus();
      // dbus-next reports CONNECTION failures ASYNCHRONOUSLY via an 'error'
      // event (lib/bus.js: this.emit('error', err)). An EventEmitter 'error'
      // with no listener throws and crashes the app -- always attach one.
      _bus.on('error', (err: Error) => {
        console.warn('[launcher-badge] session bus error:', err && err.message);
        _bus = null; // force reconnect on next emit
      });
    }
    const u = buildLauncherEntryUpdate(appUri, count);
    const msg = new dbus.Message({
      type: dbus.MessageType.SIGNAL,
      path: u.path,
      interface: u.interface,
      member: u.member,
      signature: u.signature,
      body: [
        u.appUri,
        {
          count: new dbus.Variant('x', BigInt(u.count)),
          'count-visible': new dbus.Variant('b', u.countVisible),
        },
      ],
    });
    _bus.send(msg);
  } catch (err) {
    // A desktop-integration nicety must never break the app (sync errors).
    console.warn(
      '[launcher-badge] failed to emit LauncherEntry signal:',
      err && (err as Error).message
    );
    _bus = null; // force reconnect next time
  }
}
