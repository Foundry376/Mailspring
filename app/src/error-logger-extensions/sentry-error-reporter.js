/* eslint global-require: 0 */
const { getMac } = require('getmac');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

const DSN = 'https://2c54d9a7349ab0fa781878a84744f7fc@o70907.ingest.us.sentry.io/4508712413233152';

function parseDSN(dsn) {
  const u = new URL(dsn);
  return {
    publicKey: u.username,
    host: u.host,
    projectId: u.pathname.replace(/^\//, ''),
  };
}

function makeEventId() {
  return crypto.randomBytes(16).toString('hex');
}

// Filenames Sentry should not classify as "in_app": Node internals,
// chrome-extension URLs, anonymous/eval pseudo-files, and anything that
// isn't an absolute path. Mirrors what raven-node did in utils.js.
function isInApp(filename) {
  if (!filename) return false;
  if (filename.startsWith('node:')) return false;
  if (filename.startsWith('chrome-extension://')) return false;
  if (filename === '<anonymous>') return false;
  if (filename.startsWith('[')) return false;
  if (filename.includes('node_modules')) return false;
  const isAbsolute = filename.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filename);
  return isAbsolute;
}

// V8 stack frames look like:
//   "    at fnName (/path/to/file.js:12:34)"
//   "    at /path/to/file.js:12:34"
// Sentry expects frames oldest-first; V8 produces newest-first, so reverse.

// In packaged builds, frames contain absolute paths like:
//   /Applications/Mailspring.app/Contents/Resources/app.asar/src/foo.js
// Normalize to app:///src/foo.js so Sentry matches uploaded source map artifacts.
function normalizeFilename(filename) {
  const asarIdx = filename.indexOf('.asar/');
  if (asarIdx !== -1) {
    return 'app:///' + filename.slice(asarIdx + 6);
  }
  return filename;
}

function parseStack(stack) {
  if (!stack || typeof stack !== 'string') return [];
  const frames = [];
  for (const line of stack.split('\n').slice(1)) {
    let m = line.match(/^\s*at (.+?) \((.+?):(\d+):(\d+)\)\s*$/);
    if (!m) m = line.match(/^\s*at ()(.+?):(\d+):(\d+)\s*$/);
    if (!m) continue;
    const filename = m[2];
    frames.push({
      function: m[1] || '?',
      filename: normalizeFilename(filename),
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: isInApp(filename),
    });
  }
  return frames.reverse();
}

function buildEvent({ err, extra, deviceHash, release, tags }) {
  const message = err.message || 'Unknown error';
  const name = err.name || 'Error';
  const frames = parseStack(err.stack);
  // Sentry's Relay rejects events whose stacktrace.frames is empty
  // (it's marked nonempty in the schema), so omit stacktrace entirely
  // when we couldn't parse any frames.
  const exceptionValue = { type: name, value: String(message) };
  if (frames.length > 0) {
    exceptionValue.stacktrace = { frames };
  }
  return {
    event_id: makeEventId(),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    release,
    server_name: deviceHash,
    tags,
    user: { id: deviceHash },
    extra: extra || {},
    exception: { values: [exceptionValue] },
  };
}

function sendEnvelope(event, release) {
  const { publicKey, host, projectId } = parseDSN(DSN);
  const envelopeHeader = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
    dsn: DSN,
  });
  const itemHeader = JSON.stringify({ type: 'event' });
  const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`;

  const req = https.request({
    method: 'POST',
    host,
    path: `/api/${projectId}/envelope/`,
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'Content-Length': Buffer.byteLength(body),
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=mailspring/${release}`,
    },
  });
  req.on('error', e => {
    console.log(`Sentry: ${e.message}`);
  });
  req.on('response', res => {
    // Drain the response so the socket can be released back to the agent
    // and the event loop doesn't stay alive past app quit.
    res.on('data', () => {});
    res.on('end', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.log(`Sentry: ${res.statusCode} - ${res.statusMessage}`);
      }
    });
  });
  req.setTimeout(5000, () => {
    req.destroy(new Error('Sentry request timed out'));
  });
  req.end(body);
}

module.exports = class SentryErrorReporter {
  constructor({ inSpecMode, inDevMode, resourcePath }) {
    this.inSpecMode = inSpecMode;
    this.inDevMode = inDevMode;
    this.resourcePath = resourcePath;
    this.deviceHash = 'Unknown Device Hash';

    if (!this.inSpecMode) {
      try {
        getMac((err, macAddress) => {
          if (!err && macAddress) {
            this.deviceHash = crypto
              .createHash('sha256')
              .update(macAddress)
              .digest('hex');
          }
        });
      } catch (err) {
        console.error(err);
      }
    }
  }

  getRelease() {
    // Use version-commitHash so Sentry releases match uploaded source map artifacts.
    // commitHash is written into package.json by the build pipeline.
    const pkg = require('../../package.json');
    const version =
      process.type === 'renderer' ? AppEnv.getVersion() : require('electron').app.getVersion();
    return `${version}-${pkg.commitHash}`;
  }

  reportError(err, extra) {
    if (this.inSpecMode || this.inDevMode) {
      return;
    }

    // Coerce non-Error inputs into a real Error so V8 captures a stack.
    // Otherwise our stack-frames array would be empty and Sentry's Relay
    // rejects the event. Matches raven 2.1.2's captureException behavior.
    if (!(err instanceof Error)) {
      const message =
        err && err.message ? err.message : typeof err === 'string' ? err : 'Unknown error';
      err = new Error(message);
    }

    const release = this.getRelease();
    const event = buildEvent({
      err,
      extra,
      deviceHash: this.deviceHash,
      release,
      tags: {
        platform: process.platform,
        version: release,
      },
    });

    try {
      sendEnvelope(event, release);
    } catch (e) {
      console.log(`Sentry: ${e.message}`);
    }
  }
};
