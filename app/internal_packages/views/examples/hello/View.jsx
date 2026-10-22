import React from 'react';
import { Mail, Star } from 'lucide-react';
import { useThreads, ui } from '@mailspring/view';

function formatDate(iso) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function HelloView() {
  const { data: threads, loading, error } = useThreads({ where: { in: 'inbox' }, limit: 20 });

  return (
    <div className="min-h-screen bg-ms-bg text-ms-text">
      <div className="p-6 max-w-3xl">
        <h1 className="text-xl font-semibold mb-1 flex items-center gap-2 text-ms-heading">
          <Mail size={20} className="text-ms-accent" /> Hello, View
        </h1>
        <p className="text-sm text-ms-muted mb-4">
          The 20 most recent inbox threads, live from the bridge.
        </p>
        {error && <p className="text-ms-danger">{error.message}</p>}
        {loading && <p className="text-ms-muted">Loading…</p>}
        <ul className="divide-y divide-ms-border">
          {threads.map((t) => (
            <li
              key={t.id}
              onClick={() => ui.showThread(t.id)}
              className="py-2 px-2 -mx-2 rounded cursor-pointer hover:bg-ms-panel flex gap-3 items-baseline"
            >
              <span className={`truncate w-40 shrink-0 ${t.unread ? 'font-semibold' : ''}`}>
                {t.participants.map((p) => p.name || p.email).join(', ')}
              </span>
              <span className="truncate flex-1">
                {t.starred && <Star size={12} className="inline mr-1 text-ms-warning" />}
                <span className={t.unread ? 'font-semibold' : ''}>{t.subject}</span>
                <span className="text-ms-muted"> — {t.snippet}</span>
              </span>
              <span className="text-xs text-ms-muted shrink-0">{formatDate(t.lastReceivedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
