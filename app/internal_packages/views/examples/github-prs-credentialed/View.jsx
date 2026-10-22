import React, { useEffect, useState } from 'react';
import { GitPullRequest, Eye, RefreshCw, KeyRound } from 'lucide-react';
import { credentialFetch, useCredentialStatus, ui } from '@mailspring/view';

// Lists the user's open pull requests and review requests from GitHub's API. The token never
// reaches this View: credentialFetch asks Mailspring to send the request with it attached.

const SEARCHES = [
  { key: 'review', title: 'Waiting for your review', icon: Eye, q: 'is:open is:pr review-requested:@me archived:false' },
  { key: 'mine', title: 'Your open pull requests', icon: GitPullRequest, q: 'is:open is:pr author:@me archived:false' },
];

async function search(q) {
  const url = `https://api.github.com/search/issues?per_page=30&sort=updated&q=${encodeURIComponent(q)}`;
  const res = await credentialFetch('github', url, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub returned ${res.status}`);
  }
  return (await res.json()).items || [];
}

const repoOf = (item) => item.repository_url.split('/').slice(-2).join('/');

function Section({ title, icon: Icon, items }) {
  return (
    <section className="mb-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ms-heading mb-2">
        <Icon size={16} /> {title} <span className="text-ms-muted font-normal">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-ms-muted">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-ms-border rounded-lg border border-ms-border bg-ms-panel">
          {items.map((item) => (
            <li
              key={item.id}
              className="px-4 py-2 cursor-pointer hover:bg-ms-bg"
              onClick={() => ui.openExternal(item.html_url)}
            >
              <div className="text-sm text-ms-text">{item.title}</div>
              <div className="text-xs text-ms-muted">
                {repoOf(item)} #{item.number} · {item.user.login} · updated{' '}
                {new Date(item.updated_at).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function View() {
  const github = useCredentialStatus('github');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!github.connected) return;
    setError(null);
    Promise.all(SEARCHES.map((s) => search(s.q)))
      .then((lists) => setResults(lists))
      .catch((err) => setError(err.message));
  }, [github.connected, nonce]);

  if (github.loading) return null;

  if (!github.connected) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <KeyRound size={28} className="text-ms-muted" />
        <h1 className="text-lg font-semibold text-ms-heading">Connect GitHub</h1>
        <p className="text-sm text-ms-muted max-w-sm">
          This view reads your pull requests from GitHub's API. Mailspring keeps your token in
          your system keychain; the view never sees it.
        </p>
        <button className="px-4 py-1.5 rounded-md bg-ms-accent text-white text-sm" onClick={github.connect}>
          Connect GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ms-heading">Pull requests</h1>
        <button className="text-ms-muted hover:text-ms-text" onClick={() => setNonce((n) => n + 1)} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>
      {error && (
        <div className="mb-4 rounded-md border border-ms-danger px-3 py-2 text-sm text-ms-danger">
          {error}{' '}
          <button className="underline" onClick={github.connect}>
            Replace token
          </button>
        </div>
      )}
      {!results && !error && <p className="text-sm text-ms-muted">Loading…</p>}
      {results && SEARCHES.map((s, i) => <Section key={s.key} title={s.title} icon={s.icon} items={results[i]} />)}
    </div>
  );
}
