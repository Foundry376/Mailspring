/**
 * Names shared by the AI service in the main process (local-ai-service.ts) and the renderer
 * stores that write these settings (ai-store.ts). Kept free of imports so renderers can read
 * them without loading main-process modules.
 */

export const AI_CONFIG = {
  /** The one switch for AI in Mailspring and in Views. */
  enabled: 'core.ai.enabled',
  /** `local` (default) or `openrouter`. */
  backend: 'core.ai.backend',
  /** `auto` (Apple Intelligence where available) or `qwen`. */
  localModel: 'core.ai.local.model',
  /** An OpenRouter model id, e.g. `anthropic/claude-haiku-5.5`. */
  openRouterModel: 'core.ai.openrouter.model',
  /** The user saved an OpenRouter key. The key itself is in KeyManager, never in config. */
  openRouterHasKey: 'core.ai.openrouter.hasKey',
};

/** KeyManager's name for the OpenRouter key. */
export const OPENROUTER_KEY_NAME = 'openrouter-api-key';

export const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-haiku-5.5';
