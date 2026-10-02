// Usage: node --experimental-websocket eval.mjs <eval-js> [screenshot-path] [clickX clickY]
// Evaluates JS in the main Mailspring window (dev app launched with --remote-debugging-port=9333).
// Optionally captures a full-window screenshot, and/or dispatches a real mouse click first.
import fs from 'fs';

const [, , js, shot, clickX, clickY] = process.argv;
let id = 0;
const targets = await (await fetch('http://localhost:9333/json')).json();
let main = null;
for (const t of targets) {
  if (t.type !== 'page') continue;
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cls = await send(ws, 'Runtime.evaluate', {
    expression: 'document.body.className',
    returnByValue: true,
  });
  if (cls.result.value.includes('window-type-default')) {
    main = ws;
    break;
  }
  ws.close();
}
if (!main) throw new Error('no main window');


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

if (clickX && clickY) {
  const x = Number(clickX), y = Number(clickY);
  await send(main, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send(main, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send(main, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 200));
}
if (js) {
  const r = await send(main, 'Runtime.evaluate', {
    expression: js,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(JSON.stringify(r.result.value ?? r.result, null, 1));
}
if (shot) {
  await new Promise((r) => setTimeout(r, 800));
  await send(main, 'Runtime.evaluate', { expression: "document.body.classList.remove('is-blurred')" });
  const r = await send(main, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shot, Buffer.from(r.data, 'base64'));
  console.log('saved', shot);
}
main.close();
