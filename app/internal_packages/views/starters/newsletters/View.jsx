import React, { useMemo, useState } from 'react';
import { Newspaper, Inbox, MailX, ExternalLink, ArrowLeft, Circle, BellOff } from 'lucide-react';
import { useMessages, useCounts, useViewState, useTheme, modify, ui, MessageView } from '@mailspring/view';

// Newsletters are received mail carrying a List-Unsubscribe header. Day precision keeps the
// filter identical across renders.
const SINCE = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const NEWSLETTERS = {
  and: [{ listUnsubscribe: true }, { direction: 'received' }, { date: { after: SINCE } }],
};
const NEVER_OPENED_MIN = 3;

// A publication is a sender display name: one address can carry several brands (NYT, NYT Cooking)
// and one brand sends from several addresses (LinkedIn).
function publicationOf(m) {
  const email = (m.from?.email || '').toLowerCase();
  const name = (m.from?.name || email.split('@')[0]).trim();
  return { id: name.toLowerCase(), name, email };
}

function when(iso) {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// List-Unsubscribe is "<mailto:...>, <https://...>"; prefer the web link.
function unsubscribeTargets(header) {
  if (!header) return {};
  const parts = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  return {
    web: parts.find((p) => /^https?:/i.test(p)),
    mailto: parts.find((p) => /^mailto:/i.test(p)),
  };
}

function unsubscribe(header) {
  const { web, mailto } = unsubscribeTargets(header);
  if (web) return ui.openExternal(web);
  if (mailto) {
    const [addr, query = ''] = mailto.slice(7).split('?');
    const subject = new URLSearchParams(query).get('subject') || 'unsubscribe';
    ui.compose({ to: [decodeURIComponent(addr)], subject });
  }
}

function Monogram({ name, color }) {
  const letter = (name || '?').trim()[0]?.toUpperCase() || '?';
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-white"
      style={{ background: color }}
    >
      {letter}
    </span>
  );
}

function colorFor(id, palette) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function IssueCard({ issue, pub, color, featured, onOpen }) {
  return (
    <article
      onClick={onOpen}
      className={`group cursor-pointer rounded-lg border border-ms-border bg-ms-panel p-4 hover:border-ms-accent flex flex-col gap-2 min-w-0 ${featured ? 'md:col-span-2' : ''}`}
    >
      <div className="flex items-center gap-2 text-xs text-ms-muted min-w-0">
        <Monogram name={pub.name} color={color} />
        <span className="truncate font-medium">{pub.name}</span>
        <span className="ml-auto shrink-0">{when(issue.date)}</span>
      </div>
      <h3 className={`leading-snug group-hover:text-ms-accent ${featured ? 'text-lg' : 'text-[15px]'} ${issue.unread ? 'font-semibold' : 'font-medium text-ms-muted'}`}>
        {issue.unread && <Circle size={7} className="inline mr-1.5 -mt-0.5 fill-current text-ms-accent" />}
        {issue.subject || '(no subject)'}
      </h3>
      <p className={`text-sm text-ms-muted ${featured ? 'line-clamp-3' : 'line-clamp-2'}`}>{issue.snippet}</p>
    </article>
  );
}

