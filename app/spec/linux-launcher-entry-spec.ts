import {
  marshalMessage,
  sanitizeCount,
  emitLauncherEntryBadge,
  _resetLauncherBusForSpec,
  APP_URI,
} from '../src/browser/linux-launcher-entry';

describe('sanitizeCount', () => {
  it('passes through a positive integer', () => {
    expect(sanitizeCount(5)).toBe(5);
  });

  it('floors fractional counts', () => {
    expect(sanitizeCount(5.9)).toBe(5);
  });

  it('clamps zero, negative and non-finite counts to 0', () => {
    expect(sanitizeCount(0)).toBe(0);
    expect(sanitizeCount(-3)).toBe(0);
    expect(sanitizeCount(NaN)).toBe(0);
    expect(sanitizeCount(Infinity)).toBe(0);
  });
});

describe('marshalMessage', () => {
  // Offset of the body within the marshalled message: the header fields array
  // length lives at byte 12, and the body starts after the fields, padded to
  // the next 8-byte boundary.
  const bodyStartOf = (buf: Buffer) => {
    const headerArrLen = buf.readUInt32LE(12);
    const end = 16 + headerArrLen;
    return end + ((8 - (end % 8)) % 8);
  };

  it('writes a valid fixed header (little-endian SIGNAL, v1) with the serial', () => {
    const buf = marshalMessage(7, APP_URI, 5, true);
    expect(buf[0]).toBe(0x6c); // 'l' — little-endian
    expect(buf[1]).toBe(4); // message type SIGNAL
    expect(buf[2]).toBe(0); // flags — matches dbus-next default for signals
    expect(buf[3]).toBe(1); // protocol version
    expect(buf.readUInt32LE(8)).toBe(7); // serial
  });

  it('backfills a body length that matches the actual body bytes', () => {
    const buf = marshalMessage(1, APP_URI, 5, true);
    const declared = buf.readUInt32LE(4);
    expect(declared).toBe(buf.length - bodyStartOf(buf));
  });

  it('marshals the app URI, int64 count and count-visible boolean into the body', () => {
    const buf = marshalMessage(1, APP_URI, 5, true);
    const body = buf.subarray(bodyStartOf(buf));
    const ascii = body.toString('latin1');
    expect(ascii).toContain(APP_URI);
    expect(ascii).toContain('count');
    expect(ascii).toContain('count-visible');
  });

  it('is byte-identical to the reference dbus-next output', () => {
    // Golden capture of the on-the-wire bytes dbus-next produces for
    // Update('application://Mailspring.desktop', {count: Int64(5), count-visible: true})
    // with serial 1. Guards the hand-rolled marshaller against regressions.
    const expected =
      '6c04000164000000010000008400000001016f002d0000002f636f6d2f63616e6f6e6963616c2f' +
      '756e6974792f6c61756e63686572656e7472792f6d61696c737072696e670000000201730021000000' +
      '636f6d2e63616e6f6e6963616c2e556e6974792e4c61756e63686572456e747279000000000000000301' +
      '7300060000005570646174650000080167000673617b73767d0000000000200000006170706c69636174' +
      '696f6e3a2f2f4d61696c737072696e672e6465736b746f7000000000340000000000000005000000636f' +
      '756e740001780000000005000000000000000d000000636f756e742d76697369626c65000162000000000' +
      '1000000';
    expect(marshalMessage(1, APP_URI, 5, true).toString('hex')).toBe(expected);
  });

  it('sets the count-visible boolean to false when clearing the badge', () => {
    const on = marshalMessage(1, APP_URI, 5, true).toString('hex');
    const off = marshalMessage(1, APP_URI, 0, false).toString('hex');
    // Same overall shape/length — only the count int64 and the trailing
    // count-visible u32 boolean differ.
    expect(off.length).toBe(on.length);
    expect(off).not.toBe(on);
    expect(off.endsWith('00000000')).toBe(true); // count-visible = 0
  });
});

describe('emitLauncherEntryBadge', () => {
  beforeEach(() => _resetLauncherBusForSpec());
  afterEach(() => _resetLauncherBusForSpec());

  it('is a no-op (never throws) off Linux or with no session bus', () => {
    const saved = process.env.DBUS_SESSION_BUS_ADDRESS;
    delete process.env.DBUS_SESSION_BUS_ADDRESS;
    expect(() => emitLauncherEntryBadge(3)).not.toThrow();
    expect(() => emitLauncherEntryBadge(0)).not.toThrow();
    if (saved !== undefined) process.env.DBUS_SESSION_BUS_ADDRESS = saved;
  });

  it('never throws even when the bus address points at a dead socket', () => {
    if (process.platform !== 'linux') return; // socket connect is only attempted on Linux
    const saved = process.env.DBUS_SESSION_BUS_ADDRESS;
    // A path that cannot connect — the failure surfaces asynchronously via the
    // socket 'error' handler and must never break the synchronous emit call.
    process.env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/nonexistent/mailspring-spec.sock';
    expect(() => emitLauncherEntryBadge(7)).not.toThrow();
    expect(() => emitLauncherEntryBadge(0)).not.toThrow();
    if (saved !== undefined) process.env.DBUS_SESSION_BUS_ADDRESS = saved;
    else delete process.env.DBUS_SESSION_BUS_ADDRESS;
  });
});
