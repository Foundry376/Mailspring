import React from 'react';
import { Actions } from 'mailspring-exports';
import type { DraftEditingSession } from 'mailspring-exports';
import { draftPlainText, generateIntoSession } from '../mail/composer';
import { generationStore } from '../stores/generation-store';
import { hasApiKey } from '../settings';
import { SparkleIcon, useStores } from './helpers';

const REWRITES = [
  { label: 'Shorter', instruction: 'Make it shorter and tighter. Keep every fact.' },
  { label: 'Friendlier', instruction: 'Make it warmer and friendlier without adding fluff.' },
  { label: 'More formal', instruction: 'Make it more formal and polished.' },
  {
    label: 'Fix grammar',
    instruction: 'Fix spelling, grammar and punctuation only. Change nothing else.',
  },
  { label: 'More direct', instruction: 'Make it more direct: lead with the ask or the answer.' },
];

function ComposerAIPopover({
  session,
  isReply,
}: {
  session: DraftEditingSession;
  isReply: boolean;
}) {
  const [instruction, setInstruction] = React.useState('');
  const hasText = draftPlainText(session).length > 0;

  const start = (req: Parameters<typeof generateIntoSession>[1]) => {
    Actions.closePopover();
    generationStore.run(session.headerMessageId, req.mode, (signal) =>
      generateIntoSession(session, req, { signal })
    );
  };

  const onWrite = (e?: React.FormEvent) => {
    e?.preventDefault();
    start({ mode: isReply ? 'reply' : 'compose', instruction: instruction.trim() });
  };

  return (
    <div className="sift-composer-popover">
      <form onSubmit={onWrite}>
        <div className="sift-popover-title">
          <SparkleIcon /> {isReply ? 'Write a reply with Sift' : 'Write with Sift'}
        </div>
        <textarea
          autoFocus
          rows={3}
          value={instruction}
          placeholder={
            hasText
              ? 'Optional: what to add or change. Your notes in the draft will be used.'
              : isReply
                ? 'e.g. "Yes to Thursday 3pm, ask them to send the agenda"'
                : 'e.g. "Ask Dana for a call tomorrow to review the incident report"'
          }
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onWrite();
          }}
        />
        <div className="sift-popover-actions">
          <span className="sift-hint">⌘↵ to write</span>
          <button
            type="submit"
            className="btn btn-emphasis"
            disabled={!instruction.trim() && !hasText && !isReply}
          >
            {hasText ? 'Write from my notes' : 'Write'}
          </button>
        </div>
      </form>
      {hasText && (
        <div className="sift-rewrites">
          <div className="sift-popover-subtitle">Rewrite the draft</div>
          {REWRITES.map((r) => (
            <button
              key={r.label}
              className="sift-reply-chip"
              onClick={() => start({ mode: 'rewrite', instruction: r.instruction })}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComposerAIButtonInner({ session, draft }: { session: DraftEditingSession; draft: any }) {
  useStores(generationStore);
  const ref = React.useRef<HTMLButtonElement>(null);
  const id = session.headerMessageId;
  const busy = generationStore.isRunning(id);
  const error = generationStore.errorFor(id);
  const isReply = !!(draft.replyToHeaderMessageId || draft.threadId);

  const onClick = () => {
    if (busy) {
      generationStore.stop(id);
      return;
    }
    if (!ref.current) return;
    Actions.openPopover(<ComposerAIPopover session={session} isReply={isReply} />, {
      originRect: ref.current.getBoundingClientRect(),
      direction: 'up',
    });
  };

  if (draft.plaintext || !hasApiKey()) return <span />;
  return (
    <button
      ref={ref}
      tabIndex={-1}
      className={`btn btn-toolbar sift-composer-btn${busy ? ' is-busy' : ''}${error ? ' has-error' : ''}`}
      title={busy ? 'Stop writing' : error || 'Write or rewrite with Sift'}
      onClick={onClick}
    >
      <SparkleIcon size={15} />
      <span>{busy ? 'Writing… (stop)' : 'Sift'}</span>
    </button>
  );
}

// The draft changes on every keystroke; the button only needs the session.
export const ComposerAIButton = React.memo(
  ComposerAIButtonInner,
  (prev, next) =>
    prev.session === next.session &&
    prev.draft.plaintext === next.draft.plaintext &&
    prev.draft.threadId === next.draft.threadId
);
(ComposerAIButton as any).displayName = 'SiftComposerButton';
