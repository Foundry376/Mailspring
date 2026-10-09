import React, { useMemo } from 'react';
import {
  Sun,
  Sparkles,
  AlertTriangle,
  Reply,
  Inbox,
  Cpu,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import {
  useMessages,
  useThreads,
  useCounts,
  useAccounts,
  useGenerate,
  useViewState,
  ui,
} from '@mailspring/view';

// Briefings read at most this many messages; people come first, then lists and notifications.
const MAX_BRIEFING_MESSAGES = 40;
// Fewer than this today and the briefing covers the last two days instead.
const QUIET_DAY = 8;
const WAITING_WINDOW_DAYS = 14;
const ROBOT = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|mailer-daemon|alerts?|updates?|news|newsletter|info|support|marketing)([._+-]|@)/i;
// Folder roles that aren't a useful breakdown of what arrived.
const HIDDEN_ROLES = new Set(['all', 'inbox', 'sent', 'drafts', 'spam', 'trash', 'archive', 'important', 'snoozed']);

// Day precision keeps queries identical across renders, so hooks don't resubscribe.
const dayString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return dayString(d);
};

function ago(iso) {
  if (!iso) return '';
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Card({ icon: Icon, title, right, children }) {
  return (
    <section className="rounded-lg border border-ms-border bg-ms-panel">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-ms-border">
        <Icon size={15} className="text-ms-muted" />
        <h2 className="text-sm font-semibold flex-1">{title}</h2>
        {right && <span className="text-xs text-ms-muted">{right}</span>}
      </header>
      {children}
    </section>
  );
}

function Row({ title, detail, badge, onClick }) {
  return (
    <li
      onClick={onClick}
      className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-ms-bg border-b border-ms-border last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {detail && <div className="mt-0.5 text-xs text-ms-muted line-clamp-2">{detail}</div>}
      </div>
      {badge}
      <ChevronRight size={14} className="mt-1 shrink-0 text-ms-muted" />
    </li>
  );
}

function Progress({ state }) {
  const pct = state.total ? Math.round((state.processed / state.total) * 100) : 0;
  const label =
    state.phase === 'briefing'
      ? 'Writing your briefing…'
      : `Reading today's mail… ${state.processed} of ${state.total || '…'}`;
  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 text-sm text-ms-muted">
        <Loader2 size={14} className="animate-spin" /> {label}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-ms-bg">
        <div
          className="h-full rounded-full bg-ms-accent transition-all"
          style={{ width: `${state.phase === 'briefing' ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DailyBriefing() {
  const today = startOfDay(0);
  const todays = useMessages({
    where: { and: [{ in: 'inbox' }, { direction: 'received' }, { date: { after: today } }] },
    limit: 400,
  });
  const quiet = !todays.loading && todays.data.length < QUIET_DAY;
  const since = quiet ? startOfDay(1) : today;
  const inWindow = useMessages({
    where: { and: [{ in: 'inbox' }, { direction: 'received' }, { date: { after: since } }] },
    limit: 400,
  });

  // People before lists and notifications, newest first within each, one message per thread.
  const briefingIds = useMemo(() => {
    const seen = new Set();
    const pick = (list) =>
      list.filter((m) => {
        if (seen.has(m.threadId)) return false;
        seen.add(m.threadId);
        return true;
      });
    const people = pick(inWindow.data.filter((m) => !m.listUnsubscribe));
    const lists = pick(inWindow.data.filter((m) => m.listUnsubscribe));
    return [...people, ...lists].slice(0, MAX_BRIEFING_MESSAGES).map((m) => m.id);
  }, [inWindow.data]);

  const briefing = useGenerate(
    inWindow.loading || !briefingIds.length ? null : { task: 'prioritize', ids: briefingIds }
  );
  // The written paragraph is opt-in: the bundled model sometimes mixes details between
  // emails, while the headline and sections are built from per-email summaries.
  const [wantProse, setWantProse] = useViewState('wantProse', false);
  const prose = useGenerate(
    wantProse && briefing.status === 'done' ? { task: 'summarize', ids: briefingIds } : null
  );

  // Conversations you're part of where the other side wrote last.
  const recent = useThreads({
    where: {
      and: [
        { in: 'inbox' },
        { direction: 'sent' },
        { date: { after: startOfDay(WAITING_WINDOW_DAYS) } },
      ],
    },
    limit: 200,
  });
  const waiting = useMemo(
    () =>
      recent.data
        .filter((t) => t.lastReceivedAt && (!t.lastSentAt || t.lastReceivedAt > t.lastSentAt))
        .filter((t) => t.participants.some((c) => !c.isMe && !ROBOT.test(c.email)))
        .sort((a, b) => (a.lastReceivedAt < b.lastReceivedAt ? 1 : -1))
        .slice(0, 8),
    [recent.data]
  );

  const categories = useCounts(
    { where: { and: [{ direction: 'received' }, { date: { after: since } }] } },
    'category'
  );
  const accounts = useAccounts();
  const roles = useMemo(() => {
    const map = new Map();
    for (const a of accounts.data) for (const c of a.categories) map.set(c.id, c.role);
    return map;
  }, [accounts.data]);
  const lists = inWindow.data.filter((m) => m.listUnsubscribe).length;
  const direct = inWindow.data.length - lists;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const running = briefing.status === 'running';

  return (
    <div className="h-screen overflow-y-auto bg-ms-bg text-ms-text">
      <div className="mx-auto max-w-5xl p-6 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Sun size={20} className="text-ms-accent" /> {dateLabel}
            </h1>
            <p className="text-sm text-ms-muted flex items-center gap-1.5">
              <Cpu size={13} /> Generated on this device. Your mail never leaves your computer.
              {quiet && ' Today is quiet, so this covers the last two days.'}
            </p>
          </div>
          <div className="flex gap-4 text-xs text-ms-muted tabular-nums">
            <span>
              <strong className="text-ms-text text-base">{direct}</strong> from people & services
            </span>
            <span>
              <strong className="text-ms-text text-base">{lists}</strong> from lists
            </span>
          </div>
        </div>

        <Card icon={Sparkles} title="Summary">
          {running ? (
            <Progress state={briefing} />
          ) : briefing.headline ? (
            <div className="px-4 py-3 space-y-3">
              <p className="text-sm leading-relaxed">{briefing.headline}</p>
              {prose.status === 'running' ? (
                <div className="flex items-center gap-2 text-sm text-ms-muted">
                  <Loader2 size={14} className="animate-spin" /> Writing a paragraph…
                </div>
              ) : prose.text ? (
                <div>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{prose.text}</p>
                  <button className="mt-2 text-xs text-ms-link" onClick={() => setWantProse(false)}>
                    Hide paragraph
                  </button>
                </div>
              ) : wantProse && prose.status === 'done' ? (
                <p className="text-xs text-ms-muted">The model couldn’t write a clean paragraph this time.</p>
              ) : (
                <button className="text-xs text-ms-link" onClick={() => setWantProse(true)}>
                  Write a paragraph (experimental, may mix details between emails)
                </button>
              )}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-ms-muted">
              {briefing.error
                ? briefing.error.message
                : inWindow.loading
                ? 'Loading…'
                : 'Nothing new to summarize.'}
            </p>
          )}
          {briefing.modelAvailable === false && (
            <p className="px-4 pb-3 text-xs text-ms-muted">
              The on-device model isn’t installed, so emails are listed by subject instead of
              summarized.
            </p>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card
            icon={AlertTriangle}
            title="Needs your attention"
            right={briefing.priorities.length ? `${briefing.priorities.length}` : null}
          >
            {briefing.priorities.length ? (
              <ul>
                {briefing.priorities.map((p) => (
                  <Row
                    key={p.threadId}
                    title={p.title}
                    detail={p.reason}
                    onClick={() => ui.showThread(p.threadId)}
                    badge={
                      p.urgency === 'high' && (
                        <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-ms-danger text-white">
                          Urgent
                        </span>
                      )
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-ms-muted">
                {running ? 'Looking through today’s mail…' : 'Nothing urgent today.'}
              </p>
            )}
          </Card>

          <Card icon={Reply} title="Waiting on your reply" right={waiting.length ? `${waiting.length}` : null}>
            {waiting.length ? (
              <ul>
                {waiting.map((t) => {
                  const them = t.participants.find((c) => !c.isMe && !ROBOT.test(c.email));
                  return (
                    <Row
                      key={t.id}
                      title={t.subject || '(no subject)'}
                      detail={`${them ? them.name || them.email : 'Someone'} · ${ago(t.lastReceivedAt)}`}
                      onClick={() => ui.showThread(t.id)}
                    />
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-ms-muted">
                {recent.loading ? 'Loading…' : 'You’re caught up on your conversations.'}
              </p>
            )}
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card icon={Inbox} title="Everything else, by source">
            {briefing.groups.length ? (
              <ul>
                {briefing.groups.slice(0, 10).map((g) => (
                  <Row
                    key={g.source}
                    title={`${g.source}${g.count > 1 ? ` (${g.count})` : ''}`}
                    detail={g.gists.join(' · ')}
                    onClick={() => ui.showThread(g.threadIds[0])}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-ms-muted">{running ? 'Grouping…' : 'Nothing else today.'}</p>
            )}
          </Card>

          <Card icon={Inbox} title="By folder and label">
            <ul className="py-1">
              {categories.data
                .filter((r) => r.labels.category && !HIDDEN_ROLES.has(roles.get(r.key.category)))
                .slice(0, 8)
                .map((r) => (
                  <li key={r.key.category} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                    <span className="truncate flex-1">{r.labels.category}</span>
                    <span className="tabular-nums text-ms-muted">{r.count}</span>
                  </li>
                ))}
              {!categories.loading && !categories.data.length && (
                <li className="px-4 py-4 text-sm text-ms-muted">No mail yet.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
