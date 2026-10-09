import { z } from 'zod';
import { DatabaseStore, Message } from 'mailspring-exports';
import { isMyAddress, knownAddresses } from '../../../mcp-server/lib/capabilities/identity';
import { contentFor, messagesWithBodies } from './bodies';
import { ViewGrant, requirePermission } from './grant';
import { ViewError } from './errors';
import {
  BridgeContext,
  Handler,
  mailQuery,
  messagesFindQuery,
  messagesPage,
  parse,
} from './handlers';
import { validateSchema } from './extract';
import type { Schema } from '../extraction/prompt';
import { extractionStatus, runModel } from '../extraction/client';
import { LocalModelStore, modelStatusForViews } from '../local-model/store';
import {
  BriefingItem,
  BriefingMessage,
  DigestGroup,
  GenerateTask,
  MICRO_JSON_SCHEMA,
  MICRO_SCHEMA_HASH,
  Micro,
  Priority,
  buildDigest,
  briefingPrompt,
  choosePriorities,
  cleanProse,
  compileBriefingSchema,
  headline,
  generationKey,
  groupBySource,
  isAutomatedSender,
  localDay,
  mapThreadRefs,
  microPrompt,
  normalizeMicro,
  proseSections,
} from '../generation/briefing';

/**
 * `ai.summarize` (phase 1) and `ai.generate` (phase 2) — see lib/generation/briefing.ts and
 * docs/plans/sandboxed-views-exploration.md §9.9. Both run on the same utility-process model
 * and queue as `ai.extract`, and share its job tracking: callers keep an `ExtractJob`-shaped
 * `{ cancelled }` object and cancel it on reload.
 *
 * Like extraction, all model work runs on this device and isn't metered.
 */

export const MAX_GENERATE_MESSAGES = 40;
export const MAX_SUMMARIZE_MESSAGES = 200;
const MODEL_BATCH_SIZE = 4;
const NARRATIVE_TOKENS = 260;

export interface GenerateJob {
  cancelled: boolean;
}

export interface MicroResult {
  messageId: string;
  threadId: string;
  gist: string | null;
  asks: string | null;
  needsAction: boolean;
}

type Status = 'running' | 'done';

function briefingMessage(message: Message, text: string | null): BriefingMessage {
  const from = (message.from && message.from[0]) || ({} as any);
  return {
    messageId: message.id,
    threadId: message.threadId,
    fromName: from.name || '',
    fromEmail: from.email || '',
    subject: message.subject || '',
    date: message.date || new Date(),
    text: text || message.snippet || '',
  };
}

/**
 * Phase 1 for each message, in batches, reporting the records produced since the last call.
 * Resolves with every record (null where the model was unavailable or dropped the item).
 */
async function summarizeAll(
  grant: ViewGrant,
  messages: Message[],
  job: GenerateJob,
  priority: number,
  onBatch: (
    records: MicroResult[],
    processed: number,
    status: Status,
    modelAvailable: boolean
  ) => void
): Promise<{ micros: Map<string, Micro | null>; modelAvailable: boolean }> {
  const micros = new Map<string, Micro | null>();
  const modelAvailable = (await extractionStatus()).available;
  let processed = 0;
  const record = (m: Message): MicroResult => {
    const micro = micros.get(m.id);
    return {
      messageId: m.id,
      threadId: m.threadId,
      gist: micro ? micro.gist : null,
      asks: micro ? micro.asks : null,
      needsAction: micro ? micro.needsAction : false,
    };
  };
  if (!modelAvailable) {
    messages.forEach((m) => micros.set(m.id, null));
    onBatch(messages.map(record), messages.length, 'running', false);
    return { micros, modelAvailable };
  }
  for (let i = 0; i < messages.length; i += MODEL_BATCH_SIZE) {
    if (job.cancelled) break;
    const chunk = messages.slice(i, i + MODEL_BATCH_SIZE);
    const answers = await runModel({
      viewId: grant.viewId,
      priority,
      schemaHash: MICRO_SCHEMA_HASH,
      jsonSchema: MICRO_JSON_SCHEMA,
      maxTokens: 120,
      items: chunk.map((m) => ({
        messageId: m.id,
        prompt: microPrompt(briefingMessage(m, contentFor(m, { text: true }).text)),
      })),
    });
    if (job.cancelled) break;
    chunk.forEach((m, idx) =>
      micros.set(m.id, answers[idx] ? normalizeMicro(answers[idx].value) : null)
    );
    processed += chunk.length;
    onBatch(chunk.map(record), processed, 'running', true);
  }
  return { micros, modelAvailable };
}

