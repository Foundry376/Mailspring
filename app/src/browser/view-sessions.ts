import { BrowserWindow, IpcMain, session } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  VIEW_SCHEME,
  PARTITION_PREFIX,
  viewIdForPartition,
  isViewOrigin,
  containedFile,
  networkGrantsFromManifest,
  isRequestAllowed,
  contentSecurityPolicy,
  proxyConfig,
  isProxyableImageURL,
  servableResourceType,
} from './view-sandbox-policy';

/**
 * Main-process half of Sandboxed Views (docs/plans/sandboxed-views-exploration.md).
 *
 * Every View runs in a `<webview>` whose partition is `persist:view-<viewId>`. The first
 * time such a partition is attached, its session is locked down here: it can only load
 * `mailspring-view://<viewId>/…` URLs served by this module, it gets the bridge preload
 * registered by the host (never one named on the tag), and every other request,
 * permission, popup, download, dialog and navigation is refused. The policy itself
 * (what is allowed) lives in view-sandbox-policy.ts.
 */

export { VIEW_SCHEME, viewIdForPartition };

// A View is one hand- or agent-written file; anything this large is a mistake or an attack
// on the main process, which transpiles it synchronously.
const MAX_VIEW_SOURCE_BYTES = 2 * 1024 * 1024;

// A visible View renderer that can't answer a heartbeat for this long is killed and the host
// shows its crash cover. Long synchronous work belongs in a Worker.
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 15000;

// The host window reports which guests are on screen (ViewHost watches its own element), and
// tells the host just before the watchdog kills a guest so it can record why.
export const VISIBILITY_CHANNEL = 'mailspring-view:visibility';
export const WATCHDOG_KILL_CHANNEL = 'mailspring-view:watchdog-kill';

// Guests not in this set are hidden. Unknown guests count as visible until reported.
const hiddenGuests = new Set<number>();

const CONTENT_TYPES: { [ext: string]: string } = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const viewIdsBySession = new WeakMap<Electron.Session, string>();

interface ViewPaths {
  runtimeDir: string;
  vendorDir: string;
  bundleDirs: string[];
}

function viewPaths(): ViewPaths {
  const { resourcePath, configDirPath, devMode } = global.application;
  const packageDir = path.join(resourcePath, 'internal_packages', 'views');
  // Same precedence as viewBundleRoots() in the views package: a draft previews over the
  // installed copy of the View.
  const bundleDirs = [path.join(configDirPath, 'views-drafts'), path.join(configDirPath, 'views')];
  if (devMode) {
    bundleDirs.push(path.join(packageDir, 'examples'));
  }
  return {
    runtimeDir: path.join(packageDir, 'runtime'),
    vendorDir: path.join(packageDir, 'vendor'),
    bundleDirs,
  };
}

export function viewIdForSession(ses: Electron.Session): string | null {
  return viewIdsBySession.get(ses) || null;
}

function bundleDirForView(viewId: string, paths: ViewPaths): string | null {
  for (const dir of paths.bundleDirs) {
    if (containedFile(path.join(dir, viewId), 'manifest.json')) {
      return path.join(dir, viewId);
    }
  }
  return null;
}

interface VendorManifest {
  scripts: string[];
  styles: string[];
  modules: { [name: string]: string };
}

function readVendorManifest(paths: ViewPaths): VendorManifest {
  const json = JSON.parse(fs.readFileSync(path.join(paths.vendorDir, 'manifest.json'), 'utf8'));
  return normalizeVendorManifest(json);
}

// vendor/manifest.json is an ordered array of `{ file, global, module }`, where `module` is
// the list of import specifiers that resolve to `global`, or null for files that are loaded
// for their side effects (aliases, the Tailwind browser build). Every entry is loaded, in order.
function normalizeVendorManifest(
  entries: { file: string; global: string | null; module: string[] | null }[]
): VendorManifest {
  const scripts: string[] = [];
  const styles: string[] = [];
  const modules: { [name: string]: string } = {};
  for (const { file, global: globalName, module } of entries) {
    (file.endsWith('.css') ? styles : scripts).push(file);
    for (const specifier of module || []) {
      modules[specifier] = globalName;
    }
  }
  return { scripts, styles, modules };
}

