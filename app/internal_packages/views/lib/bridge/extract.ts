import { contentFor, messagesWithBodies } from './bodies';
import type { ViewGrant } from './grant';

/**
 * `ai.extract`, tier 0 only: values come from schema.org markup embedded in the message
 * (see content.ts). The on-device model tiers in the plan (§9) don't exist yet, so a message
 * without matching markup yields `value: null`. Jobs, streaming progress, caching, and the
 * quota stop are real, so Views written against this keep working when model tiers land.
 *
 * `core.views.extractQuotaForTesting` (a number) simulates the `smart-extraction` quota:
 * after that many messages miss tier 0 and would have needed the model, the job stops with
 * status 'quota'.
 */

type ScalarType = 'string' | 'number' | 'money' | 'date' | 'boolean';
type FieldType =
  | ScalarType
  | { type: 'enum'; values: string[]; description?: string }
  | { type: ScalarType; description?: string }
  | { type: 'list'; of: any };
export type Schema = { [field: string]: FieldType };

export interface ExtractResult {
  messageId: string;
  value: { [field: string]: any } | null;
  confidence: number;
  tier: 'structured' | 'model';
}

const BATCH_SIZE = 25;
const MAX_MESSAGES = 2000;
const cache = new Map<string, ExtractResult>();

// Field names agents tend to write, mapped to the schema.org properties that carry them.
const SYNONYMS: { [field: string]: string[] } = {
  carrier: ['carrier', 'provider'],
  trackingnumber: ['trackingNumber'],
  trackingurl: ['trackingUrl'],
  expecteddelivery: ['expectedArrivalUntil', 'expectedArrivalFrom'],
  eta: ['expectedArrivalUntil', 'expectedArrivalFrom'],
  status: ['deliveryStatus', 'orderStatus', 'reservationStatus'],
  total: ['totalPrice', 'price', 'totalPaymentDue'],
  amount: ['totalPrice', 'price', 'totalPaymentDue'],
  merchant: ['merchant', 'seller', 'broker'],
  vendor: ['merchant', 'seller', 'broker'],
  ordernumber: ['orderNumber', 'confirmationNumber'],
  confirmation: ['reservationNumber', 'confirmationNumber', 'orderNumber'],
  date: ['startDate', 'departureTime', 'checkinDate', 'orderDate'],
};

function fieldType(t: FieldType): string {
  return typeof t === 'string' ? t : t.type;
}

function findProperty(node: any, names: string[], depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 6) return undefined;
  for (const key of Object.keys(node)) {
    if (names.some((n) => n.toLowerCase() === key.toLowerCase())) return node[key];
  }
  for (const value of Object.values(node)) {
    const found = findProperty(value, names, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function scalar(value: any): any {
  if (Array.isArray(value)) return scalar(value[0]);
  if (value && typeof value === 'object') {
    return value.name ?? value['@id'] ?? value.url ?? value.price ?? value['@type'] ?? null;
  }
  return value;
}

function normalize(type: FieldType, raw: any, item: any): any {
  const value = scalar(raw);
  if (value === undefined || value === null || value === '') return null;
  switch (fieldType(type)) {
    case 'number': {
      const n = Number(String(value).replace(/[^\d.-]/g, ''));
      return isNaN(n) ? null : n;
    }
    case 'money': {
      const amount = Number(String(value).replace(/[^\d.-]/g, ''));
      if (isNaN(amount)) return null;
      const currency = scalar(findProperty(item, ['priceCurrency', 'currency'])) || 'USD';
      return { amount, currency };
    }
    case 'date': {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString();
    }
    case 'boolean':
      return value === true || /^(true|yes|1)$/i.test(String(value));
    case 'enum': {
      const text = String(value)
        .replace(/^https?:\/\/schema\.org\//, '')
        .toLowerCase();
      const values = (type as any).values as string[];
      return (
        values.find((v) => v.toLowerCase() === text) ||
        values.find((v) => text.includes(v.toLowerCase().replace(/[^a-z]/g, ''))) ||
        null
      );
    }
    case 'list':
      return [].concat(raw).map((v) => scalar(v));
    default:
      return String(value);
  }
}

function extractFromStructured(schema: Schema, items: object[]): { [field: string]: any } | null {
  for (const item of items) {
    const value = {};
    let hits = 0;
    for (const [field, type] of Object.entries(schema)) {
      const names = [field, ...(SYNONYMS[field.toLowerCase()] || [])];
      const found = normalize(type, findProperty(item, names), item);
      value[field] = found;
      if (found !== null) hits += 1;
    }
    if (hits > 0) return value;
  }
  return null;
}

export function validateSchema(schema: any): Schema {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('schema must be an object of field types');
  }
  const fields = Object.keys(schema);
  if (fields.length === 0 || fields.length > 12) {
    throw new Error('schema must have between 1 and 12 fields');
  }
  for (const field of fields) {
    const t = fieldType(schema[field]);
    if (!['string', 'number', 'money', 'date', 'boolean', 'enum', 'list'].includes(t)) {
      throw new Error(`schema field "${field}" has unknown type "${t}"`);
    }
    if (t === 'enum' && !Array.isArray(schema[field].values)) {
      throw new Error(`enum field "${field}" needs a values array`);
    }
  }
  return schema;
}

export interface ExtractJob {
  cancelled: boolean;
}

/**
 * Runs one job, calling `onProgress` after each batch with the results produced in that
 * batch (not cumulative) and the running totals.
 */
export async function runExtractJob(
  grant: ViewGrant,
  ids: string[],
  schema: Schema,
  job: ExtractJob,
  onProgress: (p: {
    results: ExtractResult[];
    processed: number;
    total: number;
    status: 'running' | 'done' | 'quota';
  }) => void
) {
  const schemaKey = JSON.stringify(schema);
  const targets = ids.slice(0, MAX_MESSAGES);
  const quota = AppEnv.config.get('core.views.extractQuotaForTesting');
  let modelUnits = 0;
  let processed = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (job.cancelled) return;
    const batchIds = targets.slice(i, i + BATCH_SIZE);
    const results: ExtractResult[] = [];
    const uncached = batchIds.filter((id) => !cache.has(`${id}:${schemaKey}`));
    const messages = uncached.length ? await messagesWithBodies(grant, uncached) : [];

    for (const id of batchIds) {
      const key = `${id}:${schemaKey}`;
      if (cache.has(key)) {
        results.push(cache.get(key));
        processed += 1;
        continue;
      }
      const message = messages.find((m) => m.id === id);
      if (!message) {
        processed += 1;
        continue;
      }
      const structured = contentFor(message, { text: false, structured: true }).structured;
      const value = extractFromStructured(schema, structured);
      if (!value && typeof quota === 'number' && modelUnits >= quota) {
        onProgress({ results, processed, total: targets.length, status: 'quota' });
        return;
      }
      if (!value) modelUnits += 1;
      const result: ExtractResult = {
        messageId: id,
        value,
        confidence: value ? 1 : 0,
        tier: value ? 'structured' : 'model',
      };
      cache.set(key, result);
      results.push(result);
      processed += 1;
    }
    onProgress({
      results,
      processed,
      total: targets.length,
      status: processed >= targets.length ? 'done' : 'running',
    });
  }
  if (targets.length === 0) onProgress({ results: [], processed: 0, total: 0, status: 'done' });
}
