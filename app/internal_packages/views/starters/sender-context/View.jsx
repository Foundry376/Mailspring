import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, Clock, MessagesSquare, Mail, Search } from 'lucide-react';
import { useSelectedThread, useCounts, useThreads, useMessages, useTheme, ui } from '@mailspring/view';

const lc = (s) => String(s ?? '').toLowerCase();

// The twelve months ending at `end`, so an old relationship still shows its last active year.
function twelveMonthsEnding(end) {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(end.getFullYear(), end.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  const after = new Date(end.getFullYear(), end.getMonth() + 1, 1);
  return { months, range: { after: start.toISOString(), before: after.toISOString() } };
}

function duration(ms) {
  if (ms == null) return '—';
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' });
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// Response latency in each direction: for every message, the gap until the other side's next message in the same thread.
function replyTimes(messages, theirEmail) {
  const byThread = {};
  for (const m of messages) (byThread[m.threadId] ??= []).push(m);
  const mine = [];
  const theirs = [];
  for (const list of Object.values(byThread)) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const fromThem = lc(a.from?.email) === theirEmail;
      if (!fromThem && !a.isSent) continue;
      const reply = list.slice(i + 1).find((b) => (fromThem ? b.isSent : lc(b.from?.email) === theirEmail));
      if (!reply) continue;
      const gap = new Date(reply.date) - new Date(a.date);
      if (gap <= 0 || gap > 30 * 86400000) continue;
      (fromThem ? mine : theirs).push(gap);
    }
  }
  return { mine, theirs };
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-ms-muted">
        <Icon size={11} /> {label}
      </div>
      <div className="text-[13px] font-medium tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] text-ms-muted truncate">{sub}</div>}
    </div>
  );
}

function Heading({ children }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-ms-muted mb-1.5">{children}</div>;
}