function shellHTML(vendor: VendorManifest) {
  const styles = [...vendor.styles.map((f) => `_lib/${f}`), '_runtime/view.css', 'view.css'].map(
    (href) => `<link rel="stylesheet" href="${href}">`
  );
  const scripts = [
    ...vendor.scripts.map((f) => `_lib/${f}`),
    '_runtime/modules.js',
    '_runtime/email-colors.js',
    '_runtime/mailspring-view.js',
    'view.js',
    '_runtime/loader.js',
  ].map((src) => `<script src="${src}"></script>`);
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    ...styles,
    '</head><body><div id="root"></div>',
    ...scripts,
    '</body></html>',
  ].join('\n');
}

const transpileCache = new Map<string, { revision: string; output: string }>();

// Must match revisionOf() in internal_packages/views/lib/authoring/drafts.ts. The loader
// reports it back so diagnostics name the revision that produced them.
function revisionOf(source: string) {
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 12);
}

// View.jsx is authored as an ES module with a default-exported component. Sucrase compiles it
// to CommonJS, wrapped so the loader can run it against its own `require` without eval, which
// the CSP forbids. Sucrase preserves line numbers, and the wrapper opens on the first line, so
// a line in a view.js stack trace is the same line in View.jsx; the loader relies on this to
// point error cards at the author's file. The inline source map is for DevTools.
//
// The cache is keyed by a hash of the source rather than its mtime, so a revision written
// twice within the filesystem's timestamp resolution (as an authoring loop does) still
// recompiles, and a revision that comes back is served from cache.
function compiledViewSource(viewFile: string) {
  const { size } = fs.statSync(viewFile);
  if (size > MAX_VIEW_SOURCE_BYTES) {
    return `throw new Error('View.jsx is larger than ${MAX_VIEW_SOURCE_BYTES} bytes.');\n`;
  }
  const source = fs.readFileSync(viewFile, 'utf8');
  const revision = revisionOf(source);
  const cached = transpileCache.get(viewFile);
  if (cached && cached.revision === revision) return cached.output;

  // No newline: the factory must open on line 1 to keep View.jsx's line numbers.
  const header = `window.__mailspringViewRevision = ${JSON.stringify(revision)}; `;
  let output: string;
  try {
    const { transform } = require('sucrase');
    const { code, sourceMap } = transform(source, {
      transforms: ['jsx', 'imports'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'View.jsx',
      sourceMapOptions: { compiledFilename: 'view.js' },
    });
    const map = Buffer.from(
      JSON.stringify({ ...sourceMap, sources: ['View.jsx'], sourcesContent: [source] })
    ).toString('base64');
    output =
      header +
      `window.__mailspringViewFactory = function (require, module, exports) {${code}\n};\n` +
      `//# sourceMappingURL=data:application/json;base64,${map}\n`;
  } catch (err) {
    // A syntax error becomes the View's load error. Sucrase's message names View.jsx and
    // ends with the line and column.
    output = header + `window.__mailspringViewLoadError = ${JSON.stringify(err.message)};\n`;
  }
  transpileCache.set(viewFile, { revision, output });
  return output;
}

// ── Host-served resources ─────────────────────────────────────────────────────
// Email images and attachments reach a View as `mailspring-view://<viewId>/_res/<token>` URLs.
// Tokens are minted here, at the host window's request, for files and image URLs it found in
// a message the View is allowed to read. A View can't mint them, so it can't use the image
// proxy to send requests of its own choosing.

export const REGISTER_RESOURCES_CHANNEL = 'mailspring-view:register-resources';

type ResourceEntry =
  | { kind: 'file'; filePath: string; contentType: string | null }
  | { kind: 'remote'; url: string };

const MAX_RESOURCES_PER_VIEW = 5000;
const MAX_REMOTE_BYTES = 15 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 15 * 1000;

const resourcesByView = new Map<string, Map<string, ResourceEntry>>();

function validResourceEntry(entry: any): ResourceEntry | null {
  if (entry && entry.kind === 'remote' && typeof entry.url === 'string') {
    return isProxyableImageURL(entry.url) ? { kind: 'remote', url: entry.url } : null;
  }
  if (entry && entry.kind === 'file' && typeof entry.filePath === 'string') {
    const filesDir = path.join(global.application.configDirPath, 'files');
    const filePath = containedFile(filesDir, path.relative(filesDir, entry.filePath));
    if (!filePath) return null;
    const contentType = typeof entry.contentType === 'string' ? entry.contentType : null;
    return { kind: 'file', filePath, contentType };
  }
  return null;
}

function registerResources(viewId: string, entries: any[]): (string | null)[] {
  let resources = resourcesByView.get(viewId);
  if (!resources) {
    resources = new Map();
    resourcesByView.set(viewId, resources);
  }
  return entries.map((raw) => {
    const entry = validResourceEntry(raw);
    if (!entry) return null;
    const token = crypto.randomBytes(16).toString('hex');
    resources.set(token, entry);
    // Maps iterate in insertion order, so this drops the oldest token.
    if (resources.size > MAX_RESOURCES_PER_VIEW) {
      resources.delete(resources.keys().next().value);
    }
    return token;
  });
}

/**
 * Registered once at startup by Application, like the other main-process IPC handlers, so that
 * importing this module (mailspring-window.ts does) has no side effects. Both channels are for
 * the host window only: View guests have no ipcRenderer of their own (their preload exposes
 * only the bridge), and are refused here anyway.
 */
export function registerViewSessionIPCHandlers(ipcMain: IpcMain) {
  ipcMain.on(VISIBILITY_CHANNEL, (event, guestId: number, visible: boolean) => {
    if (viewIdForSession(event.sender.session) || event.sender.getType() === 'webview') return;
    if (typeof guestId !== 'number') return;
    if (visible) hiddenGuests.delete(guestId);
    else hiddenGuests.add(guestId);
  });

  ipcMain.handle(REGISTER_RESOURCES_CHANNEL, (event, viewId: string, entries: any[]) => {
    if (viewIdForSession(event.sender.session) || event.sender.getType() === 'webview') {
      throw new Error('Not permitted');
    }
    if (typeof viewId !== 'string' || !viewIdForPartition(`${PARTITION_PREFIX}${viewId}`)) {
      throw new Error('Invalid view id');
    }
    return registerResources(viewId, Array.isArray(entries) ? entries.slice(0, 500) : []);
  });
}

// Remote images are fetched from a session with no cookies or cache shared with anything else,
// so a sender's tracking pixel learns no more than it would from the reading pane.
function imageProxySession() {
  return session.fromPartition('mailspring-view-image-proxy');
}

async function serveResource(viewId: string, token: string): Promise<Response> {
  const entry = resourcesByView.get(viewId)?.get(token);
  if (!entry) return notFound();
  if (entry.kind === 'file') {
    return respond(await fs.promises.readFile(entry.filePath), entry.filePath, {
      'Content-Type': servableResourceType(entry.contentType),
    });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const upstream = await imageProxySession().fetch(entry.url, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'follow',
    } as any);
    const contentType = servableResourceType(upstream.headers.get('content-type'));
    if (!upstream.ok || !contentType.startsWith('image/')) return notFound();
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > MAX_REMOTE_BYTES) return notFound();
    return respond(body, 'image', { 'Content-Type': contentType });
  } catch {
    return notFound();
  } finally {
    clearTimeout(timer);
  }
}

