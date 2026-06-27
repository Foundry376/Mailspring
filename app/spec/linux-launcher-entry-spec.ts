import {
  buildLauncherEntryUpdate,
  emitLauncherEntryBadge,
  _resetLauncherBusForSpec,
  APP_URI,
} from '../src/browser/linux-launcher-entry';

describe('buildLauncherEntryUpdate', () => {
  it('sets count and count-visible=true for a positive count', () => {
    const u = buildLauncherEntryUpdate(APP_URI, 5);
    expect(u.appUri).toBe('application://Mailspring.desktop');
    expect(u.count).toBe(5);
    expect(u.countVisible).toBe(true);
    expect(u.signature).toBe('sa{sv}');
    expect(u.interface).toBe('com.canonical.Unity.LauncherEntry');
    expect(u.member).toBe('Update');
  });

  it('clears the badge (count-visible=false) for zero', () => {
    const u = buildLauncherEntryUpdate(APP_URI, 0);
    expect(u.count).toBe(0);
    expect(u.countVisible).toBe(false);
  });

  it('floors and guards invalid counts', () => {
    expect(buildLauncherEntryUpdate(APP_URI, 5.9).count).toBe(5);
    expect(buildLauncherEntryUpdate(APP_URI, -3).count).toBe(0);
    expect(buildLauncherEntryUpdate(APP_URI, NaN).count).toBe(0);
  });
});

describe('emitLauncherEntryBadge', () => {
  beforeEach(() => _resetLauncherBusForSpec());

  it('never throws when a session bus is available', () => {
    if (process.platform !== 'linux' || !process.env.DBUS_SESSION_BUS_ADDRESS) {
      // env-gated: no session bus. The runner has no jasmine pending(); skip by returning.
      return;
    }
    expect(() => emitLauncherEntryBadge(7)).not.toThrow();
    expect(() => emitLauncherEntryBadge(0)).not.toThrow();
  });

  it('is a no-op (no throw) off Linux or with no bus', () => {
    const saved = process.env.DBUS_SESSION_BUS_ADDRESS;
    delete process.env.DBUS_SESSION_BUS_ADDRESS;
    expect(() => emitLauncherEntryBadge(3)).not.toThrow();
    if (saved !== undefined) process.env.DBUS_SESSION_BUS_ADDRESS = saved;
  });

  it('survives an ASYNC bus error without crashing (error handler attached)', () => {
    if (process.platform !== 'linux') return;
    const { EventEmitter } = require('events');
    const fakeBus: any = new EventEmitter();
    fakeBus.send = () => {};
    const dbus = require('dbus-next');
    spyOn(dbus, 'sessionBus').andReturn(fakeBus);
    const saved = process.env.DBUS_SESSION_BUS_ADDRESS;
    process.env.DBUS_SESSION_BUS_ADDRESS = 'unix:abstract=spec';
    emitLauncherEntryBadge(3);
    expect(() => fakeBus.emit('error', new Error('boom'))).not.toThrow();
    if (saved !== undefined) process.env.DBUS_SESSION_BUS_ADDRESS = saved;
    else delete process.env.DBUS_SESSION_BUS_ADDRESS;
  });
});
