import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Car,
  ParkingSquare,
  UtensilsCrossed,
  Plane,
  ShoppingBag,
  Cloud,
  Zap,
  HeartPulse,
  Receipt,
  Search,
  Loader2,
  X,
} from 'lucide-react';
import {
  useMessages,
  useContent,
  useExtract,
  useTheme,
  useViewState,
  ui,
  threadProps,
  ThreadActions,
} from '@mailspring/view';

// `query: true` categories also widen the search: their senders' transactional mail counts even
// without "receipt" in the subject. The rest only sort receipts the search already found, so
// a retailer's "Your order has shipped" doesn't double-count its order confirmation.
// Categories are checked in order, so aws.amazon.com is Software before amazon.com is Shopping.
const CATEGORIES = [
  {
    id: 'Rides',
    icon: Car,
    query: true,
    domains: [
      'uber.com',
      'lyft.com',
      'lyftmail.com',
      'lyftbikes.com',
      'curb.com',
      'via.com',
      'waymo.com',
    ],
  },
  {
    id: 'Parking',
    icon: ParkingSquare,
    query: true,
    domains: ['metropolis.io', 'parkmobile.io', 'spothero.com', 'paybyphone.com'],
  },
  {
    id: 'Food & dining',
    icon: UtensilsCrossed,
    query: true,
    domains: [
      'doordash.com',
      'grubhub.com',
      'instacart.com',
      'postmates.com',
      'seamless.com',
      'toasttab.com',
    ],
    subject: /restaurant|dining|\bmeal\b|\bcafe\b|coffee/i,
  },
  {
    id: 'Travel',
    icon: Plane,
    domains: [
      'delta.com',
      'united.com',
      'aa.com',
      'southwest.com',
      'luv.southwest.com',
      'jetblue.com',
      'alaskaair.com',
      'airbnb.com',
      'hoteltonight.com',
      'booking.com',
      'expedia.com',
      'hotels.com',
      'vrbo.com',
      'marriott.com',
      'hilton.com',
      'hyatt.com',
      'ihg.com',
      'amtrak.com',
      'hertz.com',
      'avis.com',
      'enterprise.com',
      'nationalcar.com',
      'turo.com',
    ],
    subject: /flight|itinerary|e-?ticket|hotel|reservation|check-?in|boarding/i,
  },
  {
    id: 'Software & services',
    icon: Cloud,
    domains: [
      'aws.amazon.com',
      'apple.com',
      'google.com',
      'microsoft.com',
      'github.com',
      'heroku.com',
      'sentry.io',
      'digitalocean.com',
      'vercel.com',
      'cloudflare.com',
      'godaddy.com',
      'namecheap.com',
      'squarespace.com',
      'adobe.com',
      'dropbox.com',
      'slack.com',
      'zoom.us',
      'notion.so',
      'figma.com',
      'atlassian.com',
      'linear.app',
      'openai.com',
      'anthropic.com',
      '1password.com',
      'zenledger.io',
      'cointracker.io',
      'intuit.com',
      'netflix.com',
      'spotify.com',
      'hulu.com',
      'disneyplus.com',
      'nytimes.com',
    ],
    subject: /subscription|renewal|domain|hosting|\bplan\b|license/i,
  },
  {
    id: 'Shopping',
    icon: ShoppingBag,
    domains: [
      'amazon.com',
      'target.com',
      'walmart.com',
      'bestbuy.com',
      'costco.com',
      'etsy.com',
      'ebay.com',
      'shopify.com',
      'shop.app',
      'homedepot.com',
      'lowes.com',
      'ikea.com',
      'wayfair.com',
      'rei.com',
      'nike.com',
      // Carriers bill for duties and shipping on things bought abroad.
      'dhl.com',
      'ups.com',
      'fedex.com',
    ],
    subject: /\border\b|purchase|in-store receipt/i,
  },
  {
    id: 'Bills & services',
    icon: Zap,
    domains: [
      'comcast.com',
      'xfinity.com',
      'att.com',
      'verizon.com',
      't-mobile.com',
      'spectrum.com',
      'spectrum.net',
      'googlefiber.net',
    ],
    subject: /utilit|electric|\bwater\b|\bgas bill|internet|wireless|\bphone bill|appointment/i,
    // Accountants, lawyers and personal services bill under a firm name, not a known domain.
    names: /\bp\.?l\.?l\.?c\b|\bcpa\b|\blaw\b|barber|salon|\bspa\b|cleaning|plumbing|electric/i,
  },
  {
    id: 'Health',
    icon: HeartPulse,
    domains: [
      'questdiagnostics.com',
      'labcorp.com',
      'cvs.com',
      'walgreens.com',
      'onemedical.com',
      'zocdoc.com',
    ],
    subject: /pharmacy|prescription|\blab\b|medical|clinic|dental|copay|patient/i,
  },
  { id: 'Other', icon: Receipt, domains: [] },
];

