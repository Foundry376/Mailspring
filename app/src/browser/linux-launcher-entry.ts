/**
 * Minimal D-Bus signal emitter for com.canonical.Unity.LauncherEntry.Update.
 *
 * Implements just enough of the D-Bus wire protocol to send a fire-and-forget
 * signal over the session bus — zero external dependencies. This is the standard
 * mechanism for taskbar badge counts on Linux desktops (KDE, GNOME, Cinnamon, etc.).
 * Electron's app.setBadgeCount() relies on libunity, which is only present on
 * Ubuntu/Unity; this direct D-Bus approach works everywhere.
 *
 * The marshalled bytes are byte-identical to what dbus-next produces for the
 * same SIGNAL, but without pulling in dbus-next and its stale, ~5-years
 * unmaintained dependency tree (usocket, xml2js, long, etc.). We only need to
 * *send* one fixed signal, so a hand-rolled marshaller on native Buffers, the
 * built-in `net` unix socket, and native BigInt is both smaller and safer.
 *
 * Wire format reference: https://dbus.freedesktop.org/doc/dbus-specification.html
 */
import * as net from 'net';

export const APP_URI = 'application://Mailspring.desktop';

const OBJECT_PATH = '/com/canonical/unity/launcherentry/mailspring';
const IFACE = 'com.canonical.Unity.LauncherEntry';
const MEMBER = 'Update';
const BODY_SIG = 'sa{sv}';

/** Sanitize a badge count: floor to integer, clamp negative/NaN to 0. */
export function sanitizeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

// ---------------------------------------------------------------------------
// D-Bus address parsing
// ---------------------------------------------------------------------------

function getSocketPath(): string | null {
  const addr = process.env.DBUS_SESSION_BUS_ADDRESS;
  if (!addr) return null;
  const transport = addr.split(';')[0];
  if (!transport.startsWith('unix:')) return null;
  for (const part of transport.slice(5).split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const val = part.slice(eq + 1);
    if (key === 'path') return val;
    if (key === 'abstract') return '\0' + val;
  }
  return null;
}

// ---------------------------------------------------------------------------
// D-Bus wire-protocol marshalling (hardcoded for the LauncherEntry signal)
// ---------------------------------------------------------------------------

// Padding bytes needed to reach the next `boundary`-aligned offset.
const pad = (offset: number, n: number) => (n - (offset % n)) % n;

/**
 * Marshal the complete D-Bus SIGNAL message into a single Buffer.
 *
 * Layout:
 *   Fixed header  (12 B):  yyyyuu  — endian, type, flags, version, bodyLen, serial
 *   Header fields (var):   a(yv)   — PATH, INTERFACE, MEMBER, SIGNATURE
 *   [zero-pad to 8-byte boundary]
 *   Body          (var):   sa{sv}  — appUri + {count, count-visible}
 */
