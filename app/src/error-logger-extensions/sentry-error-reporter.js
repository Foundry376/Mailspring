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

// V8 stack frames look like:
//   "    at fnName (/path/to/file.js:12:34)"
//   "    at /path/to/file.js:12:34"
// Sentry expects frames oldest-first; V8 produces newest-first, so reverse.
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
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes('node_modules'),
    });
  }
  return frames.reverse();
}

function buildEvent({ err, extra, deviceHash, release, tags }) {
  const message = (err && err.message) || (typeof err === 'string' ? err : 'Unknown error');
  const name = (err && err.name) || 'Error';
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
    exception: {
      values: [
        {
          type: name,
          value: String(message),
          stacktrace: { frames: parseStack(err && err.stack) },
        },
      ],
    },
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
  req.on('error', (e) => {
    console.log(`Sentry: ${e.message}`);
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
            this.deviceHash = crypto.createHash('sha256').update(macAddress).digest('hex');
          }
        });
      } catch (err) {
        console.error(err);
      }
    }
  }

  getVersion() {
    return process.type === 'renderer' ? AppEnv.getVersion() : require('electron').app.getVersion();
  }

  reportError(err, extra) {
    if (this.inSpecMode || this.inDevMode) {
      return;
    }

    const release = this.getVersion();
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
