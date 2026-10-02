import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  CheckCircle2,
  Plus,
  Search,
  X,
  Paperclip,
  MessageSquareReply,
  KanbanSquare,
} from 'lucide-react';
import { useThreads, useViewState, setMetadata, ui } from '@mailspring/view';

const COLUMNS = [
  { id: 'todo', title: 'To do', icon: Circle },
  { id: 'waiting', title: 'Waiting', icon: Clock },
  { id: 'done', title: 'Done', icon: CheckCircle2 },
];
const COLUMN_IDS = COLUMNS.map((c) => c.id);

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function people(thread) {
  const others = thread.participants.filter((p) => !p.isMe);
  const list = others.length ? others : thread.participants;
  return list.map((p) => p.name || p.email).join(', ');
}

function latest(thread) {
  return [thread.lastReceivedAt, thread.lastSentAt, thread.firstMessageAt]
    .filter(Boolean)
    .sort()
    .pop();
}

function moveTo(thread, column) {
  return setMetadata(thread, {
    ...(thread.meta || {}),
    column,
    movedAt: new Date().toISOString(),
  });
}

function Card({ thread, onDragStart, dragging }) {
  const column = thread.meta.column;
  const index = COLUMN_IDS.indexOf(column);
  const repliedSinceMove =
    column === 'waiting' &&
    thread.lastReceivedAt &&
    thread.meta.movedAt &&
    thread.lastReceivedAt > thread.meta.movedAt;

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', thread.id);
        onDragStart(thread.id);
      }}
      onDragEnd={() => onDragStart(null)}
      onClick={() => ui.showThread(thread.id)}
      title="Open in the reading pane"
      className={`group relative cursor-pointer rounded-md border border-ms-border bg-ms-bg px-3 py-2 shadow-sm transition hover:border-ms-accent ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {thread.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ms-accent" />}
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm ${thread.unread ? 'font-semibold' : 'font-medium'}`}>
            {thread.subject || '(no subject)'}
          </div>
          <div className="truncate text-xs text-ms-muted">{people(thread)}</div>
        </div>
        <span className="shrink-0 text-[11px] text-ms-muted">{shortDate(latest(thread))}</span>
      </div>
      {(thread.attachmentCount > 0 || repliedSinceMove) && (
        <div className="mt-1.5 flex items-center gap-2 text-ms-muted">
          {thread.attachmentCount > 0 && <Paperclip size={12} />}
          {repliedSinceMove && (
            <span className="flex items-center gap-1 rounded bg-ms-panel px-1.5 py-0.5 text-[11px] text-ms-accent">
              <MessageSquareReply size={11} /> New reply
            </span>
          )}
        </div>
      )}
      <div className="absolute right-1.5 top-1.5 hidden items-center gap-0.5 rounded-md border border-ms-border bg-ms-bg p-0.5 text-ms-muted shadow-sm group-hover:flex">
        <button
          disabled={index === 0}
          onClick={stop(() => moveTo(thread, COLUMN_IDS[index - 1]))}
          className="rounded p-0.5 hover:bg-ms-panel hover:text-ms-text disabled:opacity-30"
          title="Move left"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          disabled={index === COLUMN_IDS.length - 1}
          onClick={stop(() => moveTo(thread, COLUMN_IDS[index + 1]))}
          className="rounded p-0.5 hover:bg-ms-panel hover:text-ms-text disabled:opacity-30"
          title="Move right"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={stop(() => setMetadata(thread, null))}
          className="rounded p-0.5 hover:bg-ms-panel hover:text-ms-danger"
          title="Remove from board"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function useWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function AddPanel({ boardIds, onClose, overlay }) {
  const [draft, setDraft] = useViewState('lastSearch', 'in:inbox');
  const [search, setSearch] = useState(draft);
  const results = useThreads(search.trim() ? { search: search.trim(), limit: 30 } : null);

  return (
    <div
      className={`flex w-80 max-w-full shrink-0 flex-col border-l border-ms-border bg-ms-panel ${
        overlay ? 'absolute inset-y-0 right-0 z-10 shadow-xl' : ''
      }`}
    >
      <div className="flex items-center justify-between px-3 pt-3 text-sm font-semibold">
        Add threads to the board
        <button
          onClick={onClose}
          className="rounded p-1 text-ms-muted hover:text-ms-text"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
      <form
        className="px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft);
        }}
      >
        <div className="flex items-center gap-2 rounded-md border border-ms-border bg-ms-bg px-2 py-1">
          <Search size={14} className="text-ms-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. from:alice is:unread"
            className="min-w-0 flex-1 bg-transparent text-sm text-ms-text outline-none"
          />
        </div>
        <div className="mt-1 text-[11px] text-ms-muted">Press Return to search</div>
      </form>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {results.loading && <div className="px-2 py-4 text-xs text-ms-muted">Searching…</div>}
        {results.error && (
          <div className="px-2 py-4 text-xs text-ms-danger">{results.error.message}</div>
        )}
        {!results.loading && !results.error && results.data.length === 0 && (
          <div className="px-2 py-4 text-xs text-ms-muted">No threads match.</div>
        )}
        {results.data.map((t) => {
          const onBoard = boardIds.has(t.id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ms-bg"
            >
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => ui.showThread(t.id)}>
                <div className={`truncate text-sm ${t.unread ? 'font-semibold' : ''}`}>
                  {t.subject || '(no subject)'}
                </div>
                <div className="truncate text-xs text-ms-muted">
                  {people(t)} · {shortDate(latest(t))}
                </div>
              </div>
              <button
                disabled={onBoard}
                onClick={() => moveTo(t, 'todo')}
                className="flex shrink-0 items-center gap-1 rounded border border-ms-border px-1.5 py-0.5 text-xs text-ms-accent hover:border-ms-accent disabled:border-transparent disabled:text-ms-muted"
              >
                {onBoard ? (
                  'On board'
                ) : (
                  <>
                    <Plus size={12} /> Add
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function KanbanView() {
  const board = useThreads({ tagged: true, limit: 500 });
  const [dragId, setDragId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);
  const [adding, setAdding] = useViewState('addPanelOpen', true);
  const narrow = useWidth() < 760;

  // The reading pane takes the right half after ui.showThread; give the board the room.
  useEffect(() => {
    if (narrow) setAdding(false);
  }, [narrow]);

  const byColumn = useMemo(() => {
    const out = Object.fromEntries(COLUMN_IDS.map((c) => [c, []]));
    for (const t of board.data) {
      const column = COLUMN_IDS.includes(t.meta?.column) ? t.meta.column : 'todo';
      out[column].push({ ...t, meta: { ...t.meta, column } });
    }
    for (const c of COLUMN_IDS) {
      out[c].sort((a, b) => String(b.meta.movedAt).localeCompare(String(a.meta.movedAt)));
    }
    return out;
  }, [board.data]);

  const boardIds = useMemo(() => new Set(board.data.map((t) => t.id)), [board.data]);

  const drop = (column) => {
    const thread = board.data.find((t) => t.id === dragId);
    if (thread && thread.meta?.column !== column) moveTo(thread, column);
    setDragId(null);
    setOverColumn(null);
  };

  return (
    <div className="flex h-screen flex-col bg-ms-bg text-ms-text">
      <div className="flex items-center gap-3 border-b border-ms-border px-4 py-3">
        <KanbanSquare size={18} className="text-ms-accent" />
        <h1 className="text-base font-semibold">Board</h1>
        <span className="text-sm text-ms-muted">
          {board.loading ? 'Loading…' : `${board.data.length} threads`}
        </span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="ml-auto flex items-center gap-1 rounded-md bg-ms-accent px-2.5 py-1 text-sm text-white hover:opacity-90"
          >
            <Plus size={14} /> Add threads
          </button>
        )}
      </div>
      {board.error && <div className="px-4 py-2 text-sm text-ms-danger">{board.error.message}</div>}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto p-3">
          {COLUMNS.map(({ id, title, icon: Icon }) => {
            const items = byColumn[id];
            return (
              <div
                key={id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverColumn(id);
                }}
                onDragLeave={() => setOverColumn((c) => (c === id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(id);
                }}
                className={`flex ${narrow ? 'min-w-[200px]' : 'min-w-[220px]'} flex-1 flex-col rounded-lg border bg-ms-panel ${
                  overColumn === id && dragId ? 'border-ms-accent' : 'border-ms-border'
                }`}
              >
                <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
                  <Icon size={14} className="text-ms-muted" />
                  {title}
                  <span className="ml-auto text-xs font-normal text-ms-muted">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {items.map((t) => (
                    <Card
                      key={t.id}
                      thread={t}
                      onDragStart={setDragId}
                      dragging={dragId === t.id}
                    />
                  ))}
                  {items.length === 0 && !board.loading && (
                    <div className="rounded-md border border-dashed border-ms-border py-8 text-center text-xs text-ms-muted">
                      {id === 'todo' && board.data.length === 0
                        ? 'Add threads from the panel on the right'
                        : 'Drag cards here'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {adding && (
          <AddPanel boardIds={boardIds} overlay={narrow} onClose={() => setAdding(false)} />
        )}
      </div>
    </div>
  );
}
