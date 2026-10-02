import { QuotedHTMLTransformer } from 'mailspring-exports';

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'BR',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TFOOT',
  'THEAD',
  'TR',
  'UL',
]);
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);

/**
 * Plain text with one line per block element, the shape regex parsers expect ("Total" and
 * its amount on one line, separate from the next row). `textContent` would run every table
 * cell in a receipt together.
 */
function textFromDocument(doc: Document): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.nodeValue.replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName;
    if (SKIPPED_TAGS.has(tag)) return;
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push('\n');
    // Cells in one row stay on one line so "Total | $23.45" can be matched together.
    if (tag === 'TD' || tag === 'TH') out.push(' ');
    node.childNodes.forEach(walk);
    if (block) out.push('\n');
  };
  walk(doc.body);
  return out
    .join('')
    .split('\n')
    .map((line) => line.replace(/(?: |\u00a0|\u200c|\u034f)+/g, ' ').trim())
    .filter((line, idx, lines) => line || (idx > 0 && lines[idx - 1]))
    .join('\n')
    .trim();
}

function parse(html: string) {
  return new DOMParser().parseFromString(html || '', 'text/html');
}

export function bodyText(body: string, { plaintext, includeQuoted }) {
  if (plaintext) return (body || '').trim();
  const html = includeQuoted
    ? body
    : QuotedHTMLTransformer.removeQuotedHTML(body, { keepIfWholeBodyIsQuote: true });
  return textFromDocument(parse(html));
}

// ── schema.org structured data (extraction tier 0) ──────────────────────────
// Many transactional senders embed schema.org markup for Gmail's email markup program
// (https://developers.google.com/workspace/gmail/markup): ParcelDelivery, FlightReservation,
// Order, EventReservation, LodgingReservation. Both JSON-LD and microdata are in use.

function microdataItem(el: Element): any {
  const item: any = {};
  const type = el.getAttribute('itemtype');
  if (type) item['@type'] = type.replace(/^https?:\/\/schema\.org\//, '');
  const visit = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const prop = child.getAttribute('itemprop');
      if (prop) {
        const value = child.hasAttribute('itemscope')
          ? microdataItem(child)
          : child.getAttribute('content') ||
            child.getAttribute('href') ||
            child.getAttribute('datetime') ||
            (child.textContent || '').trim();
        item[prop] = item[prop] === undefined ? value : [].concat(item[prop], value);
      }
      if (!child.hasAttribute('itemscope')) visit(child);
    }
  };
  visit(el);
  return item;
}

export function structuredData(body: string): object[] {
  if (!body || (!body.includes('ld+json') && !body.includes('itemscope'))) return [];
  const doc = parse(body);
  const items: object[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    try {
      items.push(...[].concat(JSON.parse(el.textContent)));
    } catch {
      // Malformed JSON-LD is common in the wild; the remaining blocks are still usable.
    }
  });
  doc.querySelectorAll('[itemscope]').forEach((el) => {
    if (!el.hasAttribute('itemprop')) items.push(microdataItem(el));
  });
  return items;
}
