import React, { useState } from 'react';
import { useMessages, MessageView, ui } from '@mailspring/view';

// Exercises <MessageView>: the newest inbox messages, the selected one expanded and the rest
// compact, rendered the way the reading pane renders them.
export default function MessageViewDemo() {
  const { data: messages, loading } = useMessages({ where: { in: 'inbox' }, limit: 6 });
  const [selected, setSelected] = useState(null);
  const current = selected || (messages[0] && messages[0].id);

  return (
    <div className="min-h-screen bg-ms-panel text-ms-text p-6">
      <h1 className="text-xl font-semibold text-ms-heading mb-1">Message View</h1>
      <p className="text-sm text-ms-muted mb-4">
        The standard message frame inside a View.{' '}
        {current && (
          <button
            className="text-ms-link"
            onClick={() => ui.showThread(messages.find((m) => m.id === current).threadId)}
          >
            Open in reading pane
          </button>
        )}
      </p>
      {loading && <p className="text-ms-muted">Loading…</p>}
      <div className="max-w-3xl">
        {messages.map((m) => (
          <div key={m.id} onClick={() => setSelected(m.id)}>
            <MessageView messageId={m.id} compact={m.id !== current} />
          </div>
        ))}
      </div>
    </div>
  );
}
