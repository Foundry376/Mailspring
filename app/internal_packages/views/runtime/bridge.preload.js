// Bridge preload for Sandboxed Views. Registered on View sessions by
// app/src/browser/view-sessions.ts and run in a sandboxed, context-isolated renderer.
//
// It is plumbing only: it forwards calls to the host over sendToHost and relays replies and
// events back. All validation and authorization happen in the host
// (app/internal_packages/views/lib/view-bridge.ts), so nothing here can grant privilege.
const { contextBridge, ipcRenderer } = require('electron');

const CALL_CHANNEL = 'mailspring-view:call';
const REPLY_CHANNEL = 'mailspring-view:reply';
const EVENT_CHANNEL = 'mailspring-view:event';

let nextCallId = 1;
const pendingCalls = new Map();
const listeners = new Map();

ipcRenderer.on(REPLY_CHANNEL, (_event, { id, result, error }) => {
  const resolve = pendingCalls.get(id);
  if (!resolve) return;
  pendingCalls.delete(id);
  resolve(error ? { error } : { result });
});

ipcRenderer.on(EVENT_CHANNEL, (_event, { event, payload }) => {
  for (const callback of listeners.get(event) || []) {
    callback(payload);
  }
});

// `call` resolves to an envelope rather than rejecting, because contextBridge drops every
// property of a rejected Error except its message. The runtime unwraps it.
contextBridge.exposeInMainWorld('mailspring', {
  call(method, params) {
    const id = nextCallId++;
    return new Promise((resolve) => {
      pendingCalls.set(id, resolve);
      ipcRenderer.sendToHost(CALL_CHANNEL, { id, method, params });
    });
  },
  on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event).delete(callback);
  },
});
