import { FieldType, Schema, fieldType } from './prompt';

/**
 * Deterministic clean-up of model answers. The model copies values as written ("$1,204.50
 * USD", "Fri, Oct 9", "tomorrow"); this turns them into the types the View asked for, so a
 * small model never has to do arithmetic, currency detection or date math.
 *
 * It is also the hallucination filter. On mail that isn't a receipt, Qwen3.5-0.8B fills a
 * money field 88% of the time with the nearest number, address or time, and a relevance
 * question in the same prompt didn't change that. So copied values must actually occur
 * in the email, money must look like money, and dates must name a day or month.
 */

const CURRENCY_SYMBOLS: { [symbol: string]: string } = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  C$: 'CAD',
  A$: 'AUD',
};

const EMPTY = /^(null|none|n\/a|na|not (stated|provided|available)|unknown|-)?$/i;

function isEmpty(value: any) {
  return (
    value === null || value === undefined || (typeof value === 'string' && EMPTY.test(value.trim()))
  );
}

export function parseNumber(value: any): number | null {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (isEmpty(value)) return null;
  const s = String(value);
  // "1.234,56" (European) vs "1,234.56": the last separator followed by two digits is decimal.
  const match = s.match(/-?\d[\d.,\s]*\d|-?\d/);
  if (!match) return null;
  let digits = match[0].replace(/\s/g, '');
  if (
    /,\d{2}$/.test(digits) &&
    digits.indexOf('.') !== -1 &&
    digits.lastIndexOf('.') < digits.lastIndexOf(',')
  ) {
    digits = digits.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{2})$/.test(digits)) {
    digits = digits.replace(',', '.');
  } else {
    digits = digits.replace(/,/g, '');
  }
  const n = Number(digits);
  return isFinite(n) ? n : null;
}

const CURRENCY_CODES = /\b(USD|EUR|GBP|CAD|AUD|JPY|INR|CHF|SEK|NOK|DKK|MXN|BRL|NZD)\b/i;

// An amount with a currency marker next to it, or with cents. The amount is whichever group
// matched, so "38 minutes $0.00" reads as 0.00, not 38.
const MONEY_TOKEN = new RegExp(
  [
    '(?:[$€£¥₹]|[CA]\\$)\\s?(-?\\d[\\d.,]*\\d|\\d)',
    '(-?\\d[\\d.,]*\\d|\\d)\\s?(?:USD|EUR|GBP|CAD|AUD|JPY|INR|CHF|SEK|NOK|DKK|MXN|BRL|NZD)\\b',
    '(-?\\d[\\d,]*[.,]\\d{2})\\b',
  ].join('|'),
  'i'
);

// Rates and ranges ("$25/hr", "$150K/yr+", "$170K-$225K / year") come from job alerts and
// ads, not from a charge.
const NOT_A_CHARGE = /\d\s*[km]\b|\/\s*[a-z]|\bper\s+[a-z]/i;

/** "$8.40", "Amount: 8.40 USD", "€12,30" but not "1", "$25/hr" or "420 Taylor Street". */
export function looksLikeMoney(value: any): boolean {
  const s = String(value);
  return MONEY_TOKEN.test(s) && !NOT_A_CHARGE.test(s);
}

export function parseMoney(value: any): { amount: number; currency: string } | null {
  if (typeof value === 'number') return { amount: value, currency: 'USD' };
  if (!looksLikeMoney(value)) return null;
  const token = String(value).match(MONEY_TOKEN);
  const amount = parseNumber(token[1] || token[2] || token[3]);
  if (amount === null) return null;
  const s = String(value);
  const code = s.match(CURRENCY_CODES);
  if (code) return { amount, currency: code[1].toUpperCase() };
  const symbol = Object.keys(CURRENCY_SYMBOLS)
    .sort((a, b) => b.length - a.length)
    .find((sym) => s.includes(sym));
  return { amount, currency: symbol ? CURRENCY_SYMBOLS[symbol] : 'USD' };
}

