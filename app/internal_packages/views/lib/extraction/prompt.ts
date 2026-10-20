import crypto from 'crypto';
import { LocalModelPrompt } from 'mailspring-exports';

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

/** What a prompt is about: an email, or a calendar event (`ai.extract` over `events`). */
export type SourceKind = 'email' | 'event';

const NOUN: { [kind in SourceKind]: { one: string; plural: string } } = {
  email: { one: 'email', plural: 'emails' },
  event: { one: 'calendar event', plural: 'calendar events' },
};

const system = (kind: SourceKind) =>
  `You extract structured data from ${NOUN[kind].plural}. Answer only with JSON that matches the requested fields. Copy values verbatim from the ${NOUN[kind].one} when asked. Use null when a field is not present.`;

export function fieldType(t: FieldType): string {
  return typeof t === 'string' ? t : t.type;
}

export function description(t: FieldType): string | undefined {
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

export interface PromptEvent {
  title: string;
  start: Date;
  isAllDay: boolean;
  location: string | null;
  organizer: string | null;
  attendees: string[];
  description: string | null;
}

const MAX_ATTENDEES = 12;

export function eventBlock(e: PromptEvent): string {
  const when = e.isAllDay
    ? e.start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : e.start.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
  const lines = [`Title: ${e.title || ''}`, `When: ${when}`];
  if (e.location) lines.push(`Location: ${e.location}`);
  if (e.organizer) lines.push(`Organizer: ${e.organizer}`);
  if (e.attendees.length)
    lines.push(`Attendees: ${e.attendees.slice(0, MAX_ATTENDEES).join(', ')}`);
  return `${lines.join('\n')}\n\n${(e.description || '').slice(0, MAX_BODY_CHARS)}`;
}

export function buildPrompt(schema: Schema, message: PromptMessage, instructions?: string) {
  return promptFor(schema, 'email', emailBlock(message), instructions);
}

export function buildEventPrompt(schema: Schema, event: PromptEvent, instructions?: string) {
  return promptFor(schema, 'event', eventBlock(event), instructions);
}

function promptFor(schema: Schema, kind: SourceKind, block: string, instructions?: string) {
  const noun = NOUN[kind].one;
  const lines = Object.keys(schema).map((f) => {
    const desc = description(schema[f]);
    return `- ${f}: ${desc ? `${desc}; ` : ''}${hint(schema[f])}`;
  });
  const notes = instructions
    ? `\nAlso: ${LocalModelPrompt.untrustedText(instructions).slice(0, 500)}\n`
    : '';
  const user = `Fill these fields from the ${noun} below. Use null when the ${noun} does not state a value; never invent one, and never put a different kind of value in a field (an address is not an order number).\n${lines.join(
    '\n'
  )}\n${notes}\n${noun.toUpperCase()}:\n${LocalModelPrompt.untrustedText(block)}`;
  return LocalModelPrompt.chatPrompt(system(kind), user);
}
