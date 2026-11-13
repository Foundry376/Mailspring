import { z } from 'zod';
import { DEFAULT_MODEL, getApiKey, getSettings } from '../settings';
import { usageStore } from '../stores/usage-store';
import {
  chat,
  chatStream,
  OpenRouterError,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
} from './openrouter';

export type Effort = 'low' | 'medium' | 'high';

export class MissingApiKeyError extends Error {
  constructor() {
    super('Add your OpenRouter API key in Preferences → Sift to turn on AI features.');
  }
}

export function currentModel(): string {
  return getSettings().model || DEFAULT_MODEL;
}

type CompleteOptions = Omit<ChatRequest, 'model' | 'reasoning'> & { effort: Effort };

function buildRequest({ effort, ...rest }: CompleteOptions): ChatRequest {
  // Reasoning tokens are billed but never shown, so keep the model's
  // thinking proportional to the task.
  return { ...rest, model: currentModel(), reasoning: { effort, exclude: true } };
}

async function apiKeyOrThrow() {
  const key = await getApiKey();
  if (!key) throw new MissingApiKeyError();
  return key;
}

export async function complete(
  opts: CompleteOptions,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ChatResult> {
  const result = await chat(await apiKeyOrThrow(), buildRequest(opts), { signal });
  usageStore.record(result.usage);
  return result;
}

export async function completeStream(
  opts: CompleteOptions,
  { signal, onText }: { signal?: AbortSignal; onText?: (delta: string) => void } = {}
): Promise<ChatResult> {
  const result = await chatStream(await apiKeyOrThrow(), buildRequest(opts), { signal, onText });
  usageStore.record(result.usage);
  return result;
}

/** JSON Schema for a Zod schema, in the shape OpenRouter's tools and json_schema accept. */
export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
  }) as Record<string, unknown>;
  return rest;
}

/** Ask for JSON matching a Zod schema; validates the reply and retries once if it doesn't. */
export async function completeJSON<T extends z.ZodType>(
  schema: T,
  name: string,
  messages: ChatMessage[],
  { effort = 'low', maxTokens = 4000 }: { effort?: Effort; maxTokens?: number } = {}
): Promise<z.infer<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await complete({
      effort,
      max_tokens: maxTokens,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name, strict: true, schema: jsonSchema(schema) },
      },
      provider: { require_parameters: true },
    });
    const raw = (result.message.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try {
      return schema.parse(JSON.parse(raw));
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `The model returned output that didn't match the expected format (${String(lastError).slice(0, 120)}).`
  );
}

export function describeError(err: unknown): string {
  if (err instanceof MissingApiKeyError) return err.message;
  if (err instanceof OpenRouterError) {
    if (err.status === 401)
      return 'OpenRouter rejected your API key. Check it in Preferences → Sift.';
    if (err.status === 402) return 'Your OpenRouter account is out of credits.';
    if (err.status === 429) return 'Rate limited by OpenRouter. Sift will retry shortly.';
    if (err.status === null) return err.message;
    return `OpenRouter error ${err.status}: ${err.message}`;
  }
  if (err instanceof DOMException && err.name === 'AbortError') return 'Stopped.';
  return err instanceof Error ? err.message : String(err);
}

/** Errors that will keep failing until the user changes their key or credits. */
export function isBlockingError(err: unknown) {
  return (
    err instanceof MissingApiKeyError ||
    (err instanceof OpenRouterError && (err.status === 401 || err.status === 402))
  );
}

export function isRateLimit(err: unknown) {
  return err instanceof OpenRouterError && err.status === 429;
}
