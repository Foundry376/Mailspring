import { shell } from 'electron';

// `shell.openExternal` rejects with an OS-level error (eg. "Failed to open:
// No application is associated with the specified file..." / MK_E_UNAVAILABLE
// on Windows) when there's no application registered to handle the URL. That
// error has a message but no JS stack (it's constructed in native code), so
// when a caller doesn't add its own `.catch`, it surfaces as an unhandled
// promise rejection that Sentry reports with no stacktrace and no way to
// tell which of our many `shell.openExternal` call sites, or what URL, was
// involved (see MAILSPRING-CLIENT-6E, MAILSPRING-CLIENT-FS).
//
// We capture the caller's stack synchronously (before the async native call
// runs). The rejected error's own `.stack` property isn't always writable
// (mutating it silently no-ops on some builds, which is exactly why
// MAILSPRING-CLIENT-FS still had no stacktrace after our first attempt at
// this fix only mutated the original error in place), so instead we throw a
// brand-new Error we fully control, with the target URL folded into the
// message and the caller's frames as its stack. Sentry's ingestion also
// drops the stacktrace entirely from events whose frames don't parse, so a
// guaranteed-well-formed stack is the only way to make these actionable.
const originalOpenExternal = shell.openExternal.bind(shell);
shell.openExternal = (url: string, options?: Electron.OpenExternalOptions) => {
  const callSite: { stack?: string } = {};
  Error.captureStackTrace(callSite, shell.openExternal);

  return originalOpenExternal(url, options).catch((err: Error) => {
    if (err.stack) {
      // Already has a real stack (eg. thrown by our own code) — leave it be.
      throw err;
    }
    const name = err.name || 'Error';
    const message = `${err.message} (url: ${url})`;
    const frames = (callSite.stack || '').split('\n').slice(1).join('\n');
    const wrapped = new Error(message);
    wrapped.name = name;
    wrapped.stack = `${name}: ${message}\n${frames}`;
    // Re-throw: existing `.catch` handlers (eg. the link-open error dialog)
    // already report this; the global unhandled-rejection handler
    // logs/reports anything nobody else catches, now with a stack and URL.
    throw wrapped;
  });
};

// `shell.openPath` resolves (rather than rejects) with a string containing
// the error message when it fails, so it can't produce an unhandled
// rejection. Callers that don't check the resolved value (most of them)
// currently fail completely silently; log it so failures are at least
// visible in the console/log file.
const originalOpenPath = shell.openPath.bind(shell);
shell.openPath = (path: string) => {
  return originalOpenPath(path).then((result) => {
    if (result) {
      console.error(`shell.openPath could not open "${path}": ${result}`);
    }
    return result;
  });
};
