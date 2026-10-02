import React, { useEffect, useMemo, useState } from 'react';
import { Users, Folder, Tag, Clock, Flame, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAccounts, useCounts, useTheme, useViewState, getMessages, ui } from '@mailspring/view';

const HIDDEN_ROLES = new Set(['all', 'sent', 'drafts', 'spam', 'trash', 'important', 'snoozed']);
const ROBOT = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|notify|mailer-daemon|postmaster|bounce[s]?|alerts?|updates?|news|newsletter|info|support|hello|team|marketing)([._+-]|@)/i;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RANGES = { '3m': '3 months ago', '12m': '12 months ago', '3y': '3 years ago' };
const LOST_AFTER_DAYS = 180;

const emailOf = (key) => {
  const s = String(key ?? '').toLowerCase();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
};

function prettyFromEmail(email) {
  const local = email.split('@')[0] || email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function ago(iso) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

// Merges received (sender = them) and sent (sender = me, recipient = them) count rows per person.
function mergePeople(senderRows, pairRows, isMe) {
  const people = new Map();
  const get = (email) => {
    if (!people.has(email)) people.set(email, { email, received: 0, sent: 0, first: null, last: null });
    return people.get(email);
  };
  const stamp = (p, r) => {
    if (!p.first || r.first < p.first) p.first = r.first;
    if (!p.last || r.last > p.last) p.last = r.last;
  };
  for (const r of senderRows) {
    const email = emailOf(r.key.sender);
    if (!email || isMe(email) || ROBOT.test(email)) continue;
    const p = get(email);
    p.received += r.count;
    stamp(p, r);
  }
  for (const r of pairRows) {
    const from = emailOf(r.key.sender);
    const to = emailOf(r.key.recipient);
    if (!isMe(from) || !to || isMe(to) || ROBOT.test(to)) continue;
    const p = get(to);
    p.sent += r.count;
    stamp(p, r);
  }
  return [...people.values()].map((p) => ({ ...p, total: p.received + p.sent }));
}

// Count rows carry bare emails only. Display names (and whether an address is one of my aliases,
// which useAccounts() doesn't list) come from Contact objects on a few messages per address.
// Searches are chunked because one large OR query never resolves.
const CHUNK = 4;
function useContacts(emails) {
  const [contacts, setContacts] = useState({});
  const key = emails.join(',');
  useEffect(() => {
    const missing = emails.filter((e) => !(e in contacts));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < missing.length && !cancelled; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK);
        const found = {};
        try {
          const search = chunk.map((e) => `from:${e} OR to:${e}`).join(' OR ');
          const { items } = await getMessages({ search, limit: 12 * CHUNK });
          for (const m of items) {
            for (const c of [m.from, ...m.to, ...m.cc]) {
              const e = c?.email?.toLowerCase();
              if (!chunk.includes(e)) continue;
              found[e] ??= { name: null, isMe: false };
              found[e].isMe ||= c.isMe || (c === m.from && m.isSent);
              // Prefer the name they sign their own mail with; recipient names are often just the address.
              const real = c.name && c.name.toLowerCase() !== e ? c.name : null;
              if (real && (c === m.from || !found[e].name)) found[e].name = real;
            }
          }
        } catch (err) {
          // Leave these unresolved; the email-derived name is shown instead.
        }
        if (cancelled) return;
        setContacts((prev) => {
          const next = { ...prev };
          for (const e of chunk) next[e] = found[e] || { name: null, isMe: false };
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return contacts;
}

// Accounts don't list aliases and alias addresses arrive with isMe=false, so an address that uses
// the same display name as my own sent mail is treated as mine.
function useMyNames() {
  const [names, setNames] = useState(new Set());
  useEffect(() => {
    getMessages({ search: 'in:sent', limit: 50 })
      .then(({ items }) => setNames(new Set(items.filter((m) => m.isSent && m.from?.name).map((m) => m.from.name.toLowerCase()))))
      .catch(() => {});
  }, []);
  return names;
}

function Section({ icon: Icon, title, right, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-ms-border bg-ms-panel ${className}`}>
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-ms-border">
        <Icon size={15} className="text-ms-muted" />
        <h2 className="text-sm font-semibold flex-1">{title}</h2>
        {right && <span className="text-xs text-ms-muted">{right}</span>}
      </header>
      {children}
    </section>
  );
}

function Person({ person, name, max, accent, muted }) {
  return (
    <li
      className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-ms-bg"
      onClick={() => ui.search(`from:${person.email} OR to:${person.email}`)}
      title={person.email}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{name}</div>
        <div className="truncate text-xs text-ms-muted">{person.email}</div>
      </div>
      <div className="w-28 shrink-0">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-ms-bg">
          <div style={{ width: `${(person.received / max) * 100}%`, background: accent }} />
          <div style={{ width: `${(person.sent / max) * 100}%`, background: muted }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-ms-muted tabular-nums">
          <span className="flex items-center gap-0.5"><ArrowDownLeft size={10} />{person.received}</span>
          <span className="flex items-center gap-0.5"><ArrowUpRight size={10} />{person.sent}</span>
        </div>
      </div>
      <div className="w-16 shrink-0 text-right text-xs text-ms-muted">{ago(person.last)}</div>
    </li>
  );
}

function Heatmap({ rows, accent }) {
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const r of rows) g[Number(r.key.weekday)][Number(r.key.hour)] += r.count;
    return g;
  }, [rows]);
  const max = Math.max(1, ...grid.flat());
  const busiest = useMemo(() => {
    let best = { d: 0, h: 0, c: -1 };
    grid.forEach((row, d) => row.forEach((c, h) => c > best.c && (best = { d, h, c })));
    return best;
  }, [grid]);
  return (
    <div className="p-4">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: '32px repeat(24, minmax(0, 1fr))' }}>
        {grid.map((row, d) => (
          <React.Fragment key={d}>
            <div className="text-[11px] text-ms-muted leading-none self-center">{DAYS[d]}</div>
            {row.map((c, h) => (
              <div
                key={h}
                title={`${DAYS[d]} ${h}:00 — ${c} messages`}
                className="aspect-square rounded-[3px] bg-ms-bg"
                style={c ? { background: accent, opacity: 0.12 + 0.88 * (c / max) } : undefined}
              />
            ))}
          </React.Fragment>
        ))}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-[10px] text-ms-muted text-center">
            {h % 6 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`) : ''}
          </div>
        ))}
      </div>
      {busiest.c > 0 && (
        <p className="mt-3 text-xs text-ms-muted">
          Busiest: {DAYS[busiest.d]}s around {busiest.h}:00 ({busiest.c} messages)
        </p>
      )}
    </div>
  );
}

