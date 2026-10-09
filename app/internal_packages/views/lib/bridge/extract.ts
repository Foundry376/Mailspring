import { Message } from 'mailspring-exports';
import { contentFor, messagesWithBodies } from './bodies';
import type { ViewGrant } from './grant';
import {
  FieldType,
  Schema,
  buildPrompt,
  compileJsonSchema,
  emailBlock,
  schemaHash,
} from '../extraction/prompt';
import { normalizeAnswer } from '../extraction/normalize';
import { cancelModelJobsForView, extractionStatus, runModel } from '../extraction/client';

export type { Schema };

/**
 * `ai.extract`. Each message goes through tier 0 first (schema.org markup embedded in the
 * message, see content.ts), and only messages without matching markup go to the on-device
 * model, which runs in a utility process via
 * app/src/browser/extraction-service.ts.
 *
 * Model work runs on this device and isn't metered. If the model isn't downloaded, misses come
 * back `value: null` and progress carries `modelAvailable: false`.
 */

export interface ExtractResult {
  messageId: string;
  value: { [field: string]: any } | null;
  confidence: number;
  tier: 'structured' | 'model';
}

const BATCH_SIZE = 25;
// Small model batches keep progress flowing (one prompt is ~0.5 s on Metal, ~1.8 s on CPU)
// and bound how much queued work a cancelled job leaves behind.
const MODEL_BATCH_SIZE = 4;
const MAX_MESSAGES = 2000;
// Field accuracy of the bundled model on our extraction eval set. Grammar-constrained output has
// no per-answer probability, so model answers report this rather than a made-up score.
const MODEL_CONFIDENCE = 0.9;
const cache = new Map<string, ExtractResult>();
const jobsByView = new Map<string, Set<ExtractJob>>();
const hiddenViews = new Set<string>();

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
  return typeof t === 'string' ? t : (t as any).type;
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
 * Stops every extraction job a View started and drops its queued model prompts. Called when a
 * View reloads or closes; answers already computed stay cached.
 */
export function cancelJobsForView(viewId: string) {
  for (const job of jobsByView.get(viewId) || []) job.cancelled = true;
  jobsByView.delete(viewId);
  return cancelModelJobsForView(viewId);
}

/** Hidden Views' prompts queue behind visible Views' prompts. */
export function setViewVisible(viewId: string, visible: boolean) {
  if (visible) hiddenViews.delete(viewId);
  else hiddenViews.add(viewId);
}

function promptMessage(message: Message, text: string) {
  const from = (message.from && message.from[0]) || ({} as any);
  return {
    fromName: from.name || '',
    fromEmail: from.email || '',
    subject: message.subject || '',
    date: message.date || new Date(),
    text,
  };
}

type Progress = {
  results: ExtractResult[];
  processed: number;
  total: number;
  status: 'running' | 'done';
  modelAvailable?: boolean;
};

/**
 * Runs one job, calling `onProgress` with the results produced since the last call (not
 * cumulative) and the running totals.
 */
export async function runExtractJob(
  grant: ViewGrant,
  ids: string[],
  schema: Schema,
  job: ExtractJob,
  onProgress: (p: Progress) => void,
  opts: { instructions?: string } = {}
) {
  const jobs = jobsByView.get(grant.viewId) || new Set<ExtractJob>();
  jobs.add(job);
  jobsByView.set(grant.viewId, jobs);
  try {
    await run(grant, ids, schema, job, onProgress, opts);
  } finally {
    jobs.delete(job);
  }
}

async function run(
  grant: ViewGrant,
  ids: string[],
  schema: Schema,
  job: ExtractJob,
  onProgress: (p: Progress) => void,
  { instructions }: { instructions?: string }
) {
  const hash = schemaHash(schema, instructions);
  const jsonSchema = compileJsonSchema(schema);
  const targets = ids.slice(0, MAX_MESSAGES);
  const { available: modelAvailable, modelVersion } = await extractionStatus();
  let processed = 0;
  // Includes the model, so switching between Apple's model and Qwen never reuses answers.
  const key = (id: string) => `${id}:${hash}:${modelVersion}`;

  const remember = (result: ExtractResult) => {
    cache.set(key(result.messageId), result);
    return result;
  };

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (job.cancelled) return;
    const batchIds = targets.slice(i, i + BATCH_SIZE);
    const results: ExtractResult[] = [];
    const uncached = batchIds.filter((id) => !cache.has(key(id)));
    const messages = uncached.length ? await messagesWithBodies(grant, uncached) : [];
    const misses: { message: Message; text: string }[] = [];

    for (const id of batchIds) {
      const known = cache.get(key(id));
      if (known) {
        results.push(known);
        processed += 1;
        continue;
      }
      const message = messages.find((m) => m.id === id);
      if (!message) {
        processed += 1;
        continue;
      }
      const content = contentFor(message, { text: true, structured: true });
      const value = extractFromStructured(schema, content.structured);
      if (value || !modelAvailable || !content.text) {
        results.push(
          remember({
            messageId: id,
            value,
            confidence: value ? 1 : 0,
            tier: value ? 'structured' : 'model',
          })
        );
        processed += 1;
        continue;
      }
      misses.push({ message, text: content.text });
    }
    if (results.length || !misses.length) {
      onProgress({ results, processed, total: targets.length, status: 'running', modelAvailable });
    }

    for (let m = 0; m < misses.length; m += MODEL_BATCH_SIZE) {
      if (job.cancelled) return;
      const chunk = misses.slice(m, m + MODEL_BATCH_SIZE);
      const answers = await runModel({
        viewId: grant.viewId,
        priority: hiddenViews.has(grant.viewId) ? 1 : 0,
        schemaHash: hash,
        jsonSchema,
        items: chunk.map(({ message, text }) => ({
          messageId: message.id,
          prompt: buildPrompt(schema, promptMessage(message, text), instructions),
        })),
      });
      if (job.cancelled) return;

      const chunkResults: ExtractResult[] = [];
      chunk.forEach(({ message, text }, idx) => {
        const answer = answers[idx];
        if (!answer) return;
        const value = normalizeAnswer(
          schema,
          answer.value,
          message.date || new Date(),
          emailBlock(promptMessage(message, text))
        );
        chunkResults.push(
          remember({
            messageId: message.id,
            value,
            confidence: value ? MODEL_CONFIDENCE : 0,
            tier: 'model',
          })
        );
        processed += 1;
      });
      onProgress({
        results: chunkResults,
        processed,
        total: targets.length,
        status: 'running',
        modelAvailable,
      });
    }
  }
  onProgress({ results: [], processed, total: targets.length, status: 'done', modelAvailable });
}
