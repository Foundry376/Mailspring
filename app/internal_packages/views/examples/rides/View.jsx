import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Car, ParkingSquare, UtensilsCrossed, Receipt, Search, Loader2 } from 'lucide-react';
import { useMessages, useContent, useExtract, useTheme, useViewState, ui } from '@mailspring/view';

const CATEGORIES = [
  { id: 'Rides', icon: Car, domains: ['uber.com', 'lyft.com', 'curb.com', 'via.com', 'waymo.com'] },
  {
    id: 'Parking',
    icon: ParkingSquare,
    domains: ['metropolis.io', 'parkmobile.io', 'spothero.com', 'paybyphone.com'],
  },
  {
    id: 'Food delivery',
    icon: UtensilsCrossed,
    domains: ['doordash.com', 'grubhub.com', 'instacart.com', 'postmates.com', 'seamless.com'],
  },
  { id: 'Other receipts', icon: Receipt, domains: [] },
];

const KNOWN_DOMAINS = CATEGORIES.flatMap((c) => c.domains);
const RANGES = { 12: '12 months', 24: '24 months', 60: '5 years' };

function searchFor(months) {
  const senders = KNOWN_DOMAINS.map((d) => `from:${d}`).join(' OR ');
  return `(${senders} OR subject:receipt OR subject:invoice) since:"${months} months ago"`;
}

function categoryOf(message) {
  const email = (message.from?.email || '').toLowerCase();
  if (/uber\.com$/.test(email) && /eats/i.test(message.subject)) return 'Food delivery';
  const hit = CATEGORIES.find((c) => c.domains.some((d) => email.endsWith(d)));
  return hit ? hit.id : 'Other receipts';
}

function merchantOf(message) {
  const email = message.from?.email || '';
  const domain = email.split('@')[1] || '';
  const name = (message.from?.name || '').replace(/\b(receipts?|billing|no-?reply)\b/gi, '').trim();
  if (name && !/@/.test(name)) return name;
  const root = domain.split('.').slice(-2, -1)[0] || domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

const MONEY = '\\$\\s?(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})|\\d+\\.\\d{2})';
const AMOUNT_PATTERNS = [
  // "Total $12.34", "Amount charged $199.00", "Amount: $8.40 USD"
  new RegExp(
    `\\b(?:Total(?: charged)?|Amount (?:charged|paid|due)|Amount|Grand total)\\b[:\\s]{0,20}(?:USD\\s*)?${MONEY}`,
    'i'
  ),
  // Metropolis puts the value on the line above its label: "$4.99\n\nTotal"
  new RegExp(`${MONEY}\\s*\\n+\\s*Total\\b`, 'i'),
];

function parseReceipt(text) {
  if (!text) return null;
  let amount = null;
  for (const pattern of AMOUNT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      amount = Number(m[1].replace(/,/g, ''));
      break;
    }
  }
  if (amount == null) return null;
  const place = text.match(/Visited on [^\n]+\n+([^\n]+)/i)?.[1]?.trim() || null;
  return { amount, place };
}

function money(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'short', year: '2-digit' });
}

function monthsBetween(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function Stat({ label, value, sub }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-ms-border bg-ms-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ms-muted">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold">{value}</div>
      {sub && <div className="truncate text-xs text-ms-muted">{sub}</div>}
    </div>
  );
}