let chrono = null;

/**
 * Resolves "Fri, Oct 9", "tomorrow" or "9/10" against the message's own date, so relative
 * phrases mean what they meant when the email was sent. Returns an ISO string.
 */
export function parseDate(value: any, messageDate: Date): string | null {
  if (isEmpty(value)) return null;
  chrono = chrono || require('chrono-node'); //eslint-disable-line
  const [result] = chrono.parse(String(value), messageDate);
  if (!result) return null;
  // A bare time ("12pm") or a number chrono stretched into a date isn't a date answer.
  const start = result.start;
  if (!['day', 'month', 'weekday'].some((unit) => start.isCertain(unit))) {
    if (!/\b(today|tomorrow|yesterday|tonight)\b/i.test(result.text)) return null;
  }
  const date = start.date();
  return date && !isNaN(date.getTime()) ? date.toISOString() : null;
}

function squash(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a copied value occurs in the email. Numbers are matched by their digits, so "$8.40"
 * is found in "Amount: 8.40 USD"; text is matched case- and whitespace-insensitively.
 */
export function occursIn(value: any, source: string, type: string): boolean {
  const haystack = squash(source);
  if (type === 'money' || type === 'number') {
    // Thousands separators vary between the model's copy and the email ("1204.50", "1,204.50").
    const digits = String(value).match(/\d[\d.,]*\d|\d/);
    return !!digits && haystack.replace(/,/g, '').includes(digits[0].replace(/,/g, ''));
  }
  const needle = squash(String(value));
  return needle.length > 0 && haystack.includes(needle);
}

function normalizeScalar(type: FieldType, value: any, messageDate: Date, source?: string): any {
  if (isEmpty(value)) return null;
  const t = fieldType(type);
  if (source !== undefined && ['string', 'money', 'number'].includes(t)) {
    if (!occursIn(value, source, t)) return null;
  }
  switch (t) {
    case 'number':
      return parseNumber(value);
    case 'money':
      return parseMoney(value);
    case 'date':
      return parseDate(value, messageDate);
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return /^(true|yes)$/i.test(String(value).trim())
        ? true
        : /^(false|no)$/i.test(String(value).trim())
          ? false
          : null;
    case 'enum': {
      const values = (type as any).values as string[];
      const s = String(value).trim().toLowerCase();
      return values.find((v) => v.toLowerCase() === s) || null;
    }
    default: {
      const s = String(value).trim();
      return s ? s.slice(0, 500) : null;
    }
  }
}

function normalizeField(type: FieldType, value: any, messageDate: Date, source?: string): any {
  if (fieldType(type) !== 'list') return normalizeScalar(type, value, messageDate, source);
  if (!Array.isArray(value)) return [];
  const of = (type as any).of;
  if (of && typeof of === 'object' && !('type' in of)) {
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) =>
        Object.fromEntries(
          Object.keys(of).map((f) => [f, normalizeScalar(of[f], item[f], messageDate, source)])
        )
      );
  }
  return value
    .map((v) => normalizeScalar(of || 'string', v, messageDate, source))
    .filter((v) => v !== null);
}

/**
 * Normalizes every field. Returns null when nothing was found, matching the tier-0 contract
 * where `value: null` means "this message doesn't contain it". Pass `source` (the email text
 * the model saw) to drop copied values that don't occur in it.
 */
export function normalizeAnswer(schema: Schema, raw: any, messageDate: Date, source?: string) {
  if (!raw || typeof raw !== 'object') return null;
  const value = {};
  let found = 0;
  for (const field of Object.keys(schema)) {
    const v = normalizeField(schema[field], raw[field], messageDate, source);
    value[field] = v;
    if (v !== null && !(Array.isArray(v) && v.length === 0)) found += 1;
  }
  return found > 0 ? value : null;
}
