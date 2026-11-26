import { completeAnswer, splitChatPrompt } from './local-model-provider';

/**
 * OpenRouter's OpenAI-compatible Chat Completions API, the remote engine behind the AI service
 * (local-ai-service.ts) when the user picks it in Preferences > AI. Prompts arrive in the same
 * chat template the local engines take and are split into system and user messages here.
 *
 * Runs in the main process with Electron's `net.fetch`, which follows the system proxy, so the
 * API key never enters a renderer.
 */

const BASE_URL = 'https://openrouter.ai/api/v1';
// OpenRouter's app attribution headers (https://openrouter.ai/docs/api-reference/overview).
const ATTRIBUTION = { 'HTTP-Referer': 'https://getmailspring.com', 'X-Title': 'Mailspring' };
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
// Reasoning models spend output tokens thinking before they answer, so the small budgets the
// local models need would cut their answers off. Unused tokens aren't billed.
const MIN_REMOTE_OUTPUT_TOKENS = 2048;

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
  }
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function defaultFetch(): Fetch {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { net } = require('electron');
  return (url, init) => net.fetch(url, init);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function request(
  fetch: Fetch,
  apiKey: string | null,
  path: string,
  init: RequestInit,
  wait = sleep
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
          ...ATTRIBUTION,
        },
      });
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        throw new OpenRouterError('Mailspring could not reach OpenRouter.', null);
      }
      await wait(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) return response.json();
    if (RETRYABLE.has(response.status) && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await wait(retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = (body && body.error && body.error.message) || message;
    } catch (err) {
      // Not JSON; keep the status line.
    }
    throw new OpenRouterError(message, response.status);
  }
}

/** Parses a JSON answer, allowing the Markdown fence some models wrap it in. */
export function parseJSONAnswer(content: string) {
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced);
  } catch (err) {
    return null;
  }
}

export class OpenRouterEngine {
  private fetch: Fetch;
  private wait: (ms: number) => Promise<void>;

  constructor({ fetch, wait }: { fetch?: Fetch; wait?: (ms: number) => Promise<void> } = {}) {
    this.fetch = fetch || defaultFetch();
    this.wait = wait || sleep;
  }

  async run(req: {
    apiKey: string;
    model: string;
    prompt: string;
    jsonSchema: object | null;
    maxTokens: number;
  }): Promise<{ value: any; ms: number }> {
    const started = Date.now();
    const { instructions, prompt } = splitChatPrompt(req.prompt);
    const body: { [key: string]: any } = {
      model: req.model,
      messages: [
        ...(instructions ? [{ role: 'system', content: instructions }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: Math.max(req.maxTokens, MIN_REMOTE_OUTPUT_TOKENS),
      stream: false,
    };
    if (req.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'answer', schema: req.jsonSchema },
      };
      // Route only to providers that honor response_format rather than ignore it.
      body.provider = { require_parameters: true };
    }
    const result = await request(
      this.fetch,
      req.apiKey,
      '/chat/completions',
      { method: 'POST', body: JSON.stringify(body) },
      this.wait
    );
    if (result.error) throw new OpenRouterError(result.error.message, result.error.code || null);
    const choice = result.choices && result.choices[0];
    const content: string = (choice && choice.message && choice.message.content) || '';
    const value = req.jsonSchema
      ? completeAnswer(parseJSONAnswer(content), req.jsonSchema)
      : { text: content.trim() };
    return { value, ms: Date.now() - started };
  }

  /** The key's label and spending, to show that it works. */
  async keyInfo(apiKey: string): Promise<{
    label?: string;
    usage?: number;
    limit?: number | null;
    limit_remaining?: number | null;
  }> {
    const result = await request(this.fetch, apiKey, '/key', { method: 'GET' }, this.wait);
    return (result && result.data) || {};
  }
}
