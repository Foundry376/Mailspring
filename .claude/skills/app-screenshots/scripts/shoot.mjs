// Usage: node --experimental-websocket shoot.mjs <setup-js> <selector> <out.png> [pad] [maxHeight]
// Runs setup JS in the main Mailspring window, then captures the element matching selector to out.png
// (device pixels, so 2x on retina). pad adds CSS px around the element; maxHeight clips tall elements.
import fs from 'fs';

const [, , setup, selector, out, padArg, maxHeightArg] = process.argv;
const pad = Number(padArg || 0);
let id = 0;
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = ++id;
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === myId) {
        ws.removeEventListener('message', onMsg);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
const targets = await (await fetch('http://localhost:9333/json')).json();
let main = null;
for (const t of targets) {
  if (t.type !== 'page') continue;
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cls = await send(ws, 'Runtime.evaluate', { expression: 'document.body.className', returnByValue: true });
  if (cls.result.value.includes('window-type-default')) { main = ws; break; }
  ws.close();
}
if (!main) throw new Error('no main window');

if (setup) {
  const r = await send(main, 'Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) console.error(JSON.stringify(r.exceptionDetails));
}
await send(main, 'Runtime.evaluate', { expression: "document.body.classList.remove('is-blurred')" });
await new Promise((r) => setTimeout(r, 400));
const rect = await send(main, 'Runtime.evaluate', {
  expression: `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`,
  returnByValue: true,
});
let [x, y, w, h] = rect.result.value;
if (maxHeightArg) h = Math.min(h, Number(maxHeightArg));
const shot = await send(main, 'Page.captureScreenshot', {
  format: 'png',
  clip: { x: x - pad, y: y - pad, width: w + pad * 2, height: h + pad * 2, scale: 1 },
});
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out, Math.round(w + pad * 2), 'x', Math.round(h + pad * 2));
main.close();
