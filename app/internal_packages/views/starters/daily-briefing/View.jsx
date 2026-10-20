import React, { useMemo } from 'react';
import {
  Sun,
  Sparkles,
  AlertTriangle,
  Reply,
  Inbox,
  Cpu,
  Loader2,
} from 'lucide-react';
import {
  useMessages,
  useThreads,
  useCounts,
  useAccounts,
  useSummaries,
  useGenerate,
  useViewState,
  ui,
  threadProps,
  ThreadActions,
} from '@mailspring/view';

// Briefings read at most this many messages; people come first, then lists and notifications.
const MAX_BRIEFING_MESSAGES = 40;
const MAX_PRIORITIES = 5;
const MAX_PROSE_GROUPS = 12;
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

// ── Choosing priorities ─────────────────────────────────────────────────────
// Deterministic on purpose: asked to pick what matters, the on-device model returned an empty
// list for every prompt on our eval set, while its one-line summary of each email was mostly
// faithful. So the model only explains each item; exact signals rank them.

const AUTOMATED_SENDER =
  /(^|[.+_-])(no-?reply|do-?not-?reply|notifications?|mailer|alerts?|updates|marketing|news(letter)?|info)([.+_-]|@)/i;
const SECURITY =
  /\b(security alert|sign-?in|signed in|password|verify your|verification code|suspicious|2-step|two-factor|new device)\b/i;
const ALERT_SENDER = /sentry|pagerduty|datadog|opsgenie|statuspage|uptime|newrelic|bugsnag|rollbar/i;
const ALERT_SUBJECT = /error|exception|regression|alert|outage|incident|failed|failure|\bdown\b/i;

const fromEmail = (m) => ((m.from && m.from.email) || '').toLowerCase();
const fromLabel = (m) => (m.from && (m.from.name || m.from.email)) || '';

function scoreItem({ message: m, signals: s, summary }) {
  let score = 0;
  const reasons = [];
  if (!s.bulk && SECURITY.test(m.subject || '')) {
    score += 5;
    reasons.push('Security notice');
  }
  if (!s.bulk && !s.automated && !s.lastFromMe && s.knownCorrespondent) {
    score += 4;
    reasons.push('Waiting on your reply');
  } else if (!s.bulk && !s.automated && !s.lastFromMe && s.toMe) {
    // Unknown senders writing directly are mostly services without List-Unsubscribe (terms
    // updates, portfolio digests), so they only surface together with another signal.
    score += 1;
    reasons.push('Written to you');
  }
  if (ALERT_SENDER.test(fromEmail(m)) && ALERT_SUBJECT.test(m.subject || '')) {
    score += 3;
    reasons.push('Error report');
  }
  if (!s.bulk && summary && summary.needsAction) {
    score += 1;
    if (summary.asks) reasons.push(`Asks: ${summary.asks}`);
  }
  if (s.bulk) score -= 3;
  return { score, reasons };
}

function priorityKind(reasons) {
  if (reasons.includes('Security notice')) return 'security';
  if (reasons.includes('Waiting on your reply')) return 'reply';
  if (reasons.includes('Error report')) return 'error';
  return 'direct';
}

function choosePriorities(items) {
  const seenThreads = new Set();
  return items
    .map((item) => ({ item, ...scoreItem(item) }))
    .filter((x) => x.score >= 3)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.item.message.date) - Date.parse(a.item.message.date)
    )
    .filter((x) => {
      if (seenThreads.has(x.item.message.threadId)) return false;
      seenThreads.add(x.item.message.threadId);
      return true;
    })
    .slice(0, MAX_PRIORITIES)
    .map(({ item, reasons, score }) => ({
      threadId: item.message.threadId,
      from: fromLabel(item.message),
      kind: priorityKind(reasons),
      title: item.message.subject || '(no subject)',
      reason: [...reasons, item.summary ? item.summary.gist : null].filter(Boolean).join(' · '),
      urgency: score >= 5 ? 'high' : 'medium',
    }));
}

function sourceOf(m) {
  const email = fromEmail(m);
  const repo = /github\.com$/i.test(email) && (m.subject || '').match(/^(?:Re:\s*)?\[([^\]]+)\]/);
  if (repo) return `GitHub · ${repo[1]}`;
  return (m.from && m.from.name) || email.split('@')[1] || email || 'Unknown sender';
}