let emailColorsSource: string | null = null;

// <MessageView> decides between a transparent and a white page exactly as the reading pane's
// EmailFrame does, so it runs the same module rather than a copy. It is pure DOM code; in a
// packaged build it has already been compiled to CommonJS.
function emailColorsScript() {
  if (emailColorsSource) return emailColorsSource;
  const base = path.join(
    global.application.resourcePath,
    'internal_packages',
    'message-list',
    'lib',
    'email-color-detection'
  );
  let code: string;
  if (fs.existsSync(`${base}.ts`)) {
    const { transform } = require('sucrase');
    code = transform(fs.readFileSync(`${base}.ts`, 'utf8'), {
      transforms: ['typescript', 'imports'],
    }).code;
  } else {
    code = fs.readFileSync(`${base}.js`, 'utf8');
  }
  emailColorsSource = `(function () {\nvar exports = {};\nvar module = { exports: exports };\n${code}\nwindow.MailspringEmailColors = module.exports;\n})();\n`;
  return emailColorsSource;
}

const grantsCache = new Map<string, { mtimeMs: number; grants: string[] }>();

// Read per request rather than once per session, so editing a manifest's `network` list
// takes effect on the View's next reload instead of the next app launch.
function networkGrantsForView(viewId: string): string[] {
  const bundleDir = bundleDirForView(viewId, viewPaths());
  const manifestFile = bundleDir && containedFile(bundleDir, 'manifest.json');
  if (!manifestFile) return [];
  const { mtimeMs } = fs.statSync(manifestFile);
  const cached = grantsCache.get(manifestFile);
  if (cached && cached.mtimeMs === mtimeMs) return cached.grants;
  let grants: string[] = [];
  try {
    grants = networkGrantsFromManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
  } catch {
    // An unparseable manifest grants nothing.
  }
  grantsCache.set(manifestFile, { mtimeMs, grants });
  return grants;
}