const KNOWN_DOMAINS = CATEGORIES.filter((c) => c.query).flatMap((c) => c.domains);
const RANGES = { 12: '12 months', 24: '24 months', 60: '5 years' };

// Known senders also send promos, policy notices and sign-in codes; only these subjects are
// transactional ("Your Monday trip with Uber", "Metropolis Parking Payment", "Order Confirmation").
const KNOWN_SENDER_SUBJECTS = ['receipt', 'invoice', 'trip with', 'your ride', 'order', 'payment'];

// Mail from personal mailboxes that says "receipt" or "invoice" is a forward, a conversation
// about a bill, or phishing ("Renewal Receipt for Your McAfee…"), never the merchant's receipt.
const PERSONAL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
];

const REPLY_SUBJECT = /^\s*(?:re|fwd?|aw|wg)\s*:/i;
// Bills ask for money that a later "Payment Confirmation" / "Payment Received" email records,
// so counting both would double the spend.
const BILL_SUBJECT =
  /\b(?:reminder|notification|payment request|new invoice|received an invoice|updated your invoice|invoice from)\b|^\s*invoice\s*#?\s*\d/i;

// Day precision keeps the filter identical across renders, so the hook doesn't resubscribe.
const monthsAgo = (months) =>
  new Date(Date.now() - months * 30.44 * 86400000).toISOString().slice(0, 10);

function filterFor(months) {
  return {
    and: [
      {
        or: [
          {
            and: [
              { from: KNOWN_DOMAINS },
              { or: KNOWN_SENDER_SUBJECTS.map((s) => ({ subject: s })) },
            ],
          },
          { subject: 'receipt' },
          { subject: 'invoice' },
        ],
      },
      { not: { from: PERSONAL_DOMAINS } },
      { direction: 'received' },
      { date: { after: monthsAgo(months) } },
    ],
  };
}

// The same mail, as a search-bar query, for "show these in the mailbox".
function searchFor(months) {
  const senders = KNOWN_DOMAINS.map((d) => `from:${d}`).join(' OR ');
  return `(${senders} OR subject:receipt OR subject:invoice) since:"${months} months ago"`;
}

function isCandidate(message) {
  const subject = message.subject || '';
  return !REPLY_SUBJECT.test(subject) && !BILL_SUBJECT.test(subject);
}

function categoryOf(message) {
  const email = (message.from?.email || '').toLowerCase();
  const subject = message.subject || '';
  if (/uber\.com$/.test(email) && /eats/i.test(subject)) return 'Food & dining';
  // Whole domains only: "aa.com" mustn't match baa.com, nor "att.com" matt.com.
  const bySender = CATEGORIES.find((c) =>
    c.domains.some((d) => email.endsWith(`@${d}`) || email.endsWith(`.${d}`))
  );
  if (bySender) return bySender.id;
  // Payment processors (Stripe, Square) send on a merchant's behalf, and only the sender name
  // says who: "Sentry <receipts@stripe.com>" is a sentry.io receipt.
  const name = (message.from?.name || '').toLowerCase();
  const byName = CATEGORIES.find(
    (c) =>
      (c.names && c.names.test(`${name} ${subject}`)) ||
      c.domains.some((d) => {
        // The first label: aws.amazon.com is "aws", so Amazon.com orders stay in Shopping.
        const root = d.split('.')[0];
        return root.length > 3 && new RegExp(`\\b${root}\\b`).test(name);
      })
  );
  if (byName) return byName.id;
  const bySubject = CATEGORIES.find((c) => c.subject && c.subject.test(subject));
  return bySubject ? bySubject.id : 'Other';
}