function groupBySource(items, exclude) {
  const groups = new Map();
  for (const { message: m, summary } of items) {
    if (exclude.has(m.threadId)) continue;
    const source = sourceOf(m);
    const g = groups.get(source) || { source, count: 0, threadIds: [], gists: [] };
    g.count += 1;
    g.threadIds.push(m.threadId);
    const gist = summary && summary.gist ? summary.gist : m.subject;
    if (gist && g.gists.length < 2) g.gists.push(gist);
    groups.set(source, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// Built by template, so it's always right about who and how many.
function headline(priorities, groups) {
  const phrase = (p) => {
    switch (p.kind) {
      case 'security':
        return `a security notice from ${p.from}`;
      case 'reply':
        return `${p.from} is waiting on a reply`;
      case 'error':
        return `an error report from ${p.from}`;
      default:
        return `a message from ${p.from}`;
    }
  };
  const list = (parts) =>
    parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const sentences = [];
  if (priorities.length) {
    const more = priorities.length > 3 ? `, plus ${priorities.length - 3} more` : '';
    sentences.push(`Needs you: ${list(priorities.slice(0, 3).map(phrase))}${more}.`);
  } else {
    sentences.push('Nothing urgent today.');
  }
  const top = groups.slice(0, 3).map((g) => `${g.count} from ${g.source}`);
  const rest = groups.slice(3).reduce((n, g) => n + g.count, 0);
  if (top.length) sentences.push(`Also: ${list(rest ? [...top, `${rest} more`] : top)}.`);
  return sentences.join(' ');
}

// ── The optional paragraph ──────────────────────────────────────────────────

const PROSE_INSTRUCTIONS =
  'Write a short morning email briefing as two short paragraphs of plain prose. Paragraph 1 covers the emails that need attention, one at a time. Paragraph 2 summarizes the other emails in one or two sentences. Use only these facts. Keep each email’s details with that email.';

// Plain bullets: given headings and ids, the small model tends to copy them back verbatim.
function proseInput(items, priorities, groups) {
  const byThread = new Map(items.map((i) => [i.message.threadId, i]));
  const bullets = (lines) => (lines.length ? lines.map((l) => `* ${l}`).join('\n') : '* (nothing)');
  const attention = priorities.map((p) => {
    const item = byThread.get(p.threadId);
    return `${p.from}: ${item && item.summary ? item.summary.gist : p.title}`;
  });
  const rest = groups
    .slice(0, MAX_PROSE_GROUPS)
    .map((g) => `${g.source} (${g.count} emails): ${g.gists.join(' / ')}`);
  return `Emails that need attention:\n${bullets(attention)}\n\nOther emails:\n${bullets(rest)}`;
}

// Null when the answer isn't prose: small models sometimes copy the bullets back.
function cleanProse(text) {
  if (!text) return null;
  const out = text
    .split('\n')
    .filter((line) => !/^\s*(\*\*[^*]+\*\*|#+ .*)\s*$/.test(line))
    .join('\n')
    .trim();
  const echoed = /Emails that need attention|Other emails:/i.test(out) || /^\s*[*-] /m.test(out);
  return out && !echoed ? out : null;
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

// A row opens its first thread; its ⋯ menu covers all of them (a group's threads, together).
function Row({ threadIds, title, detail, badge }) {
  return (
    <li
      {...threadProps(threadIds)}
      onClick={() => ui.showThread(threadIds[0])}
      className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-ms-bg border-b border-ms-border last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {detail && <div className="mt-0.5 text-xs text-ms-muted line-clamp-2">{detail}</div>}
      </div>
      {badge}
      <ThreadActions thread={threadIds} />
    </li>
  );
}

function Progress({ state }) {
  const pct = state.total ? Math.round((state.processed / state.total) * 100) : 0;
  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 text-sm text-ms-muted">
        <Loader2 size={14} className="animate-spin" /> Reading today's mail… {state.processed} of{' '}
        {state.total || '…'}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-ms-bg">
        <div className="h-full rounded-full bg-ms-accent transition-all" style={{ width: `${pct}%` }} />
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
  const picked = useMemo(() => {
    const seen = new Set();
    const pick = (list) =>
      list.filter((m) => {
        if (seen.has(m.threadId)) return false;
        seen.add(m.threadId);
        return true;
      });
    const people = pick(inWindow.data.filter((m) => !m.listUnsubscribe));
    const lists = pick(inWindow.data.filter((m) => m.listUnsubscribe));
    return [...people, ...lists].slice(0, MAX_BRIEFING_MESSAGES);
  }, [inWindow.data]);
  const ready = !inWindow.loading && picked.length > 0;

  const summaries = useSummaries(ready ? { ids: picked.map((m) => m.id) } : null);
  // Whether the user already replied last in each thread, and whom they've ever written to.
  const threads = useThreads(
    ready ? { ids: picked.map((m) => m.threadId), limit: MAX_BRIEFING_MESSAGES } : null
  );
  const senders = useMemo(() => [...new Set(picked.map(fromEmail).filter(Boolean))], [picked]);
  const wroteTo = useCounts(
    senders.length ? { where: { and: [{ direction: 'sent' }, { to: senders }] } } : null,
    'recipient'
  );

  const running =
    ready &&
    (['idle', 'running'].includes(summaries.status) || threads.loading || wroteTo.loading);
  const briefing = useMemo(() => {
    if (!ready || running) return null;
    const lastFromMe = new Set(
      threads.data
        .filter((t) => t.lastSentAt && t.lastSentAt > (t.lastReceivedAt || ''))
        .map((t) => t.id)
    );
    const known = new Set(wroteTo.data.map((r) => r.key.recipient));
    const items = picked.map((m) => ({
      message: m,
      summary: summaries.results[m.id] || null,
      signals: {
        bulk: !!m.listUnsubscribe,
        automated: AUTOMATED_SENDER.test(fromEmail(m)),
        toMe: m.to.some((c) => c.isMe),
        lastFromMe: lastFromMe.has(m.threadId),
        knownCorrespondent: known.has(fromEmail(m)),
      },
    }));
    const priorities = choosePriorities(items);
    const groups = groupBySource(items, new Set(priorities.map((p) => p.threadId)));
    return {
      priorities,
      groups,
      headline: headline(priorities, groups),
      input: proseInput(items, priorities, groups),
    };
  }, [ready, running, picked, summaries.results, threads.data, wroteTo.data]);

  // The written paragraph is opt-in: the bundled model sometimes mixes details between
  // emails, while the headline and sections are built from per-email summaries.
  const [wantProse, setWantProse] = useViewState('wantProse', false);
  const prose = useGenerate(
    wantProse && briefing
      ? { instructions: PROSE_INSTRUCTIONS, input: briefing.input, maxTokens: 260 }
      : null
  );
  const proseText = cleanProse(prose.text);

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
  const priorities = briefing ? briefing.priorities : [];
  const groups = briefing ? briefing.groups : [];

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
            <Progress state={summaries} />
          ) : briefing ? (
            <div className="px-4 py-3 space-y-3">
              <p className="text-sm leading-relaxed">{briefing.headline}</p>
              {prose.status === 'running' ? (
                <div className="flex items-center gap-2 text-sm text-ms-muted">
                  <Loader2 size={14} className="animate-spin" /> Writing a paragraph…
                </div>
              ) : proseText ? (
                <div>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{proseText}</p>
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
              {summaries.error
                ? summaries.error.message
                : inWindow.loading
                ? 'Loading…'
                : 'Nothing new to summarize.'}
            </p>
          )}
          {summaries.modelAvailable === false && (
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
            right={priorities.length ? `${priorities.length}` : null}
          >
            {priorities.length ? (
              <ul>
                {priorities.map((p) => (
                  <Row
                    key={p.threadId}
                    title={p.title}
                    detail={p.reason}
                    threadIds={[p.threadId]}
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
                      threadIds={[t.id]}
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
            {groups.length ? (
              <ul>
                {groups.slice(0, 10).map((g) => (
                  <Row
                    key={g.source}
                    title={`${g.source}${g.count > 1 ? ` (${g.count})` : ''}`}
                    detail={g.gists.join(' · ')}
                    threadIds={g.threadIds}
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
