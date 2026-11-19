// A small client for OpenRouter's OpenAI-compatible Chat Completions API.
// It runs in Mailspring's renderer with the browser fetch (OpenRouter allows
// cross-origin calls), streams over SSE, and retries transient failures.

const BASE_URL = 'https://openrouter.ai/api/v1';
const APP_TITLE = 'Sift for Mailspring';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  /** USD, reported by OpenRouter for every request. */
  cost?: number;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  response_format?: Record<string, unknown>;
  max_tokens?: number;
  temperature?: number;
  /** OpenRouter's unified reasoning control; ignored by non-reasoning models. */
  reasoning?: { effort?: 'low' | 'medium' | 'high'; exclude?: boolean };
  /** Route only to providers that support every parameter sent (e.g. json_schema). */
  provider?: { require_parameters?: boolean };
}

export interface ChatResult {
  message: ChatMessage;
  finishReason: string | null;
  usage: Usage | null;
  model: string | null;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code?: string | number
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(apiKey: string, path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': APP_TITLE,
          ...(init.headers || {}),
        },
      });
    } catch (err) {
      if ((init.signal as AbortSignal | undefined)?.aborted) throw err;
      if (attempt >= MAX_RETRIES)
        throw new OpenRouterError('Could not reach OpenRouter. Check your connection.', null);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) return response;
    if (RETRYABLE.has(response.status) && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    let message = `${response.status} ${response.statusText}`;
    let code: string | number | undefined;
    try {
      const body = await response.json();
      message = body?.error?.message || message;
      code = body?.error?.code;
    } catch {
      // Not JSON; keep the status line.
    }
    throw new OpenRouterError(message, response.status, code);
  }
}

export async function chat(
  apiKey: string,
  req: ChatRequest,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ChatResult> {
  const response = await request(apiKey, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ ...req, stream: false }),
    signal,
  });
  const body = await response.json();
  if (body.error)
    throw new OpenRouterError(body.error.message, body.error.code ?? null, body.error.code);
  const choice = body.choices?.[0];
  return {
    message: {
      role: 'assistant',
      content: choice?.message?.content ?? null,
      tool_calls: choice?.message?.tool_calls,
    },
    finishReason: choice?.finish_reason ?? null,
    usage: body.usage ?? null,
    model: body.model ?? null,
  };
}

/**
 * Stream a completion. onText receives each text delta; tool calls are
 * assembled from their fragments and returned on the final message.
 */
export async function chatStream(
  apiKey: string,
  req: ChatRequest,
  { signal, onText }: { signal?: AbortSignal; onText?: (delta: string) => void } = {}
): Promise<ChatResult> {
  const response = await request(apiKey, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ ...req, stream: true }),
    signal,
  });
  if (!response.body)
    throw new OpenRouterError('OpenRouter returned an empty stream.', response.status);

  let content = '';
  const toolCalls: ToolCall[] = [];
  let finishReason: string | null = null;
  let usage: Usage | null = null;
  let model: string | null = null;

  const handle = (chunk: any) => {
    if (chunk.error) {
      throw new OpenRouterError(
        chunk.error.message || 'OpenRouter stream error',
        null,
        chunk.error.code
      );
    }
    model = chunk.model ?? model;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (delta.content) {
      content += delta.content;
      onText?.(delta.content);
    }
    for (const part of delta.tool_calls || []) {
      const call = (toolCalls[part.index ?? 0] ||= {
        id: '',
        type: 'function',
        function: { name: '', arguments: '' },
      });
      if (part.id) call.id = part.id;
      if (part.function?.name) call.function.name += part.function.name;
      if (part.function?.arguments) call.function.arguments += part.function.arguments;
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      // Blank lines separate events; lines starting with ":" are keep-alive comments.
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      handle(JSON.parse(data));
    }
  }

  const calls = toolCalls.filter(Boolean);
  return {
    message: {
      role: 'assistant',
      content: content || null,
      ...(calls.length ? { tool_calls: calls } : {}),
    },
    finishReason,
    usage,
    model,
  };
}

export async function keyInfo(apiKey: string): Promise<{
  label?: string;
  limit?: number | null;
  limit_remaining?: number | null;
  usage?: number;
}> {
  const response = await request(apiKey, '/key', { method: 'GET' });
  return (await response.json()).data || {};
}

export async function findModel(id: string): Promise<{ id: string; name: string } | null> {
  const response = await fetch(`${BASE_URL}/models`);
  if (!response.ok) return null;
  const { data } = await response.json();
  return (data || []).find((m: any) => m.id === id) || null;
}