function merchantOf(message) {
  const email = message.from?.email || '';
  const domain = email.split('@')[1] || '';
  const name = (message.from?.name || '').replace(/\b(receipts?|billing|no-?reply)\b/gi, '').trim();
  if (name && !/@/.test(name)) return name;
  const root = domain.split('.').slice(-2, -1)[0] || domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d{2})?|\\d+(?:\\.\\d{2})?';
const CENTS = '\\d{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+\\.\\d{2}';
// "$12.34", "$225", "$ 8.40 USD", "USD 33.44" (DHL), "298.20 USD" (United)
const MONEY = `(?:\\$\\s?(${NUM})|(?:USD|US\\$)\\s?(${CENTS})|(${CENTS})\\s?USD\\b)`;
const labeled = (labels, sep = '[:\\s]{0,20}') => new RegExp(`\\b(?:${labels})${sep}${MONEY}`, 'i');

// Most specific label first: a receipt often lists a subtotal, fees and tip before the total.
const AMOUNT_PATTERNS = [
  // "Total paid $57.20" (Boulevard), "Total Charged - $2.95" (Delta), "You paid $400.00" (Intuit)
  labeled(
    'Total (?:charged|paid)|Amount (?:charged|paid)|You paid|Grand total|Order total|Total amount',
    '[:\\s-]{0,20}'
  ),
  // "Total $41.65", "Total (USD) $805.96" (Airbnb); United lists "Total Per Passenger" first
  labeled('Total(?!\\s*per\\b)(?:\\s*\\(USD\\))?'),
  // "Amount: $44.00 USD" (Sentry), "TICKET AMOUNT $346.97 USD" (Delta)
  labeled('Amount'),
  // Metropolis puts the value on the line above a bare "Total" label
  new RegExp(`^\\s*${MONEY}\\s*\\n+\\s*Total\\s*$`, 'im'),
  // Lyft daily bike receipts only state the charge on the card line: "Visa *1234 $10.33"
  new RegExp(
    `\\b(?:Visa|Mastercard|Amex|American Express|Discover)\\b[^\\n$]{0,30}${MONEY}\\s*$`,
    'im'
  ),
];

// Uber sends a "charge summary" when the trip ends and the receipt after the tip settles;
// Lyft sends one email per bike ride and bills them all in a daily receipt.
const NOT_A_RECEIPT = /not a payment receipt|billed at end of day/i;

function parseReceipt(text) {
  if (!text) return null;
  if (NOT_A_RECEIPT.test(text)) return { skip: true };
  for (const pattern of AMOUNT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const amount = Number((m[1] || m[2] || m[3]).replace(/,/g, ''));
      const place = text.match(/Visited on [^\n]+\n+([^\n]+)/i)?.[1]?.trim() || null;
      return { amount, place };
    }
  }
  return null;
}

function money(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function monthLabel(key, opts = { month: 'short', year: '2-digit' }) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], opts);
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

