const path = require('path');

let worker;
let nextId = 0;
const pending = new Map();

// A Node worker keeps WASM startup and linting off the renderer's event loop and
// out of its document CSP. The worker only loads bundled code and an inline WASM binary.
function requestFromHarper(request) {
  if (!worker) {
    // Electron renderers do not provide Node's worker platform. Construct the
    // worker in the main process via the app's existing remote bridge.
    const { Worker } =
      process.type === 'renderer'
        ? require('@electron/remote').require('worker_threads')
        : require('worker_threads');
    const current = new Worker(path.join(__dirname, 'harper-worker.js'));
    worker = current;
    worker.on('message', ({ id, result, error }) => {
      const callback = pending.get(id);
      if (!callback) return;
      pending.delete(id);
      if (error) callback.reject(new Error(error));
      else callback.resolve(result);
      if (pending.size === 0 && worker === current) current.unref();
    });
    const fail = (error) => {
      if (worker !== current) return;
      worker = null;
      for (const callback of pending.values()) callback.reject(error);
      pending.clear();
    };
    worker.once('error', fail);
    worker.once('exit', (code) => {
      fail(new Error(`Harper worker exited (${code})`));
    });
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.ref();
    worker.postMessage({ id, ...request });
  });
}

exports.checkWithHarper = requestFromHarper;
exports.harperRuleCatalog = () => requestFromHarper({ type: 'catalog' });

exports.stopHarper = function () {
  const current = worker;
  worker = null;
  for (const callback of pending.values()) callback.reject(new Error('Harper stopped'));
  pending.clear();
  if (current) {
    current.removeAllListeners();
    void current.terminate();
  }
};

if (process.type === 'renderer') window.addEventListener('beforeunload', exports.stopHarper);