function respond(body: string | Buffer, filePath: string, extraHeaders = {}) {
  const contentType = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

const notFound = () => new Response('Not Found', { status: 404 });

function handleViewRequest(viewId: string, request: Request): Response {
  const url = new URL(request.url);
  if (url.host !== viewId) return notFound();

  const paths = viewPaths();
  const bundleDir = bundleDirForView(viewId, paths);
  if (!bundleDir) return notFound();

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound();
  }
  if (pathname.includes('\0')) return notFound();

  if (pathname === '/' || pathname === '/index.html') {
    return respond(shellHTML(readVendorManifest(paths)), 'index.html');
  }
  if (pathname === '/view.js') {
    const viewFile = containedFile(bundleDir, 'View.jsx');
    return viewFile ? respond(compiledViewSource(viewFile), 'view.js') : notFound();
  }
  if (pathname === '/view.css') {
    const cssFile = containedFile(bundleDir, 'view.css');
    return respond(cssFile ? fs.readFileSync(cssFile) : '', 'view.css');
  }
  if (pathname === '/_runtime/modules.js') {
    const { modules } = readVendorManifest(paths);
    return respond(
      `window.__mailspringViewModuleGlobals = ${JSON.stringify(modules)};\n`,
      'modules.js'
    );
  }
  if (pathname === '/_runtime/email-colors.js') {
    return respond(emailColorsScript(), 'email-colors.js');
  }
  if (pathname.startsWith('/_runtime/')) {
    const file = containedFile(paths.runtimeDir, pathname.substr('/_runtime/'.length));
    return file && !file.endsWith('.preload.js')
      ? respond(fs.readFileSync(file), file)
      : notFound();
  }
  if (pathname.startsWith('/_lib/')) {
    const relative = pathname.substr('/_lib/'.length);
    const file = containedFile(paths.vendorDir, relative);
    return file ? respond(fs.readFileSync(file), file) : notFound();
  }

  const file = containedFile(bundleDir, pathname.substr(1));
  if (!file || path.basename(file) === 'manifest.json' || file.endsWith('.jsx')) {
    return notFound();
  }
  return respond(fs.readFileSync(file), file);
}

// Applied to every response, not just the shell: a View can frame its own files, and a
// same-origin document served without a CSP would be an unrestricted place to run.
function securityHeaders(viewId: string) {
  return {
    'Content-Security-Policy': contentSecurityPolicy(networkGrantsForView(viewId)),
    'X-DNS-Prefetch-Control': 'off',
    'Referrer-Policy': 'no-referrer',
  };
}

function applyProxy(viewId: string, ses: Electron.Session) {
  return ses
    .setProxy(proxyConfig(networkGrantsForView(viewId)))
    .catch((err) => console.error(`View ${viewId}: setProxy failed: ${err}`));
}

function configureViewSession(viewId: string, ses: Electron.Session) {
  if (viewIdsBySession.has(ses)) return;
  viewIdsBySession.set(ses, viewId);

  const { runtimeDir } = viewPaths();
  ses.registerPreloadScript({
    type: 'frame',
    id: 'mailspring-view-bridge',
    filePath: path.join(runtimeDir, 'bridge.preload.js'),
  });

  ses.protocol.handle(VIEW_SCHEME, async (request) => {
    try {
      const { host, pathname } = new URL(request.url);
      if (host !== viewId) return notFound();
      if (pathname === '/' || pathname === '/index.html') {
        // Picks up `network` grant changes when the View reloads.
        await applyProxy(viewId, ses);
      }
      const resource = /^\/_res\/([0-9a-f]{32})$/.exec(pathname);
      const response = resource
        ? await serveResource(viewId, resource[1])
        : handleViewRequest(viewId, request);
      for (const [name, value] of Object.entries(securityHeaders(viewId))) {
        response.headers.set(name, value);
      }
      return response;
    } catch (err) {
      console.error(`View ${viewId}: ${request.url}: ${err}`);
      return new Response('Internal Error', { status: 500 });
    }
  });

  // First line of defense for everything that goes through the network stack, independent
  // of the page's CSP (which the View can't loosen, but which doesn't govern every fetch).
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isRequestAllowed(details.url, viewId, networkGrantsForView(viewId)) });
  });

  // Backstop for traffic webRequest never sees — WebRTC ICE/TURN in particular. Together
  // with the `disable_non_proxied_udp` policy set on each guest, ungranted hosts are only
  // reachable through a proxy that refuses every connection.
  applyProxy(viewId, ses);

  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  ses.on('will-download', (event) => event.preventDefault());
  ses.setSpellCheckerEnabled(false);
}

