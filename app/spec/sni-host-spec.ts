import proxyquire from 'proxyquire';

// proxyquire injects the mock before the module is evaluated, so the
// destructured `execFile` binding is mocked.
let execFileSpy: jasmine.Spy;
let waitForStatusNotifierHost: () => Promise<void>;

function loadModule() {
  execFileSpy = jasmine.createSpy('execFile');
  const mod = proxyquire('../src/browser/sni-host', {
    child_process: { execFile: execFileSpy, '@noCallThru': false },
  });
  waitForStatusNotifierHost = mod.waitForStatusNotifierHost;
}

function respondWith(responses: Array<string | null>) {
  let call = 0;
  execFileSpy.andCallFake(
    (
      _cmd: string,
      _args: string[],
      _opts: any,
      callback: (err: Error | null, stdout: string) => void
    ) => {
      const value = responses[Math.min(call, responses.length - 1)];
      call += 1;
      if (value === null) callback(new Error('no such name'), '');
      else callback(null, value);
    }
  );
}

const HOST_UP = 'method return ...\n   variant       boolean true\n';
const HOST_DOWN = 'method return ...\n   variant       boolean false\n';

describe('sni-host', () => {
  let originalSessionType;
  let originalWaylandDisplay;
  let originalPlatform;

  beforeEach(() => {
    originalSessionType = process.env.XDG_SESSION_TYPE;
    originalWaylandDisplay = process.env.WAYLAND_DISPLAY;
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    delete process.env.XDG_SESSION_TYPE;
    delete process.env.WAYLAND_DISPLAY;
    loadModule();
  });

  afterEach(() => {
    if (originalSessionType === undefined) delete process.env.XDG_SESSION_TYPE;
    else process.env.XDG_SESSION_TYPE = originalSessionType;
    if (originalWaylandDisplay === undefined) delete process.env.WAYLAND_DISPLAY;
    else process.env.WAYLAND_DISPLAY = originalWaylandDisplay;
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('returns immediately when a host is already registered', async () => {
    respondWith([HOST_UP]);
    const started = Date.now();
    await waitForStatusNotifierHost();
    expect(execFileSpy.calls.length).toBe(1);
    expect(Date.now() - started).toBeLessThan(400);
  });

  it('queries the IsStatusNotifierHostRegistered property over the session bus', async () => {
    respondWith([HOST_UP]);
    await waitForStatusNotifierHost();
    const [cmd, args] = execFileSpy.calls[0].args;
    expect(cmd).toBe('dbus-send');
    expect(args).toContain('--session');
    expect(args).toContain('--dest=org.kde.StatusNotifierWatcher');
    expect(args).toContain('string:IsStatusNotifierHostRegistered');
  });

  it('keeps polling until a late-starting host registers', async () => {
    respondWith([HOST_DOWN, HOST_DOWN, HOST_UP]);
    await waitForStatusNotifierHost();
    expect(execFileSpy.calls.length).toBe(3);
  });

  it('keeps polling while the watcher name has no owner', async () => {
    respondWith([null, null, HOST_UP]);
    await waitForStatusNotifierHost();
    expect(execFileSpy.calls.length).toBe(3);
  });

  it('gives up quickly on X11, where an XEmbed tray is still a valid target', async () => {
    respondWith([HOST_DOWN]);
    const started = Date.now();
    await waitForStatusNotifierHost();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThan(2500);
    expect(elapsed).toBeLessThan(6000);
  });
});