export function marshalMessage(
  serial: number,
  appUri: string,
  count: number,
  countVisible: boolean
): Buffer {
  const buf = Buffer.alloc(512); // actual message is ~252 B
  let o = 0;

  // --- Fixed header (12 bytes) ---
  buf[o++] = 0x6c; // 'l' = little-endian
  buf[o++] = 4; // SIGNAL
  buf[o++] = 0; // flags (none — matches dbus-next default for signals)
  buf[o++] = 1; // protocol version
  const bodyLenOff = o;
  o += 4; // body length — backfill later
  buf.writeUInt32LE(serial, o);
  o += 4;
  // o = 12

  // --- Helper closures (they mutate `o` via closure) ---

  const writeStr = (s: string) => {
    o += pad(o, 4);
    const b = Buffer.from(s, 'utf8');
    buf.writeUInt32LE(b.length, o);
    o += 4;
    b.copy(buf, o);
    o += b.length;
    buf[o++] = 0; // NUL
  };

  const writeSig = (s: string) => {
    buf[o++] = s.length;
    Buffer.from(s, 'ascii').copy(buf, o);
    o += s.length;
    buf[o++] = 0; // NUL
  };

  // Write one header field: struct (BYTE fieldId, VARIANT value)
  const writeField = (id: number, typeSig: string, writeValue: () => void) => {
    o += pad(o, 8); // struct alignment
    buf[o++] = id;
    // variant = signature-as-type-'g' + marshalled value
    buf[o++] = 1;
    buf[o++] = typeSig.charCodeAt(0);
    buf[o++] = 0;
    writeValue();
  };

  // --- Header fields: a(yv) ---
  const arrLenOff = o;
  o += 4; // array byte-length placeholder
  o += pad(o, 8); // struct element alignment
  const arrStart = o;

  writeField(1, 'o', () => writeStr(OBJECT_PATH)); // PATH
  writeField(2, 's', () => writeStr(IFACE)); // INTERFACE
  writeField(3, 's', () => writeStr(MEMBER)); // MEMBER
  writeField(8, 'g', () => writeSig(BODY_SIG)); // SIGNATURE

  buf.writeUInt32LE(o - arrStart, arrLenOff); // backfill array length
  o += pad(o, 8); // pad header to 8-byte boundary
  const bodyStart = o;

  // --- Body: sa{sv} ---
  writeStr(appUri);

  // Array a{sv}
  o += pad(o, 4);
  const dictLenOff = o;
  o += 4; // array byte-length placeholder
  o += pad(o, 8); // dict-entry alignment
  const dictStart = o;

  // {count: Variant('x', int64)}
  o += pad(o, 8);
  writeStr('count');
  buf[o++] = 1;
  buf[o++] = 0x78;
  buf[o++] = 0; // variant sig 'x'
  o += pad(o, 8); // int64 alignment
  buf.writeBigInt64LE(BigInt(count), o);
  o += 8;

  // {count-visible: Variant('b', boolean)}
  o += pad(o, 8);
  writeStr('count-visible');
  buf[o++] = 1;
  buf[o++] = 0x62;
  buf[o++] = 0; // variant sig 'b'
  o += pad(o, 4); // boolean alignment
  buf.writeUInt32LE(countVisible ? 1 : 0, o);
  o += 4;

  buf.writeUInt32LE(o - dictStart, dictLenOff); // backfill dict array length
  buf.writeUInt32LE(o - bodyStart, bodyLenOff); // backfill body length

  return buf.subarray(0, o);
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

interface Conn {
  socket: net.Socket;
  ready: boolean;
  pending: Buffer[];
}

let _conn: Conn | null = null;
let _serial = 0;

function resetConnection() {
  if (!_conn) return;
  try {
    _conn.socket.destroy();
  } catch {
    // already torn down — nothing to clean up
  }
  _conn = null;
}

/** Test seam: clear cached connection so specs can test fresh. */
export function _resetLauncherBusForSpec(): void {
  resetConnection();
  _serial = 0;
}

function sendRaw(msg: Buffer): void {
  // Fast path: connection is ready.
  if (_conn?.ready) {
    _conn.socket.write(msg);
    return;
  }

  // Connection exists but handshake is in progress — queue the message.
  if (_conn) {
    _conn.pending.push(msg);
    return;
  }

  // No connection — establish one.
  const socketPath = getSocketPath();
  if (!socketPath) return;

  const socket = net.createConnection({ path: socketPath });
  const conn: Conn = { socket, ready: false, pending: [msg] };
  _conn = conn;

  socket.on('error', (err: Error) => {
    console.warn('[launcher-badge] socket error:', err?.message);
    resetConnection();
  });
  socket.on('close', () => resetConnection());

  // D-Bus EXTERNAL auth handshake:
  //   Client: \0  AUTH EXTERNAL <hex(uid)>\r\n
  //   Server: OK <guid>\r\n
  //   Client: BEGIN\r\n
  //   (binary protocol starts)
  let authBuf = '';

  socket.on('connect', () => {
    // getuid is always present on the Linux/POSIX platforms we reach here.
    const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
    const hexUid = Buffer.from(String(uid), 'ascii').toString('hex');
    socket.write(`\0AUTH EXTERNAL ${hexUid}\r\n`);
  });

  socket.on('data', (data: Buffer) => {
    if (conn.ready) return;
    authBuf += data.toString('ascii');
    const lines = authBuf.split('\r\n');
    for (const line of lines) {
      if (line.startsWith('OK')) {
        socket.write('BEGIN\r\n');
        conn.ready = true;
        for (const pending of conn.pending) socket.write(pending);
        conn.pending = [];
        return;
      }
      if (line.startsWith('REJECTED') || line.startsWith('ERROR')) {
        console.warn('[launcher-badge] D-Bus auth failed:', line);
        resetConnection();
        return;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit a com.canonical.Unity.LauncherEntry.Update signal with the given
 * badge count. Safe no-op on non-Linux or when no session bus is available.
 */
export function emitLauncherEntryBadge(count: number, appUri: string = APP_URI): void {
  if (process.platform !== 'linux') return;
  if (!process.env.DBUS_SESSION_BUS_ADDRESS) return;

  try {
    const safe = sanitizeCount(count);
    const msg = marshalMessage(++_serial, appUri, safe, safe > 0);
    sendRaw(msg);
  } catch (err) {
    console.warn('[launcher-badge] failed to emit signal:', (err as Error)?.message);
    resetConnection();
  }
}