async function loadMessages(grant: ViewGrant, ids: string[]) {
  const messages = await messagesWithBodies(grant, ids);
  const order = new Map(ids.map((id, i) => [id, i]));
  return messages.sort((a, b) => order.get(a.id) - order.get(b.id));
}

const sqlString = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

/** Whether the newest message in each thread is the user's own. */
async function lastSenderIsMe(threadIds: string[]): Promise<Set<string>> {
  if (!threadIds.length) return new Set();
  const rows = await (DatabaseStore as any)._query(
    `SELECT threadId, json_extract(data, '$.from[0].email') AS email FROM Message
     WHERE threadId IN (${threadIds.map(sqlString).join(',')}) AND draft = 0
     ORDER BY date ASC`,
    [],
    true
  );
  const last = new Map<string, string>();
  for (const row of rows) last.set(row.threadId, row.email);
  return new Set([...last.entries()].filter(([, email]) => isMyAddress(email)).map(([t]) => t));
}

/** Senders the user has written to before, from their own sent mail. */
async function knownCorrespondents(senders: string[]): Promise<Set<string>> {
  const mine = knownAddresses();
  const wanted = [...new Set(senders.map((s) => (s || '').toLowerCase()).filter(Boolean))];
  if (!mine.length || !wanted.length) return new Set();
  const rows = await (DatabaseStore as any)._query(
    `SELECT DISTINCT lower(json_extract(r.value, '$.email')) AS email
     FROM Message, json_each(Message.data, '$.to') AS r
     WHERE lower(json_extract(Message.data, '$.from[0].email')) IN (${mine.map(sqlString).join(',')})
       AND lower(json_extract(r.value, '$.email')) IN (${wanted.map(sqlString).join(',')})`,
    [],
    true
  );
  return new Set(rows.map((r) => r.email));
}

async function briefingItems(messages: Message[], micros: Map<string, Micro | null>) {
  const threadIds = [...new Set(messages.map((m) => m.threadId))];
  const [lastFromMe, known] = await Promise.all([
    lastSenderIsMe(threadIds),
    knownCorrespondents(messages.map((m) => (m.from && m.from[0] && m.from[0].email) || '')),
  ]);
  return messages.map((m, i): BriefingItem => {
    const fromEmail = ((m.from && m.from[0] && m.from[0].email) || '').toLowerCase();
    return {
      ref: `T${i + 1}`,
      message: briefingMessage(m, null),
      micro: micros.get(m.id) || null,
      signals: {
        bulk: !!m.listUnsubscribe,
        automated: isAutomatedSender(fromEmail),
        toMe: (m.to || []).some((c) => isMyAddress(c.email)),
        lastFromMe: lastFromMe.has(m.threadId),
        knownCorrespondent: known.has(fromEmail),
      },
    };
  });
}

// Phase-2 answers keyed by generationKey; the same inputs on the same day reuse them.
const generated = new Map<string, any>();

export type SummarizeProgress = {
  results: MicroResult[];
  processed: number;
  total: number;
  status: Status | 'done';
  modelAvailable: boolean;
};