function Reader({ issue, pub, onBack }) {
  const { web, mailto } = unsubscribeTargets(issue.listUnsubscribe);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-ms-border px-5 py-2.5 text-sm">
        <button onClick={onBack} className="flex items-center gap-1 text-ms-muted hover:text-ms-text">
          <ArrowLeft size={15} /> Issues
        </button>
        <span className="truncate flex-1 text-ms-muted">{pub.name}</span>
        <button onClick={() => ui.showThread(issue.threadId)} className="flex items-center gap-1 text-ms-accent hover:underline">
          <ExternalLink size={13} /> Open in Mailspring
        </button>
        {(web || mailto) && (
          <button onClick={() => unsubscribe(issue.listUnsubscribe)} className="flex items-center gap-1 text-ms-danger hover:underline">
            <BellOff size={13} /> Unsubscribe
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-4">
          <MessageView messageId={issue.id} />
        </div>
      </div>
    </div>
  );
}

export default function NewslettersView() {
  const recent = useMessages({ where: NEWSLETTERS, limit: 1500 });
  const unreadBySender = useCounts({ where: { and: [NEWSLETTERS, { unread: true }] } }, 'sender');
  const allBySender = useCounts({ where: NEWSLETTERS }, 'sender');
  const [pubFilter, setPubFilter] = useViewState('publication', null);
  const [tab, setTab] = useViewState('tab', 'issues');
  const [openId, setOpenId] = useState(null);
  const palette = useTheme().chart;

  const issues = useMemo(
    () => recent.data.filter((m) => m.from),
    [recent.data]
  );

  const pubs = useMemo(() => {
    const map = new Map();
    for (const m of issues) {
      const p = publicationOf(m);
      if (!map.has(p.id)) map.set(p.id, { ...p, emails: new Set(), issues: 0, unread: 0, last: m.date, sample: m });
      const e = map.get(p.id);
      e.emails.add(p.email);
      e.issues += 1;
      if (m.unread) e.unread += 1;
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [issues]);
  const pubById = useMemo(() => Object.fromEntries(pubs.map((p) => [p.id, p])), [pubs]);
  // Count rows are keyed by address; only addresses that carry a single publication are attributable.
  const pubByEmail = useMemo(() => {
    const owners = {};
    for (const p of pubs) for (const e of p.emails) (owners[e] ??= []).push(p);
    return Object.fromEntries(Object.entries(owners).filter(([, ps]) => ps.length === 1).map(([e, ps]) => [e, ps[0]]));
  }, [pubs]);

  // Host-side counts cover the whole window even when `recent` was truncated by its limit.
  const neverOpened = useMemo(() => {
    const unread = Object.fromEntries(unreadBySender.data.map((r) => [String(r.key.sender).toLowerCase(), r.count]));
    return allBySender.data
      .map((r) => ({ id: String(r.key.sender).toLowerCase(), total: r.count, unread: unread[String(r.key.sender).toLowerCase()] || 0, last: r.last }))
      .filter((r) => pubByEmail[r.id] && r.total >= NEVER_OPENED_MIN && r.unread === r.total)
      .sort((a, b) => b.total - a.total);
  }, [unreadBySender.data, allBySender.data, pubByEmail]);

  const visible = pubFilter ? issues.filter((m) => publicationOf(m).id === pubFilter) : issues;
  const open = openId && issues.find((m) => m.id === openId);
  const totalUnread = pubs.reduce((s, p) => s + p.unread, 0);

  const openIssue = (m) => {
    setOpenId(m.id);
    if (m.unread) modify([m.threadId], { unread: false }).catch(() => {});
  };

  return (
    <div className="flex h-screen bg-ms-bg text-ms-text">
      <aside className="w-64 shrink-0 border-r border-ms-border bg-ms-panel flex flex-col">
        <div className="px-4 pt-5 pb-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Newspaper size={18} className="text-ms-accent" /> Newsletters
          </h1>
          <p className="text-xs text-ms-muted mt-0.5">{pubs.length} publications · last 90 days</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 text-sm">
          {[
            { id: 'issues', label: 'All issues', icon: Inbox, count: totalUnread },
            { id: 'never', label: 'Never opened', icon: MailX, count: neverOpened.length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setPubFilter(null);
                setOpenId(null);
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${tab === t.id && !pubFilter ? 'bg-ms-accent text-white' : 'hover:bg-ms-bg'}`}
            >
              <t.icon size={14} />
              <span className="flex-1">{t.label}</span>
              {t.count > 0 && <span className="text-xs opacity-80 tabular-nums">{t.count}</span>}
            </button>
          ))}
          <div className="mt-4 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-ms-muted">Publications</div>
          {pubs.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setTab('issues');
                setPubFilter(p.id);
                setOpenId(null);
              }}
              title={p.email}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${pubFilter === p.id ? 'bg-ms-accent text-white' : 'hover:bg-ms-bg'}`}
            >
              <Monogram name={p.name} color={colorFor(p.id, palette)} />
              <span className={`flex-1 truncate ${p.unread ? 'font-medium' : ''}`}>{p.name}</span>
              {p.unread > 0 && <span className="text-xs tabular-nums opacity-80">{p.unread}</span>}
            </button>
          ))}
          {recent.loading && <div className="px-2 py-2 text-xs text-ms-muted">Loading…</div>}
        </nav>
      </aside>

      <main className="flex-1 min-w-0">
        {open ? (
          <Reader issue={open} pub={publicationOf(open)} onBack={() => setOpenId(null)} />
        ) : tab === 'never' ? (
          <div className="h-full overflow-y-auto p-6">
            <h2 className="text-lg font-semibold">Never opened</h2>
            <p className="text-sm text-ms-muted mb-4">
              Publications that sent you {NEVER_OPENED_MIN}+ issues in 90 days, none of which you read. Good unsubscribe candidates.
            </p>
            <div className="rounded-lg border border-ms-border bg-ms-panel divide-y divide-ms-border">
              {neverOpened.map((r) => {
                const p = { ...pubByEmail[r.id], email: r.id };
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Monogram name={p.name} color={colorFor(p.id, palette)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-xs text-ms-muted">{p.email}</div>
                    </div>
                    <span className="text-xs text-ms-muted tabular-nums">{r.total} unread · last {when(r.last)}</span>
                    <button onClick={() => ui.search(`from:${p.email}`)} className="text-xs text-ms-accent hover:underline">
                      Show
                    </button>
                    <button
                      onClick={() => unsubscribe(p.sample.listUnsubscribe)}
                      className="flex items-center gap-1 rounded border border-ms-border px-2 py-1 text-xs text-ms-danger hover:border-ms-danger"
                    >
                      <BellOff size={12} /> Unsubscribe
                    </button>
                  </div>
                );
              })}
              {!allBySender.loading && neverOpened.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-ms-muted">You open everything you subscribe to. Impressive.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg font-semibold">{pubFilter ? pubById[pubFilter]?.name : 'Latest issues'}</h2>
              <span className="text-xs text-ms-muted">{visible.length} issues</span>
            </div>
            {recent.error && <p className="text-sm text-ms-danger">{recent.error.message}</p>}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.slice(0, 60).map((m, i) => {
                const p = publicationOf(m);
                return (
                  <IssueCard
                    key={m.id}
                    issue={m}
                    pub={p}
                    color={colorFor(p.id, palette)}
                    featured={i === 0 && !pubFilter}
                    onOpen={() => openIssue(m)}
                  />
                );
              })}
            </div>
            {!recent.loading && visible.length === 0 && (
              <div className="py-16 text-center text-sm text-ms-muted">No newsletters in the last 90 days.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