export default function SenderContext() {
  const selected = useSelectedThread();
  const theme = useTheme();
  const [picked, setPicked] = useState(null);

  const others = (selected?.thread.participants || []).filter((p) => !p.isMe);
  const lastInbound = selected && [...selected.messages].reverse().find((m) => !m.isSent && m.from);
  const defaultEmail = lc(lastInbound?.from?.email || others[0]?.email);
  const email = others.some((p) => lc(p.email) === picked) ? picked : defaultEmail;
  const person = others.find((p) => lc(p.email) === email) || lastInbound?.from;

  const withThem = email ? { participant: email } : null;
  const totals = useCounts(withThem && { where: withThem }, 'sender');
  const lastContact = totals.data.reduce((d, r) => (!d || r.last > d ? r.last : d), null);
  const span = useMemo(() => twelveMonthsEnding(lastContact ? new Date(lastContact) : new Date()), [lastContact?.slice(0, 7)]);
  const monthly = useCounts(
    withThem && lastContact ? { where: { and: [withThem, { date: span.range }] } } : null,
    ['month', 'sender']
  );
  const recent = useThreads(withThem && { where: withThem, limit: 6 });
  const history = useMessages(withThem && { where: withThem, limit: 300 });

  const isThem = (key) => lc(key) === email;

  const summary = useMemo(() => {
    let received = 0;
    let sent = 0;
    let first = null;
    let last = null;
    for (const r of totals.data) {
      const them = isThem(r.key.sender);
      if (!them && !r.isMe.sender) continue;
      if (them) received += r.count;
      else sent += r.count;
      if (!first || r.first < first) first = r.first;
      if (!last || r.last > last) last = r.last;
    }
    return { received, sent, first, last };
  }, [totals.data, email]);

  const series = useMemo(() => {
    const months = span.months;
    const rows = Object.fromEntries(months.map((m) => [m, { month: m, them: 0, me: 0 }]));
    for (const r of monthly.data) {
      const row = rows[r.key.month];
      if (!row) continue;
      if (isThem(r.key.sender)) row.them += r.count;
      else if (r.isMe.sender) row.me += r.count;
    }
    return months.map((m) => rows[m]);
  }, [monthly.data, span, email]);

  const latency = useMemo(() => replyTimes(history.data, email), [history.data, email]);
  const myMedian = median(latency.mine);
  const theirMedian = median(latency.theirs);
  const avgMine = latency.mine.length ? latency.mine.reduce((s, x) => s + x, 0) / latency.mine.length : null;

  if (!selected || !email) return null;

  const loading = totals.loading;
  const otherThreads = recent.data.filter((t) => t.id !== selected.thread.id).slice(0, 5);
  const monthLabel = (m) => new Date(`${m}-15`).toLocaleDateString([], { month: 'short', year: '2-digit' });

  return (
    // The host draws the sidebar chrome (a card, or the full panel), so the View adds none.
    <div className="text-[13px] text-ms-text space-y-4">
      <div>
        <div className="font-semibold truncate">{person?.name || email}</div>
        <div className="text-xs text-ms-muted truncate">{email}</div>
        {others.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {others.slice(0, 6).map((p) => (
              <button
                key={p.email}
                onClick={() => setPicked(lc(p.email))}
                title={p.email}
                className={`max-w-[9rem] truncate rounded-full border px-2 py-0.5 text-[11px] ${
                  lc(p.email) === email ? 'border-ms-accent text-ms-accent' : 'border-ms-border text-ms-muted hover:text-ms-text'
                }`}
              >
                {(p.name || p.email).split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-ms-muted">Loading history…</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Stat icon={ArrowDownLeft} label="From them" value={summary.received.toLocaleString()} />
          <Stat icon={ArrowUpRight} label="From you" value={summary.sent.toLocaleString()} />
          <Stat icon={MessagesSquare} label="First contact" value={shortDate(summary.first)} />
          <Stat icon={Mail} label="Last contact" value={shortDate(summary.last)} />
          <Stat
            icon={Clock}
            label="You reply in"
            value={avgMine == null ? '—' : `~${duration(avgMine)} avg`}
            sub={myMedian == null ? 'no replies yet' : `median ${duration(myMedian)} · ${latency.mine.length}×`}
          />
          <Stat
            icon={Clock}
            label="They reply in"
            value={theirMedian == null ? '—' : `~${duration(theirMedian)}`}
            sub={theirMedian == null ? 'no replies yet' : `median · ${latency.theirs.length}×`}
          />
        </div>
      )}

      <div>
        <Heading>{lastContact && Date.now() - new Date(lastContact) > 330 * 86400000 ? 'Final 12 months' : 'Last 12 months'}</Heading>
        <div className="h-14">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} barCategoryGap={1} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" hide />
              <Tooltip
                cursor={{ fill: theme.colors.border, opacity: 0.4 }}
                labelFormatter={monthLabel}
                contentStyle={{
                  background: theme.colors.panel,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                  fontSize: 11,
                  padding: '4px 8px',
                }}
              />
              <Bar dataKey="them" name="From them" stackId="a" fill={theme.chart[0]} isAnimationActive={false} />
              <Bar dataKey="me" name="From you" stackId="a" fill={theme.chart[1]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ms-muted">
          <span>{monthLabel(series[0].month)}</span>
          <span className="flex gap-2">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.chart[0] }} />them</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.chart[1] }} />you</span>
          </span>
          <span>{monthLabel(series[11].month)}</span>
        </div>
      </div>

      <div>
        <Heading>Other threads</Heading>
        <div className="space-y-0.5">
          {otherThreads.map((t) => (
            <button
              key={t.id}
              onClick={() => ui.showThread(t.id)}
              className="flex w-full items-baseline gap-2 rounded px-1 -mx-1 py-0.5 text-left hover:bg-ms-panel"
            >
              <span className={`flex-1 truncate ${t.unread ? 'font-semibold' : ''}`}>{t.subject || '(no subject)'}</span>
              <span className="shrink-0 text-[11px] text-ms-muted">{shortDate(t.lastReceivedAt || t.lastSentAt || t.firstMessageAt)}</span>
            </button>
          ))}
          {!recent.loading && otherThreads.length === 0 && <div className="text-xs text-ms-muted">This is your only thread together.</div>}
        </div>
        <button onClick={() => ui.search(`from:${email} OR to:${email}`)} className="mt-1.5 flex items-center gap-1 text-xs text-ms-accent hover:underline">
          <Search size={11} /> All mail with {(person?.name || email).split(' ')[0]}
        </button>
      </div>
    </div>
  );
}