export default function PeopleView() {
  const theme = useTheme();
  const [range, setRange] = useViewState('range', '3y');
  const since = `since:"${RANGES[range]}"`;

  const accounts = useAccounts();
  const senders = useCounts(since, 'sender');
  const pairs = useCounts(since, ['sender', 'recipient']);
  const byFolder = useCounts(since, ['sender', 'category']);
  const heat = useCounts(since, ['weekday', 'hour']);
  const allSenders = useCounts({}, 'sender');
  const allPairs = useCounts({}, ['sender', 'recipient']);

  const myEmails = useMemo(
    () => new Set(accounts.data.map((a) => a.email.toLowerCase())),
    [accounts.data]
  );
  const isMe = (e) => myEmails.has(e);
  const roleOf = useMemo(() => {
    const m = {};
    for (const a of accounts.data) for (const c of a.categories) m[c.id] = c;
    return m;
  }, [accounts.data]);

  // "People" means two-way correspondence; a sender I never wrote to is a list or a robot.
  const candidates = useMemo(
    () => mergePeople(senders.data, pairs.data, isMe).filter((p) => p.sent > 0).sort((a, b) => b.total - a.total).slice(0, 60),
    [senders.data, pairs.data, myEmails]
  );
  const lostCandidates = useMemo(() => {
    const cutoff = new Date(Date.now() - LOST_AFTER_DAYS * 86400000).toISOString();
    return mergePeople(allSenders.data, allPairs.data, isMe)
      .filter((p) => p.last < cutoff && p.sent >= 2 && p.total >= 6)
      .sort((a, b) => b.total - a.total)
      .slice(0, 30);
  }, [allSenders.data, allPairs.data, myEmails]);

  const contacts = useContacts(
    useMemo(() => [...new Set([...candidates.slice(0, 30), ...lostCandidates].map((p) => p.email))], [candidates, lostCandidates])
  );
  const myNames = useMyNames();
  const myLocals = useMemo(() => new Set([...myEmails].map((e) => e.split('@')[0])), [myEmails]);
  const notMe = (p) => {
    const c = contacts[p.email];
    const name = (c?.name || '').toLowerCase();
    if (c?.isMe || myLocals.has(p.email.split('@')[0].split('+')[0])) return false;
    return ![...myNames].some((n) => name === n || name.startsWith(`${n} (`));
  };
  const top = candidates.filter(notMe).slice(0, 15);
  const lost = lostCandidates.filter(notMe).slice(0, 12);
  const topEmails = new Set(top.map((p) => p.email));

  const correspondents = useMemo(
    () => new Set(candidates.filter(notMe).map((p) => p.email)),
    [candidates, contacts, myNames, myLocals]
  );
  const folders = useMemo(() => {
    const groups = new Map();
    for (const r of byFolder.data) {
      const email = emailOf(r.key.sender);
      if (!correspondents.has(email)) continue;
      const cat = roleOf[r.key.category];
      if (cat && HIDDEN_ROLES.has(cat.role)) continue;
      const id = r.key.category;
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          name: r.labels?.category || cat?.name || id,
          kind: cat?.kind || 'folder',
          total: 0,
          people: [],
        });
      }
      const g = groups.get(id);
      g.total += r.count;
      g.people.push({ email, count: r.count });
    }
    return [...groups.values()]
      .map((g) => ({ ...g, people: g.people.sort((a, b) => b.count - a.count).slice(0, 5) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 9);
  }, [byFolder.data, roleOf, correspondents]);

  const loading = senders.loading || pairs.loading || accounts.loading;
  const error = senders.error || pairs.error || byFolder.error || heat.error || allSenders.error || allPairs.error;
  const maxTotal = Math.max(1, ...top.map((p) => p.total));
  const displayName = (e) => contacts[e]?.name || prettyFromEmail(e);
  const heatTotal = heat.data.reduce((s, r) => s + r.count, 0);

  return (
    <div className="h-screen overflow-y-auto bg-ms-bg text-ms-text">
      <div className="mx-auto max-w-6xl p-6 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Users size={20} className="text-ms-accent" /> People
            </h1>
            <p className="text-sm text-ms-muted">Who you correspond with, where those conversations live, and when.</p>
          </div>
          <div className="flex rounded-md border border-ms-border overflow-hidden text-xs">
            {Object.keys(RANGES).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 ${r === range ? 'bg-ms-accent text-white' : 'bg-ms-panel text-ms-muted hover:text-ms-text'}`}
              >
                {r === '3m' ? '3 months' : r === '12m' ? '12 months' : '3 years'}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-ms-danger">{error.message}</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Section icon={Users} title="Most corresponded with" right={loading ? 'Loading…' : `${top.length} people`}>
            <ul className="py-1">
              {top.map((p) => (
                <Person key={p.email} person={p} name={displayName(p.email)} max={maxTotal} accent={theme.chart[0]} muted={theme.chart[1]} />
              ))}
              {!loading && top.length === 0 && <li className="px-4 py-6 text-sm text-ms-muted">No conversations in this range.</li>}
            </ul>
            <div className="flex gap-4 px-4 py-2 border-t border-ms-border text-[11px] text-ms-muted">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: theme.chart[0] }} />received</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: theme.chart[1] }} />sent by you</span>
            </div>
          </Section>

          <div className="space-y-5 min-w-0">
            <Section icon={Flame} title="When mail arrives" right={heat.loading ? 'Loading…' : `${heatTotal.toLocaleString()} messages`}>
              <Heatmap rows={heat.data} accent={theme.colors.accent} />
            </Section>

            <Section icon={Clock} title="Lost touch" right={`quiet for ${LOST_AFTER_DAYS / 30}+ months`}>
              <ul className="py-1">
                {lost.map((p) => (
                  <li
                    key={p.email}
                    className="flex items-center gap-3 px-4 py-1.5 cursor-pointer hover:bg-ms-bg"
                    onClick={() => ui.search(`from:${p.email} OR to:${p.email}`)}
                    title={p.email}
                  >
                    <span className="truncate flex-1 text-sm">{displayName(p.email)}</span>
                    <span className="text-xs text-ms-muted tabular-nums">{p.total} msgs</span>
                    <span className="w-16 text-right text-xs text-ms-muted">{ago(p.last)}</span>
                    <button
                      className="text-xs text-ms-accent hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        ui.compose({ to: [p.email] });
                      }}
                    >
                      Say hi
                    </button>
                  </li>
                ))}
                {!allPairs.loading && lost.length === 0 && (
                  <li className="px-4 py-6 text-sm text-ms-muted">Nobody you used to write to has gone quiet.</li>
                )}
                {allPairs.loading && <li className="px-4 py-6 text-sm text-ms-muted">Loading…</li>}
              </ul>
            </Section>
          </div>
        </div>

        <Section icon={Folder} title="People by folder and label" right={byFolder.loading ? 'Loading…' : null}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((f) => (
              <div key={f.id} className="p-4 min-w-0 border-b border-r border-ms-border -mb-px">
                <div className="flex items-center gap-1.5 mb-2">
                  {f.kind === 'label' ? <Tag size={13} className="text-ms-muted" /> : <Folder size={13} className="text-ms-muted" />}
                  <span className="text-sm font-medium truncate flex-1">{f.name}</span>
                  <span className="text-xs text-ms-muted tabular-nums">{f.total}</span>
                </div>
                <ul className="space-y-1">
                  {f.people.map((p) => (
                    <li
                      key={p.email}
                      className={`flex items-center gap-2 text-xs cursor-pointer hover:text-ms-accent ${topEmails.has(p.email) ? 'font-medium' : ''}`}
                      onClick={() => ui.search(`from:${p.email}`)}
                      title={p.email}
                    >
                      <span className="truncate flex-1">{displayName(p.email)}</span>
                      <span className="text-ms-muted tabular-nums">{p.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {!byFolder.loading && folders.length === 0 && (
            <p className="px-4 py-6 text-sm text-ms-muted">No folders or labels with personal mail in this range.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
