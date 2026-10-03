import React, { useMemo } from 'react';
import { Package, PackageCheck, Truck, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { useMessages, useContent, useExtract, useViewState, ui } from '@mailspring/view';

const CARRIERS = {
  UPS: { domains: ['ups.com'], url: (n) => `https://www.ups.com/track?tracknum=${n}` },
  FedEx: { domains: ['fedex.com'], url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  USPS: {
    domains: ['usps.com'],
    url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  },
  DHL: {
    domains: ['dhl.com'],
    url: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${n}`,
  },
  Amazon: {
    domains: ['amazon.com'],
    url: () => 'https://www.amazon.com/gp/your-account/order-history',
  },
  OnTrac: { domains: ['ontrac.com'], url: (n) => `https://www.ontrac.com/tracking/?number=${n}` },
};

const RETAILER_DOMAINS = [
  'shopify.com',
  'shop.app',
  'narvar.com',
  'aftership.com',
  'route.com',
  'etsy.com',
  'ebay.com',
  'bestbuy.com',
  'target.com',
  'walmart.com',
  'apple.com',
];

const TRACKING_PATTERNS = [
  { carrier: 'UPS', re: /\b(1Z[0-9A-Z]{16})\b/ },
  { carrier: 'Amazon', re: /\b(TBA\d{12})\b/ },
  { carrier: 'USPS', re: /\b(9[2-5]\d{18,20})\b/ },
  {
    carrier: 'FedEx',
    re: /(?:fedex|tracking (?:number|#|no\.?))[^\n\d]{0,40}(\d{12}|\d{15}|\d{20})\b/i,
  },
  { carrier: 'DHL', re: /dhl[^\n\d]{0,40}(\d{10})\b/i },
];

const STATUSES = [
  {
    id: 'exception',
    re: /\b(delivery exception|delayed|unable to deliver|delivery attempt|action required)\b/i,
  },
  {
    id: 'delivered',
    re: /\b(was delivered|has been delivered|delivered\b(?! by| to you by| on or before))/i,
  },
  { id: 'out', re: /\bout for delivery\b/i },
  {
    id: 'transit',
    re: /\b(shipped|on (?:its|the) way|in transit|has left|departed|arriving|shipment)\b/i,
  },
  {
    id: 'ordered',
    re: /\b(order (?:confirmed|received|placed)|thanks for your order|label created)\b/i,
  },
];

const STATUS_LABEL = {
  exception: 'Needs attention',
  delivered: 'Delivered',
  out: 'Out for delivery',
  transit: 'In transit',
  ordered: 'Ordered',
};

const SEARCH_SENDERS = [...Object.values(CARRIERS).flatMap((c) => c.domains), ...RETAILER_DOMAINS];

const SUBJECTS = [
  'shipped',
  'delivered',
  'out for delivery',
  'shipment',
  'tracking',
  'on its way',
  'package',
];

// Day precision keeps the filter identical across renders, so the hook doesn't resubscribe.
const monthsAgo = (months) =>
  new Date(Date.now() - months * 30.44 * 86400000).toISOString().slice(0, 10);

function filterFor(months) {
  return {
    and: [
      {
        or: [
          { from: SEARCH_SENDERS },
          ...SUBJECTS.map((subject) => ({ subject })),
          { text: 'tracking number' },
        ],
      },
      { direction: 'received' },
      { date: { after: monthsAgo(months) } },
    ],
  };
}

// The same mail, as a search-bar query, for "show these in the mailbox".
function searchFor(months) {
  const from = SEARCH_SENDERS.map((d) => `from:${d}`).join(' OR ');
  const subjects = [
    'shipped',
    'delivered',
    '"out for delivery"',
    'shipment',
    'tracking',
    '"on its way"',
    'package',
  ]
    .map((s) => `subject:${s}`)
    .join(' OR ');
  return `(${from} OR ${subjects} OR "tracking number") since:"${months} months ago"`;
}

function senderDomain(m) {
  return (m.from?.email || '').toLowerCase().split('@')[1] || '';
}

function carrierFromSender(m) {
  const domain = senderDomain(m);
  return (
    Object.keys(CARRIERS).find((name) => CARRIERS[name].domains.some((d) => domain.endsWith(d))) ||
    null
  );
}

function isShippingSender(m) {
  const domain = senderDomain(m);
  return SEARCH_SENDERS.some((d) => domain.endsWith(d));
}

function parseShipment(message, text) {
  const haystack = `${message.subject}\n${text || ''}`;
  let tracking = null;
  let carrier = carrierFromSender(message);
  for (const p of TRACKING_PATTERNS) {
    const m = haystack.match(p.re);
    if (m) {
      tracking = m[1];
      carrier = carrier && carrier !== 'Amazon' ? carrier : p.carrier;
      break;
    }
  }
  // Subject first: the body of a "Delivered" email often repeats "shipped" in its history.
  const status =
    STATUSES.find((s) => s.re.test(message.subject))?.id ||
    STATUSES.find((s) => s.re.test(text || ''))?.id ||
    null;
  return { tracking, carrier, status };
}

// The model fills fields for any email it's given, so only an email it classifies as a
// shipment update counts, and a carrier it names must be one we know.
function fromStructured(result) {
  const v = result?.value;
  if (!v || v.kind !== 'shipment update') return null;
  const status = v.status ? String(v.status).toLowerCase() : '';
  const carrier = Object.keys(CARRIERS).find(
    (name) => name.toLowerCase() === String(v.carrier || '').toLowerCase()
  );
  return {
    tracking: v.trackingNumber || null,
    carrier: carrier || null,
    status:
      /deliver(ed)?$/.test(status) && !/out/.test(status)
        ? 'delivered'
        : /out/.test(status)
          ? 'out'
          : /exception|problem/.test(status)
            ? 'exception'
            : status
              ? 'transit'
              : null,
    expected: v.expectedArrival || null,
  };
}

function relativeDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.round(
    (new Date(d.toDateString()) - new Date(new Date().toDateString())) / 86400000
  );
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  if (days === 1) return 'Tomorrow';
  return d.toLocaleDateString([], {
    weekday: days > -7 && days < 7 ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
  });
}

function StatusPill({ status }) {
  const tone =
    status === 'delivered'
      ? 'text-ms-muted border-ms-border'
      : status === 'exception'
        ? 'text-ms-danger border-ms-danger'
        : 'text-ms-accent border-ms-accent';
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {STATUS_LABEL[status] || 'Shipping update'}
    </span>
  );
}

function PackageRow({ pkg }) {
  const carrier = CARRIERS[pkg.carrier];
  const Icon =
    pkg.status === 'delivered' ? PackageCheck : pkg.status === 'exception' ? AlertTriangle : Truck;
  return (
    <div
      onClick={() => ui.showThread(pkg.threadId)}
      className="group flex cursor-pointer items-center gap-3 border-t border-ms-border px-4 py-2.5 hover:bg-ms-bg"
    >
      <Icon
        size={18}
        className={
          pkg.status === 'delivered' ? 'shrink-0 text-ms-muted' : 'shrink-0 text-ms-accent'
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{pkg.subject || '(no subject)'}</span>
        </div>
        <div className="truncate text-xs text-ms-muted">
          {pkg.carrier || pkg.sender}
          {pkg.tracking && <span className="font-mono"> · {pkg.tracking}</span>}
          {pkg.updates > 1 && ` · ${pkg.updates} updates`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill status={pkg.status} />
        <span className="text-[11px] text-ms-muted">
          {pkg.expected && pkg.status !== 'delivered'
            ? `Expected ${relativeDay(pkg.expected)}`
            : relativeDay(pkg.date)}
        </span>
      </div>
      {pkg.tracking && carrier && (
        <button
          title={`Track on ${pkg.carrier}`}
          onClick={(e) => {
            e.stopPropagation();
            ui.openExternal(carrier.url(pkg.tracking));
          }}
          className="shrink-0 rounded p-1 text-ms-muted opacity-0 hover:text-ms-accent group-hover:opacity-100"
        >
          <ExternalLink size={14} />
        </button>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, items, empty }) {
  return (
    <div className="rounded-lg border border-ms-border bg-ms-panel">
      <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <Icon size={15} className="text-ms-muted" />
        {title}
        <span className="ml-auto text-xs font-normal text-ms-muted">{items.length}</span>
      </div>
      {items.map((p) => (
        <PackageRow key={p.key} pkg={p} />
      ))}
      {items.length === 0 && (
        <div className="border-t border-ms-border px-4 py-6 text-center text-xs text-ms-muted">
          {empty}
        </div>
      )}
    </div>
  );
}

export default function PackagesView() {
  const [months, setMonths] = useViewState('months', 3);
  const search = searchFor(months);
  const messages = useMessages({ where: filterFor(months), limit: 400 });
  const incoming = messages.data;
  const ids = useMemo(() => incoming.map((m) => m.id), [incoming]);
  const content = useContent(ids);

  const parsed = useMemo(() => {
    const out = {};
    for (const m of incoming) {
      if (content.data[m.id]) out[m.id] = parseShipment(m, content.data[m.id].text);
    }
    return out;
  }, [incoming, content.data]);

  // Ask the model only about mail that already looks like shipping: a carrier or store sender,
  // or a shipping status in the subject or body. Everything else is a keyword false positive.
  const byId = useMemo(() => new Map(incoming.map((m) => [m.id, m])), [incoming]);
  const missed = ids.filter((id) => {
    const p = parsed[id];
    return p && !p.tracking && (isShippingSender(byId.get(id)) || p.status);
  });
  const extracted = useExtract(
    missed.length
      ? {
          ids: missed,
          instructions:
            'Decide whether this email is a notification about a physical package being shipped or delivered to the reader. Newsletters, marketing, receipts for digital goods, and articles that mention shipping are "other".',
          schema: {
            kind: {
              type: 'enum',
              values: ['shipment update', 'order confirmation', 'marketing', 'other'],
            },
            carrier: 'string',
            trackingNumber: 'string',
            status: {
              type: 'enum',
              values: ['ordered', 'in transit', 'out for delivery', 'delivered', 'exception'],
            },
            expectedArrival: 'date',
          },
        }
      : null
  );

  const packages = useMemo(() => {
    const groups = new Map();
    for (const m of [...incoming].sort((a, b) => a.date.localeCompare(b.date))) {
      const p = parsed[m.id];
      if (!p) continue;
      const s = fromStructured(extracted.results?.[m.id]);
      const tracking = p.tracking || s?.tracking || null;
      const status = p.status || s?.status || null;
      // Keyword hits from newsletters and neighborhood posts aren't packages. Require a tracking
      // number found in the text (with a shipping sender or status), or the model's confirmation
      // that this is a shipment update.
      const regexEvidence = p.tracking && (isShippingSender(m) || p.status);
      if (!regexEvidence && !s) continue;
      const key = tracking || m.threadId;
      const prev = groups.get(key);
      groups.set(key, {
        key,
        threadId: m.threadId,
        subject: m.subject,
        sender: m.from?.name || m.from?.email,
        carrier: p.carrier || s?.carrier || prev?.carrier || null,
        tracking,
        status: status || prev?.status || 'transit',
        expected: s?.expected || prev?.expected || null,
        date: m.date,
        updates: (prev?.updates || 0) + 1,
      });
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [incoming, parsed, extracted.results]);

  const arriving = packages.filter((p) => p.status !== 'delivered');
  const delivered = packages.filter((p) => p.status === 'delivered');
  const reading = ids.length > 0 && Object.keys(content.data).length < ids.length;

  return (
    <div className="h-screen overflow-y-auto bg-ms-bg text-ms-text">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Package size={20} className="text-ms-accent" />
          <h1 className="text-lg font-semibold">Packages</h1>
          {(messages.loading || reading || extracted.status === 'running') && (
            <span className="flex items-center gap-1 text-xs text-ms-muted">
              <Loader2 size={12} className="animate-spin" />
              {messages.loading
                ? 'Searching…'
                : reading
                  ? `Reading ${Object.keys(content.data).length}/${ids.length} emails…`
                  : `Checking store markup ${extracted.processed}/${extracted.total}…`}
            </span>
          )}
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="ml-auto rounded-md border border-ms-border bg-ms-panel px-2 py-1 text-xs text-ms-text"
          >
            <option value={1}>Last month</option>
            <option value={3}>Last 3 months</option>
            <option value={12}>Last year</option>
            <option value={36}>Last 3 years</option>
          </select>
        </div>
        {messages.error && <div className="text-sm text-ms-danger">{messages.error.message}</div>}

        <Section
          title="Arriving"
          icon={Truck}
          items={arriving}
          empty={
            messages.loading || reading
              ? 'Looking for shipping notifications…'
              : 'Nothing on the way.'
          }
        />
        <Section
          title="Delivered"
          icon={PackageCheck}
          items={delivered}
          empty={messages.loading || reading ? '…' : 'No deliveries in this period.'}
        />
        {!messages.loading && !reading && (
          <div className="text-xs text-ms-muted">
            Checked {incoming.length} emails from carriers, stores and shipping-related subjects.{' '}
            <button className="text-ms-accent hover:underline" onClick={() => ui.search(search)}>
              Show them
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