/** `ai.summarize`: phase-1 records only, streamed as they're produced. */
export async function runSummarizeJob(
  grant: ViewGrant,
  ids: string[],
  job: GenerateJob,
  priority: number,
  onProgress: (p: SummarizeProgress) => void
) {
  const targets = ids.slice(0, MAX_SUMMARIZE_MESSAGES);
  const messages = await loadMessages(grant, targets);
  if (job.cancelled) return;
  const { modelAvailable } = await summarizeAll(
    grant,
    messages,
    job,
    priority,
    (results, processed, status, available) =>
      onProgress({ results, processed, total: messages.length, status, modelAvailable: available })
  );
  if (job.cancelled) return;
  onProgress({
    results: [],
    processed: messages.length,
    total: messages.length,
    status: 'done',
    modelAvailable,
  });
}

export type GenerateProgress = {
  phase: 'summaries' | 'briefing';
  processed: number;
  total: number;
  status: Status | 'done';
  modelAvailable: boolean;
  usedMessages?: number;
  text?: string | null;
  value?: any;
  priorities?: Priority[];
  groups?: DigestGroup[];
  /** Template-built summary of `priorities` and `groups`; never null once phase 2 runs. */
  headline?: string;
  summaries?: MicroResult[];
};

/**
 * `ai.generate`: phase 1 for every message (cached), then the briefing. `priorities` and
 * `groups` are always computed host-side; `text` (or `value` when a schema is given) comes from
 * the model over the digest, and is null when the model isn't available.
 */
export async function runGenerateJob(
  grant: ViewGrant,
  ids: string[],
  opts: { task: GenerateTask; instructions?: string; schema?: Schema | null; maxTokens?: number },
  job: GenerateJob,
  priority: number,
  onProgress: (p: GenerateProgress) => void
) {
  const targets = ids.slice(0, MAX_GENERATE_MESSAGES);
  const messages = await loadMessages(grant, targets);
  if (job.cancelled) return;
  const total = messages.length;

  const { micros, modelAvailable } = await summarizeAll(
    grant,
    messages,
    job,
    priority,
    (results, processed, status, available) =>
      onProgress({
        phase: 'summaries',
        processed,
        total,
        status,
        modelAvailable: available,
        summaries: results,
      })
  );
  if (job.cancelled) return;

  const items = await briefingItems(messages, micros);
  const priorities = choosePriorities(items);
  const groups = groupBySource(items, new Set(priorities.map((p) => p.threadId)));
  const base = {
    phase: 'briefing' as const,
    processed: total,
    total,
    modelAvailable,
    usedMessages: total,
    priorities,
    groups,
    headline: headline(priorities, groups),
  };
  if (!modelAvailable || (opts.task === 'prioritize' && !opts.schema)) {
    onProgress({ ...base, status: 'done', text: null, value: null });
    return;
  }
  onProgress({ ...base, status: 'running' });

  const key = generationKey({
    // Answers from Apple's model and Qwen are kept apart.
    model: (await extractionStatus()).modelVersion,
    messageIds: messages.map((m) => m.id),
    task: opts.task,
    instructions: opts.instructions,
    schema: opts.schema,
    day: localDay(),
  });
  if (!generated.has(key)) {
    const digest = buildDigest(items, priorities, groups);
    const refToThread = new Map(items.map((i) => [i.ref, i.message.threadId]));
    const jsonSchema = opts.schema
      ? compileBriefingSchema(
          opts.schema,
          items.map((i) => i.ref)
        )
      : null;
    const [answer] = await runModel({
      viewId: grant.viewId,
      priority,
      schemaHash: `briefing-${key}`,
      jsonSchema,
      maxTokens: Math.min(opts.maxTokens || NARRATIVE_TOKENS, 600),
      items: [
        {
          messageId: `briefing-${key}`,
          prompt: briefingPrompt(
            opts.task,
            digest,
            opts.instructions,
            proseSections(items, priorities, groups)
          ),
        },
      ],
    });
    if (job.cancelled) return;
    const value = answer && answer.value;
    generated.set(
      key,
      opts.schema
        ? { text: null, value: value ? mapThreadRefs(value, refToThread) : null }
        : { text: cleanProse(value && value.text), value: null }
    );
  }
  onProgress({ ...base, status: 'done', ...generated.get(key) });
}

// ── Bridge handlers ─────────────────────────────────────────────────────────

