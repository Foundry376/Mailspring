import React from 'react';
import { Users, MessagesSquare } from 'lucide-react';
import { useSelectedThread } from '@mailspring/view';

export default function ThreadFacts() {
  const selected = useSelectedThread();
  if (!selected) return null;

  const { thread, messages } = selected;
  return (
    <div className="p-3 text-sm text-ms-text space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ms-muted">
        <MessagesSquare size={14} /> {messages.length}{' '}
        {messages.length === 1 ? 'message' : 'messages'}
      </div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ms-muted">
        <Users size={14} /> {thread.participants.length} participants
      </div>
      <ul className="space-y-1">
        {thread.participants.map((p) => (
          <li key={p.email} className="truncate">
            <span>{p.name || p.email}</span>
            {p.name && <span className="text-ms-muted"> {p.email}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
