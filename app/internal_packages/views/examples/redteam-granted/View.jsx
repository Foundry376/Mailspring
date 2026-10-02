import React, { useEffect, useState } from 'react';

// Companion to examples/redteam: this View's manifest grants `api.github.com` and the
// unusable grants `127.0.0.1`, `localhost` and `*.test`. Only the first should be reachable,
// and only over HTTPS on the default port.

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url, init) {
  const result = await Promise.race([
    fetch(url, init).then(
      (r) => `reached (${r.status})`,
      (e) => `blocked (${e.message})`
    ),
    WAIT(5000).then(() => 'blocked (timeout)'),
  ]);
  return result;
}

const CASES = [
  ['granted host, https', 'https://api.github.com/zen', 'reached'],
  ['granted host, http', 'http://api.github.com/zen', 'blocked'],
  ['granted host, non-default port', 'https://api.github.com:8443/zen', 'blocked'],
  ['granted host, credentials in URL', 'https://user:pass@api.github.com/zen', 'blocked'],
  ['suffix lookalike', 'https://api.github.com.example.com/', 'blocked'],
  ['subdomain of granted host', 'https://x.api.github.com/', 'blocked'],
  ['ungranted host', 'https://example.com/', 'blocked'],
  ['loopback (grant ignored)', 'http://127.0.0.1:47123/granted-loopback', 'blocked'],
  ['localhost (grant ignored)', 'https://localhost:47123/granted-localhost', 'blocked'],
  ['*.test (grant ignored)', 'https://exfil.attacker.test/', 'blocked'],
];

export default function RedTeamGranted() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    (async () => {
      const out = [];
      for (const [name, url, expected] of CASES) {
        const observed = await probe(url);
        out.push({ name, url, expected, observed, pass: observed.startsWith(expected) });
        setRows([...out]);
      }
      // A granted View still must not get UDP: the PAC script only sends granted hosts DIRECT.
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:127.0.0.1:47124' }],
      });
      const candidates = [];
      pc.onicecandidate = (e) =>
        e.candidate && candidates.push(e.candidate.candidate.split(' ').slice(4, 8).join(' '));
      pc.createDataChannel('x');
      await pc.setLocalDescription(await pc.createOffer());
      await WAIT(4000);
      pc.close();
      const reflexive = candidates.filter((c) => /srflx|relay|host/.test(c));
      out.push({
        name: 'WebRTC candidates',
        url: '',
        expected: 'none',
        observed: reflexive.join(' | ') || 'none',
        pass: reflexive.length === 0,
      });
      setRows([...out]);
      window.__redteamResults = out;
    })();
  }, []);
  return (
    <div className="p-4 text-xs">
      <h1 className="text-lg font-semibold mb-2">Network grant red team</h1>
      <table className="w-full table-fixed">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-gray-200 align-top">
              <td className="py-1 pr-2">{r.name}</td>
              <td className={`py-1 pr-2 ${r.pass ? 'text-green-700' : 'text-red-600 font-bold'}`}>
                {r.pass ? 'pass' : 'FAIL'}
              </td>
              <td className="py-1 break-all text-gray-600">{r.observed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