export default function RidesView() {
  const theme = useTheme();
  const [range, setRange] = useViewState('range', '24');
  const search = searchFor(range);
  const messages = useMessages({ search, limit: 1000 });

  // Thread-level search also returns my replies in matching threads.
  const receipts = useMemo(
    () => messages.data.filter((m) => !m.isSent && !m.draft),
    [messages.data]
  );
  const ids = useMemo(() => receipts.map((m) => m.id), [receipts]);
  const content = useContent(ids);

  const parsed = useMemo(() => {
    const out = {};
    for (const id of ids) {
      const text = content.data[id]?.text;
      if (text != null) out[id] = parseReceipt(text);
    }
    return out;
  }, [ids, content.data]);

  const missed = ids.filter((id) => content.data[id] && parsed[id] == null);
  const ai = useExtract(
    missed.length
      ? {
          ids: missed,
          schema: { total: 'money', merchant: 'string' },
          instructions:
            'The amount the customer paid for this ride, parking session, delivery, or purchase.',
        }
      : null
  );

  const rows = useMemo(() => {
    const out = [];
    for (const m of receipts) {
      const p = parsed[m.id];
      const x = ai.results?.[m.id]?.value;
      const amount = p?.amount ?? x?.total?.amount;
      if (amount == null) continue;
      out.push({
        id: m.id,
        threadId: m.threadId,
        date: m.date,
        month: m.date.slice(0, 7),
        merchant: x?.merchant || merchantOf(m),
        category: categoryOf(m),
        detail: p?.place || m.subject,
        amount,
        source: p ? 'parser' : 'extract',
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [receipts, parsed, ai.results]);

  const chart = useMemo(() => {
    if (!rows.length) return [];
    const months = rows.map((r) => r.month).sort();
    const byMonth = Object.fromEntries(
      monthsBetween(months[0], months[months.length - 1]).map((k) => [
        k,
        { month: monthLabel(k), ...Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) },
      ])
    );
    for (const r of rows) byMonth[r.month][r.category] += r.amount;
    return Object.values(byMonth);
  }, [rows]);

  const usedCategories = CATEGORIES.filter((c) => rows.some((r) => r.category === c.id));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byMerchant = rows.reduce(
    (acc, r) => ({ ...acc, [r.merchant]: (acc[r.merchant] || 0) + r.amount }),
    {}
  );
  const top = Object.entries(byMerchant).sort((a, b) => b[1] - a[1])[0];
  const unread = ids.filter(
    (id) => content.data[id] && parsed[id] == null && !ai.results?.[id]?.value
  ).length;
  const reading =
    content.loading || (ids.length > 0 && Object.keys(content.data).length < ids.length);

  return (
    <div className="h-screen overflow-y-auto bg-ms-bg text-ms-text">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Car size={20} className="text-ms-accent" />
          <h1 className="text-lg font-semibold">Rides &amp; receipts</h1>
          <div className="ml-auto flex overflow-hidden rounded-md border border-ms-border text-xs">
            {Object.entries(RANGES).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={`px-2.5 py-1 ${range === k ? 'bg-ms-accent text-white' : 'text-ms-muted hover:text-ms-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {messages.error && <div className="text-sm text-ms-danger">{messages.error.message}</div>}

        {messages.loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-ms-muted">
            <Loader2 size={16} className="animate-spin" /> Searching your mail for receipts…
          </div>
        ) : receipts.length === 0 ? (
          <div className="py-16 text-center text-sm text-ms-muted">
            No ride, parking, delivery or receipt emails in the last {RANGES[range]}.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <Stat label="Spent" value={money(total)} sub={`last ${RANGES[range]}`} />
              <Stat label="Receipts" value={rows.length} sub={`${receipts.length} emails found`} />
              <Stat
                label="Per month"
                value={money(chart.length ? total / chart.length : 0)}
                sub={`over ${chart.length} months`}
              />
              <Stat
                label="Top merchant"
                value={top ? top[0] : '—'}
                sub={top ? money(top[1]) : ''}
              />
            </div>

            <div className="rounded-lg border border-ms-border bg-ms-panel p-4">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-semibold">Spend per month</span>
                {(reading || ai.status === 'running') && (
                  <span className="flex items-center gap-1 text-xs text-ms-muted">
                    <Loader2 size={12} className="animate-spin" />
                    {ai.status === 'running'
                      ? `Reading receipts ${ai.processed}/${ai.total}`
                      : 'Reading receipts…'}
                  </span>
                )}
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={theme.colors.border} />
                    <XAxis
                      dataKey="month"
                      stroke={theme.colors.muted}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={theme.colors.muted}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(v) => money(v)}
                      cursor={{ fill: theme.colors.border, opacity: 0.4 }}
                      contentStyle={{
                        background: theme.colors.bg,
                        border: `1px solid ${theme.colors.border}`,
                        borderRadius: 6,
                        color: theme.colors.text,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {usedCategories.map((c) => (
                      <Bar
                        key={c.id}
                        dataKey={c.id}
                        stackId="spend"
                        fill={theme.chart[CATEGORIES.indexOf(c)]}
                        maxBarSize={36}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-ms-border bg-ms-panel">
              <div className="flex items-baseline justify-between px-4 pt-3 text-sm">
                <span className="font-semibold">Recent</span>
                <button
                  className="flex items-center gap-1 text-xs text-ms-accent hover:underline"
                  onClick={() => ui.search(search)}
                >
                  <Search size={12} /> Show all {receipts.length} emails
                </button>
              </div>
              <table className="mt-2 w-full table-fixed text-sm">
                <thead>
                  <tr className="text-left text-xs text-ms-muted">
                    <th className="w-24 px-4 py-1 font-normal">Date</th>
                    <th className="w-36 px-2 py-1 font-normal">Merchant</th>
                    <th className="px-2 py-1 font-normal">Details</th>
                    <th className="w-24 px-4 py-1 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((r) => {
                    const Icon = CATEGORIES.find((c) => c.id === r.category).icon;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => ui.showThread(r.threadId)}
                        className="cursor-pointer border-t border-ms-border hover:bg-ms-bg"
                      >
                        <td className="whitespace-nowrap px-4 py-1.5 text-ms-muted">
                          {new Date(r.date).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit',
                          })}
                        </td>
                        <td className="truncate px-2 py-1.5">
                          <Icon size={13} className="mr-1.5 inline text-ms-muted" />
                          {r.merchant}
                        </td>
                        <td className="truncate px-2 py-1.5 text-ms-muted">{r.detail}</td>
                        <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
                          {money(r.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {unread > 0 && (
                <div className="border-t border-ms-border px-4 py-2 text-xs text-ms-muted">
                  {unread} {unread === 1 ? 'email has' : 'emails have'} no amount we could read
                  {ai.status === 'quota' ? ' (extraction quota reached)' : ''}.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
