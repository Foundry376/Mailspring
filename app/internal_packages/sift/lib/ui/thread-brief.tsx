import React from 'react';
import { insightStore } from '../stores/insight-store';
import { replyWithAI } from '../mail/composer';
import { generationStore } from '../stores/generation-store';
import { hasApiKey } from '../settings';
import { openPreferences, PRIORITY_LABEL, SparkleIcon, useStores } from './helpers';

/**
 * The Sift card above the messages of an open thread (`MessageListHeaders`):
 * a short brief, the user's to-dos from the thread, phishing warnings, and
 * one-click AI replies that stream into an inline reply.
 */
export function ThreadBrief({ thread, messages }: { thread: any; messages: any[] }) {
  useStores(insightStore, generationStore);
  const [custom, setCustom] = React.useState('');
  const [showCustom, setShowCustom] = React.useState(false);
  const genKey = `thread:${thread?.id}`;
  const drafting = generationStore.labelFor(genKey);
  const draftError = generationStore.errorFor(genKey);

  React.useEffect(() => {
    if (thread) insightStore.ensure(thread);
    setShowCustom(false);
  }, [thread?.id, thread?.lastMessageReceivedTimestamp?.valueOf()]);

  if (!thread || !hasApiKey()) return null;
  const insight = insightStore.get(thread.id);
  const status = insightStore.statusFor(thread.id);
  const error = insightStore.errorFor(thread.id);

  const onReply = (instruction: string) => {
    if (drafting) return;
    setCustom('');
    setShowCustom(false);
    generationStore.run(genKey, instruction, (signal) =>
      replyWithAI(thread, messages, instruction, signal)
    );
  };

  if (!insight) {
    if (insightStore.blockedReason) {
      return (
        <div className="sift-brief sift-brief-muted">
          <SparkleIcon /> <span>{insightStore.blockedReason}</span>
          <button className="btn btn-small" onClick={openPreferences}>
            Open Preferences
          </button>
        </div>
      );
    }
    if (status === 'skipped') return null;
    if (status === 'error') {
      return (
        <div className="sift-brief sift-brief-muted">
          <SparkleIcon /> <span>Sift couldn't read this thread: {error}</span>
          <button className="btn btn-small" onClick={() => insightStore.refresh(thread.id)}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="sift-brief sift-brief-loading">
        <SparkleIcon /> <span>Sift is reading this thread…</span>
      </div>
    );
  }

  const done = new Set(insight.done || []);
  const stale = status === 'queued' || status === 'running';

  return (
    <div className={`sift-brief priority-${insight.priority}${stale ? ' is-stale' : ''}`}>
      <div className="sift-brief-header">
        <span className="sift-brand">
          <SparkleIcon /> Sift
        </span>
        {insight.priority !== 'normal' && (
          <span className={`sift-chip sift-chip-${insight.priority}`}>
            {PRIORITY_LABEL[insight.priority]}
          </span>
        )}
        {insight.needs_reply && !insight.security_warning && (
          <span className="sift-chip sift-chip-reply">Needs your reply</span>
        )}
        <span className="sift-chip sift-chip-quiet">{insight.category}</span>
        <span style={{ flex: 1 }} />
        <button
          className="sift-icon-btn"
          title={stale ? 'Updating…' : 'Re-read this thread'}
          disabled={stale}
          onClick={() => insightStore.refresh(thread.id)}
        >
          {stale ? '…' : '↻'}
        </button>
      </div>

      {insight.security_warning && (
        <div className="sift-warning">
          <strong>Be careful:</strong> {insight.security_warning}
        </div>
      )}

      <div className="sift-brief-text">{insight.brief}</div>

      {insight.action_items.length > 0 && (
        <ul className="sift-todos">
          {insight.action_items.map((item, i) => (
            <li key={i} className={done.has(i) ? 'is-done' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={done.has(i)}
                  onChange={() => insightStore.toggleDone(thread.id, i)}
                />
                <span>{item.text}</span>
              </label>
              {item.due && <span className="sift-due">{item.due}</span>}
            </li>
          ))}
        </ul>
      )}

      {!insight.security_warning &&
        (insight.needs_reply || insight.suggested_replies.length > 0) && (
          <div className="sift-replies">
            {insight.suggested_replies.map((r) => (
              <button
                key={r}
                className={`sift-reply-chip${drafting === r ? ' is-busy' : ''}`}
                disabled={!!drafting}
                onClick={() => onReply(r)}
              >
                {drafting === r ? 'Drafting…' : r}
              </button>
            ))}
            {showCustom ? (
              <form
                className="sift-custom-reply"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (custom.trim()) onReply(custom.trim());
                }}
              >
                <input
                  autoFocus
                  value={custom}
                  placeholder="Tell Sift what to say…"
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  disabled={!!drafting}
                />
              </form>
            ) : (
              <button
                className="sift-reply-chip sift-reply-custom"
                disabled={!!drafting}
                onClick={() => setShowCustom(true)}
              >
                ✎ Write a reply…
              </button>
            )}
          </div>
        )}
      {draftError && <div className="sift-error">{draftError}</div>}
    </div>
  );
}
ThreadBrief.displayName = 'SiftThreadBrief';
