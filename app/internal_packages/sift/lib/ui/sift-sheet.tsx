import React from 'react';
import { askStore } from '../stores/ask-store';
import type { AskStep } from '../ai/ask';
import { insightStore } from '../stores/insight-store';
import { usageStore } from '../stores/usage-store';
import { threadsByIds } from '../mail/search';
import { currentModel } from '../ai/client';
import { hasApiKey } from '../settings';
import { Markdown } from './markdown';
import { openPreferences, openThread, SparkleIcon, useStores } from './helpers';

const SUGGESTIONS = [
  'What needs my attention today?',
  'Who is waiting on a reply from me?',
  'What did I commit to doing this week?',
  'Are there any suspicious emails I should know about?',
];

/** Tool steps: the latest while working, then one expandable summary line. */
function Steps({ steps, pending }: { steps: AskStep[]; pending: boolean }) {
  if (!steps.length) return null;
  const list = (
    <ul className="sift-steps">
      {steps.map((s) => (
        <li key={s.id} className={s.done ? 'is-done' : 'is-running'}>
          {s.label}
        </li>
      ))}
    </ul>
  );
  if (steps.length <= 3) return list;
  if (pending) {
    const current = [...steps].reverse().find((s) => !s.done) || steps[steps.length - 1];
    return (
      <ul className="sift-steps">
        <li className="is-running">
          {current.label} ({steps.length} lookups so far)
        </li>
      </ul>
    );
  }
  const reads = steps.filter((s) => s.label.startsWith('Read ')).length;
  return (
    <details className="sift-steps-details">
      <summary>
        Checked your mail: {steps.length} lookups{reads ? `, read ${reads} threads` : ''}
      </summary>
      {list}
    </details>
  );
}