/** What the handlers need from the ViewBridge that owns them. */
export interface GenerationHost {
  grant: () => ViewGrant;
  /** Bumped on every page reset; work started under an older generation is dropped. */
  generation: () => number;
  visible: () => boolean;
  /** The bridge's job table, shared with `ai.extract` so `ai.cancel` and resets cover both. */
  jobs: Map<string, GenerateJob>;
}

const flatSchema = z.any().optional();

async function resolveIds(grant: ViewGrant, ids: string[] | undefined, query: any, max: number) {
  if (ids) return ids.slice(0, max);
  if (query === undefined) throw new ViewError('invalid', 'Pass ids or query.');
  const q = mailQuery(grant, 'messages', query);
  const messages = await messagesFindQuery(grant, q);
  return messagesPage(grant, q, messages)
    .items.map((m) => m.id)
    .slice(0, max);
}

function track<P>(host: GenerationHost, ctx: BridgeContext, jobId: string, total: number) {
  const job: GenerateJob = { cancelled: false };
  host.jobs.set(jobId, job);
  const progress = (p: P & { status: string }) => {
    if (job.cancelled) return;
    ctx.emit('ai.progress', { jobId, ...p, ...modelStatusForViews(LocalModelStore.status()) });
    if (p.status !== 'running') host.jobs.delete(jobId);
  };
  const fail = (err: Error) => {
    host.jobs.delete(jobId);
    ctx.emit('ai.progress', {
      jobId,
      processed: 0,
      total,
      status: 'error',
      error: { code: 'internal', message: err.message },
    });
  };
  return { job, progress, fail };
}

export function generationHandlers(host: GenerationHost): { [method: string]: Handler } {
  return {
    'ai.summarize': async (ctx, params) => {
      const grant = host.grant();
      requirePermission(grant, 'mail.bodies');
      const { jobId, ids, query } = parse(
        z.object({
          jobId: z.string().min(1),
          ids: z.array(z.string()).optional(),
          query: z.any().optional(),
        }),
        params
      );
      const generation = host.generation();
      const targets = await resolveIds(grant, ids, query, MAX_SUMMARIZE_MESSAGES);
      if (generation !== host.generation()) return { jobId, total: 0 };
      const { job, progress, fail } = track<SummarizeProgress>(host, ctx, jobId, targets.length);
      runSummarizeJob(grant, targets, job, host.visible() ? 0 : 1, progress).catch(fail);
      return { jobId, total: targets.length };
    },

    'ai.generate': async (ctx, params) => {
      const grant = host.grant();
      requirePermission(grant, 'mail.bodies');
      const { jobId, ids, query, task, instructions, schema, maxMessages, maxTokens } = parse(
        z.object({
          jobId: z.string().min(1),
          task: z.enum(['summarize', 'prioritize', 'freeform']),
          ids: z.array(z.string()).optional(),
          query: z.any().optional(),
          instructions: z.string().max(1000).optional(),
          schema: flatSchema,
          maxMessages: z.number().int().min(1).max(MAX_GENERATE_MESSAGES).optional(),
          maxTokens: z.number().int().min(1).max(600).optional(),
        }),
        params
      );
      if (task === 'freeform' && !instructions) {
        throw new ViewError('invalid', "task 'freeform' needs instructions.");
      }
      let validSchema: Schema | null = null;
      if (schema !== undefined && schema !== null) {
        try {
          validSchema = validateSchema(schema);
        } catch (err) {
          throw new ViewError('invalid', err.message);
        }
      }
      const generation = host.generation();
      const targets = await resolveIds(grant, ids, query, maxMessages || MAX_GENERATE_MESSAGES);
      if (generation !== host.generation()) return { jobId, total: 0 };
      const { job, progress, fail } = track<GenerateProgress>(host, ctx, jobId, targets.length);
      runGenerateJob(
        grant,
        targets,
        { task, instructions, schema: validSchema, maxTokens },
        job,
        host.visible() ? 0 : 1,
        progress
      ).catch(fail);
      return { jobId, total: targets.length };
    },
  };
}
