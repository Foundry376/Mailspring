import { AppleFMHelper, HelperError } from './apple-fm';
import type { SystemModel } from './local-model';

/**
 * The model backends behind ai.extract / ai.summarize / ai.generate
 * (docs/plans/views-apple-foundation-models-plan.md §4). Apple's on-device model is used where
 * it's available; the downloadable Qwen model everywhere else, or when the user picks it with
 * `core.views.localModelProvider = 'qwen'` (mostly so Mac developers can test what Windows and
 * Linux users get).
 *
 * The renderer builds one prompt per message in Qwen's chat template (lib/extraction/prompt.ts,
 * lib/generation/briefing.ts). The Apple backend splits that into Instructions and a prompt
 * instead of asking every prompt builder for two shapes. Host-side validation of answers
 * (normalize.ts, thread-id checks) is the same for both: guided generation guarantees an
 * answer's shape, not that its values appear in the email.
 */

export type ModelBackendId = 'apple-fm' | 'llama-qwen';

export interface BackendRunRequest {
  prompt: string;
  jsonSchema: object | null;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface BackendRunResult {
  /** The schema answer, `{ text }` for free text, or null when the model had nothing. */
  value: any;
  ms: number;
  /** The model declined (an Apple guardrail); callers treat it as "no value". */
  refused?: boolean;
}

/** Chooses a backend. `qwen` forces the downloadable model even when Apple's is available. */
export function selectBackend(setting: 'auto' | 'qwen', system: SystemModel): ModelBackendId {
  if (setting === 'qwen') return 'llama-qwen';
  return system.available ? 'apple-fm' : 'llama-qwen';
}

/**
 * Cache-key version for a backend. Apple's includes the OS build, because a macOS update can
 * replace the model and answers cached from the old one shouldn't be reused.
 */
export function backendModelVersion(
  id: ModelBackendId,
  qwenVersion: string,
  system: { osBuild?: string }
) {
  return id === 'apple-fm' ? `apple-fm@${system.osBuild || 'unknown'}` : qwenVersion;
}

const CHAT =
  /<\|im_start\|>system\n([\s\S]*?)<\|im_end\|>\n<\|im_start\|>user\n([\s\S]*?)<\|im_end\|>/;

/** Splits a Qwen chat-template prompt into Apple's Instructions and prompt. */
export function splitChatPrompt(prompt: string): { instructions: string; prompt: string } {
  const match = prompt.match(CHAT);
  if (!match) return { instructions: '', prompt };
  return { instructions: match[1].trim(), prompt: match[2].trim() };
}

// ~3.5 characters per token for English mail; conservative so the estimate rarely undershoots.
const CHARS_PER_TOKEN = 3.2;
// Room for the schema the framework adds to the prompt, plus its own formatting.
const SCHEMA_OVERHEAD_TOKENS = 250;

/**
 * Trims the end of the prompt (the email or digest, which the templates put last) so
 * instructions + prompt + answer fit the model's context. Apple reports 4,096 tokens on some
 * macOS 27 builds and 8,192 on others, so the size is read at runtime, never assumed.
 */
export function fitToContext(
  instructions: string,
  prompt: string,
  maxTokens: number,
  contextSize: number
) {
  const budgetTokens = contextSize - maxTokens - SCHEMA_OVERHEAD_TOKENS;
  const budgetChars = Math.floor(budgetTokens * CHARS_PER_TOKEN) - instructions.length;
  if (budgetChars <= 0) return prompt.slice(0, 500);
  return prompt.length > budgetChars ? prompt.slice(0, budgetChars) : prompt;
}

const RATE_LIMIT_BACKOFF_MS = [2000, 5000, 15000];

/**
 * Fills fields the model left out (optional properties may be omitted) with null. Apple's
 * model sometimes writes the string "null" for a nullable field, which would otherwise read as
 * a merchant named "null".
 */
export function completeAnswer(value: any, jsonSchema: any) {
  if (!value || typeof value !== 'object' || !jsonSchema || !jsonSchema.properties) return value;
  for (const field of Object.keys(jsonSchema.properties)) {
    if (!(field in value) || value[field] === 'null') value[field] = null;
  }
  return value;
}

export class AppleFMBackend {
  private helper: AppleFMHelper;
  private contextSize: () => number;
  private sleep: (ms: number) => Promise<void>;
  /** True while waiting out a rate limit (Apple throttles background work on battery). */
  throttled = false;

  constructor(
    helper: AppleFMHelper,
    contextSize: () => number,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  ) {
    this.helper = helper;
    this.contextSize = contextSize;
    this.sleep = sleep;
  }

  warmup() {
    return this.helper.warmup();
  }

  async run(req: BackendRunRequest): Promise<BackendRunResult> {
    const split = splitChatPrompt(req.prompt);
    let prompt = fitToContext(split.instructions, split.prompt, req.maxTokens, this.contextSize());
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.helper.generate(
          {
            instructions: split.instructions,
            prompt,
            schema: req.jsonSchema,
            maxTokens: req.maxTokens,
          },
          req.signal
        );
        this.throttled = false;
        const value = req.jsonSchema
          ? completeAnswer(result.value, req.jsonSchema)
          : { text: (result.text || '').trim() };
        return { value, ms: result.ms };
      } catch (err) {
        const code = err instanceof HelperError ? err.code : 'failed';
        if (code === 'refused') return { value: null, ms: 0, refused: true };
        if (code === 'contextExceeded' && attempt === 0) {
          prompt = prompt.slice(0, Math.floor(prompt.length / 2));
          continue;
        }
        if (code === 'rateLimited' && attempt < RATE_LIMIT_BACKOFF_MS.length) {
          this.throttled = true;
          await this.sleep(RATE_LIMIT_BACKOFF_MS[attempt]);
          continue;
        }
        this.throttled = false;
        throw err;
      }
    }
  }
}
