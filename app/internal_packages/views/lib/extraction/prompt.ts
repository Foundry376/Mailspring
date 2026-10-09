import crypto from 'crypto';

/**
 * Turns a View's flat extraction schema into the prompt and JSON schema the on-device model
 * runs. The host owns this template:
 * Views send only field names, types and short descriptions. Hints never contain sample values:
 * a 0.8B model copies them into its answers (an `e.g. "$23.10"` hint became the total of
 * every marketing email that mentioned no price), and a worked example with unrelated field
 * names measured worse than none.
 */

export type ScalarType = 'string' | 'number' | 'money' | 'date' | 'boolean';
export type FieldType =
  | ScalarType
  | { type: 'enum'; values: string[]; description?: string }
  | { type: ScalarType; description?: string }
  | { type: 'list'; of: FieldType | { [field: string]: FieldType }; description?: string };
export type Schema = { [field: string]: FieldType };

/** Bump when the template changes so cached answers from the old prompt aren't reused. */
export const PROMPT_VERSION = 3;

const MAX_LIST_ITEMS = 8;
// Bodies are cut here; receipts and notices put what matters near the top, and the model is
// decode-bound, so a longer input buys little.
const MAX_BODY_CHARS = 4000;

const SYSTEM =
  'You extract structured data from emails. Answer only with JSON that matches the requested fields. Copy values verbatim from the email when asked. Use null when a field is not present.';

export function fieldType(t: FieldType): string {
  return typeof t === 'string' ? t : t.type;
}

function description(t: FieldType): string | undefined {
  return typeof t === 'string' ? undefined : (t as any).description;
}

function hint(t: FieldType): string {
  switch (fieldType(t)) {
    case 'money':
      return 'the amount as written with its currency, or null if the email states no such amount';
    case 'date':
      return 'the date as written, or null';
    case 'number':
      return 'the number as written, or null';
    case 'boolean':
      return 'true or false, or null if the email does not say';
    case 'enum':
      return `one of ${(t as any).values.map((v) => `"${v}"`).join(', ')}, or null`;
    case 'list': {
      const of = (t as any).of;
      if (of && typeof of === 'object' && !('type' in of)) {
        return `a list of up to ${MAX_LIST_ITEMS} items, each with ${Object.keys(of).join(', ')}`;
      }
      return `a list of up to ${MAX_LIST_ITEMS} short items`;
    }
    default:
      return 'text as written, or null';
  }
}

function scalarJsonSchema(t: FieldType): object {
  switch (fieldType(t)) {
    case 'boolean':
      return { type: ['boolean', 'null'] };
    case 'enum':
      return { enum: [...(t as any).values, null] };
    default:
      // Numbers, money and dates are copied as written and parsed by the host (normalize.ts),
      // which is more reliable than asking a small model to do arithmetic or date math.
      return { type: ['string', 'null'] };
  }
}

function fieldJsonSchema(t: FieldType): object {
  if (fieldType(t) !== 'list') return scalarJsonSchema(t);
  const of = (t as any).of;
  if (of && typeof of === 'object' && !('type' in of)) {
    const fields = Object.keys(of);
    return {
      type: 'array',
      maxItems: MAX_LIST_ITEMS,
      items: {
        type: 'object',
        properties: Object.fromEntries(fields.map((f) => [f, scalarJsonSchema(of[f])])),
        required: fields,
      },
    };
  }
  return { type: 'array', maxItems: MAX_LIST_ITEMS, items: scalarJsonSchema(of || 'string') };
}

export function compileJsonSchema(schema: Schema): object {
  const fields = Object.keys(schema);
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f, fieldJsonSchema(schema[f])])),
    required: fields,
  };
}

/** Stable across key order, so `{a, b}` and `{b, a}` share cached answers. */
export function schemaHash(schema: Schema, instructions?: string): string {
  const canonical = Object.keys(schema)
    .sort()
    .map((f) => [f, schema[f]]);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ v: PROMPT_VERSION, canonical, instructions: instructions || '' }))
    .digest('hex')
    .slice(0, 32);
}

export interface PromptMessage {
  fromName: string;
  fromEmail: string;
  subject: string;
  date: Date;
  text: string;
}

export function emailBlock(m: PromptMessage): string {
  const date = m.date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `From: ${m.fromName || ''} <${m.fromEmail || ''}>\nSubject: ${
    m.subject || ''
  }\nDate: ${date}\n\n${(m.text || '').slice(0, MAX_BODY_CHARS)}`;
}

export function buildPrompt(schema: Schema, message: PromptMessage, instructions?: string) {
  const lines = Object.keys(schema).map((f) => {
    const desc = description(schema[f]);
    return `- ${f}: ${desc ? `${desc}; ` : ''}${hint(schema[f])}`;
  });
  const notes = instructions ? `\nAlso: ${instructions.slice(0, 500)}\n` : '';
  const user = `Fill these fields from the email below. Use null when the email does not state a value; never invent one, and never put a different kind of value in a field (an address is not an order number).\n${lines.join(
    '\n'
  )}\n${notes}\nEMAIL:\n${emailBlock(message)}`;
  // The ChatML markers stay plain text: on the eval set this measured better than encoding
  // them as special tokens. The empty think block turns off Qwen3.5's reasoning mode.
  return `<|im_start|>system\n${SYSTEM}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}