function CategoryLegend({ categories, colorOf, selected, onSelect }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {categories.map((c) => {
        const active = selected === c.id;
        const dimmed = selected && !active;
        return (
          <button
            key={c.id}
            aria-pressed={active}
            onClick={() => onSelect(active ? null : c.id)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${
              active
                ? 'border-ms-accent text-ms-text'
                : 'border-transparent text-ms-muted hover:text-ms-text'
            } ${dimmed ? 'opacity-50' : ''}`}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(c) }} />
            {c.id}
          </button>
        );
      })}
    </div>
  );
}

// The share of spend per category. It follows the month filter but not the category filter:
// clicking a slice or row selects that category everywhere else, and the other slices stay
// visible (dimmed) so the choice can be changed from here.
function WhereItWent({ rows, colorOf, selected, onSelect, monthName, theme }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const slices = CATEGORIES.map((c) => {
    const own = rows.filter((r) => r.category === c.id);
    return { category: c, amount: own.reduce((s, r) => s + r.amount, 0), count: own.length };
  })
    .filter((x) => x.count > 0)
    // Biggest first, with Other last however big it is: it's the remainder, not a category.
    .sort(
      (a, b) => (a.category.id === 'Other') - (b.category.id === 'Other') || b.amount - a.amount
    );
  const toggle = (id) => onSelect(selected === id ? null : id);
  const faded = (id) => (selected && selected !== id ? 0.3 : 1);

  return (
    <div className="rounded-lg border border-ms-border bg-ms-panel p-4">
      <div className="mb-3 flex items-baseline gap-x-3 text-sm">
        <span className="font-semibold">Where it went</span>
        {monthName && <span className="text-xs text-ms-muted">{monthName}</span>}
      </div>
      {slices.length === 0 ? (
        <div className="py-6 text-center text-sm text-ms-muted">No receipts in this month.</div>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="h-40 w-40 shrink-0 cursor-pointer [&_*]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer={false}>
                <Pie
                  data={slices}
                  dataKey="amount"
                  nameKey="category.id"
                  innerRadius="45%"
                  outerRadius="100%"
                  stroke={theme.colors.panel}
                  isAnimationActive={false}
                  onClick={(slice) => toggle(slice.payload.category.id)}
                >
                  {slices.map((x) => (
                    <Cell
                      key={x.category.id}
                      fill={colorOf(x.category)}
                      fillOpacity={faded(x.category.id)}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="min-w-[240px] flex-1 space-y-1">
            {slices.map(({ category: c, amount, count }) => {
              const Icon = c.icon;
              const share = total ? amount / total : 0;
              return (
                <button
                  key={c.id}
                  aria-pressed={selected === c.id}
                  onClick={() => toggle(c.id)}
                  style={{ opacity: faded(c.id) }}
                  className={`block w-full rounded-md border px-2 py-1.5 text-left ${
                    selected === c.id ? 'border-ms-accent' : 'border-transparent hover:bg-ms-bg'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: colorOf(c) }}
                    />
                    <Icon size={14} className="shrink-0 text-ms-muted" />
                    <span className="truncate">{c.id}</span>
                    <span className="shrink-0 text-xs text-ms-muted">
                      {count} {count === 1 ? 'receipt' : 'receipts'}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums">{money(amount)}</span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ms-muted">
                      {Math.round(share * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ms-bg">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share * 100}%`, background: colorOf(c) }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RidesView() {
  const theme = useTheme();
  const [range, setRange] = useViewState('range', '24');
  const [month, setMonth] = useState(null);
  const [category, setCategory] = useState(null);
  const search = searchFor(range);
  const messages = useMessages({ where: filterFor(range), limit: 1000 });
  const receipts = useMemo(() => messages.data.filter(isCandidate), [messages.data]);
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

  // Newsletter mail (List-Unsubscribe) only counts when a labelled total parses: the model
  // reads "$15 off your next visit" in a promo as a charge.
  const missed = receipts
    .filter((m) => content.data[m.id] && parsed[m.id] == null && !m.listUnsubscribe)
    .map((m) => m.id);
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
      if (p?.skip) continue;
      const x = m.listUnsubscribe ? null : ai.results?.[m.id]?.value;
      const amount = p?.amount ?? x?.total?.amount;
      // $0.00 receipts are validated parking sessions and the like: real, but not spend.
      if (!amount) continue;
      out.push({
        id: m.id,
        threadId: m.threadId,
        date: m.date,
        month: m.date.slice(0, 7),
        merchant: x?.merchant || merchantOf(m),
        category: categoryOf(m),
        detail: p?.place || m.subject,
        amount,
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
        { key: k, month: monthLabel(k), ...Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) },
      ])
    );
    for (const r of rows) byMonth[r.month][r.category] += r.amount;
    return Object.values(byMonth);
  }, [rows]);

  const usedCategories = CATEGORIES.filter((c) => rows.some((r) => r.category === c.id));
  // Eight chart colors for the eight named categories; Other stays neutral.
  const colorOf = (c) =>
    c.id === 'Other' ? theme.colors.muted : theme.chart[CATEGORIES.indexOf(c) % theme.chart.length];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byMerchant = rows.reduce(
    (acc, r) => ({ ...acc, [r.merchant]: (acc[r.merchant] || 0) + r.amount }),
    {}
  );
  const top = Object.entries(byMerchant).sort((a, b) => b[1] - a[1])[0];
  const unread = receipts.filter(
    (m) =>
      content.data[m.id] && parsed[m.id] == null && !m.listUnsubscribe && !ai.results?.[m.id]?.value
  ).length;
  const reading =
    content.loading || (ids.length > 0 && Object.keys(content.data).length < ids.length);

  const filtered = rows.filter(
    (r) => (!month || r.month === month) && (!category || r.category === category)
  );
  const filtering = Boolean(month || category);
  const shown = filtering ? filtered : rows.slice(0, 30);
  const filteredTotal = filtered.reduce((s, r) => s + r.amount, 0);

  const onChartClick = (state) => {
    const entry = chart[Number(state?.activeTooltipIndex)];
    if (entry) setMonth(month === entry.key ? null : entry.key);
  };
  const dimmed = (entry, c) =>
    (month && entry.key !== month) || (category && c.id !== category) ? 0.25 : 1;

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
                onClick={() => {
                  setRange(k);
                  setMonth(null);
                }}
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
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-semibold">Spend per month</span>
                <span className="text-xs text-ms-muted">Click a month or category to filter</span>
                {(reading || ai.status === 'running') && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-ms-muted">
                    <Loader2 size={12} className="animate-spin" />
                    {ai.status === 'running'
                      ? `Reading receipts ${ai.processed}/${ai.total}`
                      : 'Reading receipts…'}
                  </span>
                )}
              </div>
              {/* The chart is clicked, not tabbed through: no focus ring around it. */}
              <div className="h-64 cursor-pointer [&_*]:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chart}
                    accessibilityLayer={false}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                    onClick={onChartClick}
                  >
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
                    {usedCategories.map((c) => (
                      <Bar
                        key={c.id}
                        dataKey={c.id}
                        stackId="spend"
                        fill={colorOf(c)}
                        maxBarSize={36}
                        isAnimationActive={false}
                      >
                        {chart.map((entry) => (
                          <Cell key={entry.key} fillOpacity={dimmed(entry, c)} />
                        ))}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <CategoryLegend
                categories={usedCategories}
                colorOf={colorOf}
                selected={category}
                onSelect={setCategory}
              />
            </div>

            <WhereItWent
              rows={month ? rows.filter((r) => r.month === month) : rows}
              colorOf={colorOf}
              selected={category}
              onSelect={setCategory}
              monthName={month && monthLabel(month, { month: 'long', year: 'numeric' })}
              theme={theme}
            />

            <div className="rounded-lg border border-ms-border bg-ms-panel">
              <div className="flex flex-wrap items-baseline gap-x-3 px-4 pt-3 text-sm">
                <span className="font-semibold">
                  {filtering
                    ? [month && monthLabel(month, { month: 'long', year: 'numeric' }), category]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Recent'}
                </span>
                {filtering && (
                  <>
                    <span className="text-xs text-ms-muted">
                      {filtered.length} {filtered.length === 1 ? 'receipt' : 'receipts'} ·{' '}
                      {money(filteredTotal)}
                    </span>
                    <button
                      className="text-xs text-ms-accent hover:underline"
                      onClick={() => {
                        setMonth(null);
                        setCategory(null);
                      }}
                    >
                      <X size={12} className="mr-1 inline align-[-2px]" />
                      Clear filter
                    </button>
                  </>
                )}
                <button
                  className="ml-auto text-xs text-ms-accent hover:underline"
                  onClick={() => ui.search(search)}
                >
                  <Search size={12} className="mr-1 inline align-[-2px]" />
                  Show all {receipts.length} emails
                </button>
              </div>
              <table className="mt-2 w-full table-fixed text-sm">
                <thead>
                  <tr className="text-left text-xs text-ms-muted">
                    <th className="w-24 px-4 py-1 font-normal">Date</th>
                    <th className="w-36 px-2 py-1 font-normal">Merchant</th>
                    <th className="px-2 py-1 font-normal">Details</th>
                    <th className="w-24 px-4 py-1 text-right font-normal">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const Icon = CATEGORIES.find((c) => c.id === r.category).icon;
                    return (
                      <tr
                        key={r.id}
                        {...threadProps(r.threadId)}
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
                        <td className="pr-2">
                          <ThreadActions thread={r.threadId} />
                        </td>
                      </tr>
                    );
                  })}
                  {filtering && filtered.length === 0 && (
                    <tr className="border-t border-ms-border">
                      <td colSpan={5} className="px-4 py-3 text-center text-xs text-ms-muted">
                        No receipts match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {unread > 0 && (
                <div className="border-t border-ms-border px-4 py-2 text-xs text-ms-muted">
                  {unread} {unread === 1 ? 'email has' : 'emails have'} no amount we could read.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