/**
 * Called from the host window's `will-attach-webview`. Returns false when the webview must
 * not attach: a View partition whose `src` is not that View's own origin.
 */
export function prepareViewWebview(
  webPreferences: Electron.WebPreferences,
  params: Record<string, string>
): boolean {
  const partition = (webPreferences as any).partition || params.partition;
  const isViewSrc = (params.src || '').startsWith(`${VIEW_SCHEME}:`);
  const viewId = viewIdForPartition(partition);

  if (!viewId) {
    // A non-View guest must never load View URLs (it would have no lockdown), and a
    // malformed View partition is refused outright.
    return !isViewSrc && !(partition || '').startsWith(PARTITION_PREFIX);
  }
  if (!params.src || !params.src.startsWith(`${VIEW_SCHEME}://${viewId}/`)) {
    return false;
  }

  configureViewSession(viewId, session.fromPartition(partition));
  Object.assign(webPreferences, {
    navigateOnDragDrop: false,
    enableWebSQL: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    nodeIntegrationInWorker: false,
    plugins: false,
    experimentalFeatures: false,
    // alert()/confirm() would draw native dialogs titled "Mailspring" over the app, which
    // a View could use to impersonate it.
    disableDialogs: true,
    safeDialogs: true,
  });
  return true;
}

/** Called from `did-attach-webview` to pin a View guest to its own origin. */
export function guardViewGuest(contents: Electron.WebContents) {
  const viewId = viewIdForSession(contents.session);
  if (!viewId) return;
  const sameOrigin = (url: string) => isViewOrigin(url, viewId);

  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!sameOrigin(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!sameOrigin(url)) event.preventDefault();
  });
  contents.on('will-frame-navigate', (event) => {
    if (!sameOrigin(event.url)) event.preventDefault();
  });

  watchForHangs(contents);
}

/**
 * The View runs in its own process, so a busy loop can't freeze the app, but it can burn a
 * core indefinitely. Chromium's `unresponsive` event only fires when input is waiting, which
 * a View nobody is touching never has, so poll it instead.
 *
 * Only Views on screen are judged. A hidden guest (a sidebar View before a thread opens, an
 * unselected sidebar panel, a minimized window) is throttled by Chromium and may not answer
 * for a long time without being hung, so the clock stops while it's hidden and restarts when
 * it shows.
 */
function watchForHangs(contents: Electron.WebContents) {
  let pendingSince = 0;
  const guestId = contents.id;
  const isOnScreen = () => {
    const host = contents.hostWebContents;
    const win = host && BrowserWindow.fromWebContents(host);
    return !hiddenGuests.has(guestId) && !!win && win.isVisible() && !win.isMinimized();
  };
  // A heartbeat sent to a page that then navigates or dies never settles, so the clock
  // restarts with each page load and stops while there is no live renderer to ask.
  let alive = true;
  contents.on('did-start-loading', () => {
    pendingSince = 0;
  });
  contents.on('dom-ready', () => {
    alive = true;
    pendingSince = 0;
  });
  contents.on('render-process-gone', () => {
    alive = false;
    pendingSince = 0;
  });
  const timer = setInterval(() => {
    if (contents.isDestroyed()) {
      clearInterval(timer);
      hiddenGuests.delete(guestId);
      return;
    }
    if (!alive || !isOnScreen()) {
      pendingSince = 0;
      return;
    }
    if (pendingSince) {
      if (Date.now() - pendingSince > HEARTBEAT_TIMEOUT_MS) {
        pendingSince = 0;
        const host = contents.hostWebContents;
        if (host && !host.isDestroyed()) host.send(WATCHDOG_KILL_CHANNEL, guestId);
        contents.forcefullyCrashRenderer();
      }
      return;
    }
    const sentAt = Date.now();
    pendingSince = sentAt;
    contents
      .executeJavaScript('0')
      .catch(() => {})
      .then(() => {
        // Only the heartbeat currently being timed may stop the clock.
        if (pendingSince === sentAt) pendingSince = 0;
      });
  }, HEARTBEAT_INTERVAL_MS);
  contents.once('destroyed', () => {
    clearInterval(timer);
    hiddenGuests.delete(guestId);
  });
}
