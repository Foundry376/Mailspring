#!/usr/bin/env node
const { spawn } = require('child_process');
const electron = require('electron');

// Pinned so the suite doesn't run in whatever zone the machine happens to be in. CI has no TZ
// of its own, i.e. UTC, where a local date component read is indistinguishable from a UTC one —
// so the calendar's zone handling would go unverified there. Set as a default rather than an
// override, so `TZ=America/Santiago npm test` still works for chasing a zone-specific bug.
const DEFAULT_TZ = 'America/Chicago';

const child = spawn(electron, ['./app', '--enable-logging', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: Object.assign({ TZ: DEFAULT_TZ }, process.env),
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code);
  }
});