function Conversation() {
  useStores(askStore);
  const [input, setInput] = React.useState('');
  const endRef = React.useRef<HTMLDivElement>(null);
  const last = askStore.turns[askStore.turns.length - 1];

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [askStore.turns.length, last?.text.length, last?.steps.length]);

  const submit = (question: string) => {
    if (!question.trim() || askStore.busy) return;
    askStore.ask(question);
    setInput('');
  };

  return (
    <div className="sift-chat">
      <div className="sift-chat-scroll">
        {askStore.turns.length === 0 ? (
          <div className="sift-empty">
            <div className="sift-empty-icon">
              <SparkleIcon size={28} />
            </div>
            <h2>Ask your inbox anything</h2>
            <p>
              Sift searches and reads your mail to answer. It can look but never send, delete or
              move anything.
            </p>
            <div className="sift-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="sift-reply-chip" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          askStore.turns.map((turn) => (
            <div key={turn.id} className={`sift-turn sift-turn-${turn.role}`}>
              {turn.role === 'user' ? (
                <div className="sift-bubble">{turn.text}</div>
              ) : (
                <div className="sift-answer">
                  {turn.kind === 'briefing' && (
                    <div className="sift-answer-label">
                      <SparkleIcon /> Your briefing
                    </div>
                  )}
                  <Steps steps={turn.steps} pending={!!turn.pending} />
                  {turn.text ? (
                    <Markdown text={turn.text} />
                  ) : (
                    turn.pending && <div className="sift-typing">Thinking…</div>
                  )}
                  {turn.error && <div className="sift-error">{turn.error}</div>}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form
        className="sift-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <input
          value={input}
          placeholder="Ask about your mail… (e.g. “what's the latest on the launch?”)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {askStore.busy ? (
          <button type="button" className="btn" onClick={() => askStore.stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn-emphasis" disabled={!input.trim()}>
            Ask
          </button>
        )}
      </form>
    </div>
  );
}

function TodayPanel() {
  useStores(insightStore, usageStore);
  const [subjects, setSubjects] = React.useState<Map<string, string>>(new Map());
  const insights = insightStore.all();
  const urgent = insights.filter((i) => i.priority === 'urgent' || i.priority === 'high');
  const replies = insights.filter((i) => i.needs_reply);
  const suspicious = insights.filter((i) => i.security_warning);
  const todos = insights.flatMap((i) =>
    i.action_items.map((item, idx) => ({
      ...item,
      idx,
      threadId: i.threadId,
      done: (i.done || []).includes(idx),
    }))
  );
  const open = todos.filter((t) => !t.done);
  const idsKey = insights.map((i) => i.threadId).join(',');

  React.useEffect(() => {
    threadsByIds(insights.map((i) => i.threadId)).then((threads) =>
      setSubjects(new Map(threads.map((t: any) => [t.id, t.subject])))
    );
  }, [idsKey]);

  return (
    <div className="sift-today">
      {insightStore.blockedReason && (
        <div className="sift-warning">
          {insightStore.blockedReason} <a onClick={openPreferences}>Open Preferences</a>
        </div>
      )}
      <div className="sift-stats">
        <div className="sift-stat">
          <span className="sift-stat-n">{urgent.length}</span>
          <span>priority</span>
        </div>
        <div className="sift-stat">
          <span className="sift-stat-n">{replies.length}</span>
          <span>need reply</span>
        </div>
        <div className="sift-stat">
          <span className="sift-stat-n">{open.length}</span>
          <span>to-dos</span>
        </div>
        {suspicious.length > 0 && (
          <div className="sift-stat sift-stat-danger">
            <span className="sift-stat-n">{suspicious.length}</span>
            <span>suspicious</span>
          </div>
        )}
      </div>
      <button
        className="btn btn-emphasis sift-brief-btn"
        disabled={askStore.busy}
        onClick={() => askStore.briefing()}
      >
        <SparkleIcon /> Brief me on my inbox
      </button>
      <h4>To-dos from your mail</h4>
      {open.length === 0 ? (
        <p className="sift-muted">Nothing open. Sift adds tasks here as it reads new mail.</p>
      ) : (
        <ul className="sift-todos sift-todos-panel">
          {open.map((t) => (
            <li key={`${t.threadId}-${t.idx}`}>
              <label>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => insightStore.toggleDone(t.threadId, t.idx)}
                />
                <span>
                  {t.text}
                  <a
                    className="sift-thread-link sift-todo-source"
                    onClick={() => openThread(t.threadId)}
                  >
                    {subjects.get(t.threadId) || 'Open thread'}
                  </a>
                </span>
              </label>
              {t.due && <span className="sift-due">{t.due}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="sift-usage">
        {usageStore.requests > 0
          ? `This session: ${usageStore.summary()}`
          : `Model: ${currentModel()}`}
      </div>
    </div>
  );
}

function Setup() {
  return (
    <div className="sift-empty sift-setup">
      <div className="sift-empty-icon">
        <SparkleIcon size={28} />
      </div>
      <h2>Set up Sift</h2>
      <p>
        Sift triages your inbox, briefs you on threads, drafts replies and answers questions about
        your mail, using a model you choose on OpenRouter. Add an OpenRouter API key to start. Until
        you do, nothing is sent anywhere.
      </p>
      <button className="btn btn-emphasis" onClick={openPreferences}>
        Add an API key
      </button>
    </div>
  );
}

export function SiftSheet() {
  useStores(askStore, insightStore);
  return (
    <div className="sift-sheet">
      <header className="sift-sheet-header">
        <h1>
          <SparkleIcon size={20} /> Sift
        </h1>
        <span style={{ flex: 1 }} />
        {askStore.turns.length > 0 && (
          <button className="btn" onClick={() => askStore.reset()}>
            New conversation
          </button>
        )}
        <button className="btn" onClick={openPreferences}>
          Settings
        </button>
      </header>
      <div className="sift-sheet-body">
        {hasApiKey() ? (
          <>
            <Conversation />
            <TodayPanel />
          </>
        ) : (
          <Setup />
        )}
      </div>
    </div>
  );
}
SiftSheet.displayName = 'SiftSheet';
