import { KeyManager } from 'mailspring-exports';

export const PLUGIN_ID = 'sift';
const API_KEY_NAME = 'sift-openrouter-api-key';

export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';

/** Suggested OpenRouter models. Any OpenRouter model ID with tool and JSON-schema support works. */
export const MODELS = [
  {
    id: 'deepseek/deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    hint: 'Cheapest, fast (default)',
  },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', hint: 'Stronger, still cheap' },
] as const;

export interface SiftSettings {
  model: string;
  autoTriage: boolean;
  triageDays: number;
  aboutMe: string;
  writingStyle: string;
  excludedSenders: string;
}

// Exported from main.tsx as the package's config schema, so Mailspring
// validates and defaults everything under the `sift.*` config keys.
export const configSchema = {
  model: { type: 'string', default: DEFAULT_MODEL },
  autoTriage: { type: 'boolean', default: true },
  triageDays: { type: 'integer', default: 14, minimum: 1, maximum: 90 },
  aboutMe: { type: 'string', default: '' },
  writingStyle: { type: 'string', default: '' },
  excludedSenders: { type: 'string', default: '' },
};

export function getSettings(): SiftSettings {
  const stored = AppEnv.config.get(PLUGIN_ID) || {};
  const defaults = Object.fromEntries(Object.entries(configSchema).map(([k, v]) => [k, v.default]));
  const settings = { ...defaults, ...stored } as SiftSettings;
  // OpenRouter IDs are always "vendor/model"; anything else is left over from
  // an older Sift build and falls back to the default.
  if (!settings.model || !settings.model.includes('/')) settings.model = DEFAULT_MODEL;
  return settings;
}

export function setSetting<K extends keyof SiftSettings>(key: K, value: SiftSettings[K]) {
  AppEnv.config.set(`${PLUGIN_ID}.${key}`, value);
}

/** Lower-cased sender addresses or @domains the user never wants sent to the model. */
export function excludedSenderPatterns(): string[] {
  return getSettings()
    .excludedSenders.split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isExcludedSender(email: string): boolean {
  const addr = (email || '').toLowerCase();
  return excludedSenderPatterns().some((p) => (p.startsWith('@') ? addr.endsWith(p) : addr === p));
}

// The API key lives in Mailspring's encrypted credential store (the same one
// that holds IMAP passwords), never in config.json. OPENROUTER_API_KEY in the
// environment works as a fallback for development.
let cachedKey: string | null | undefined;

export async function getApiKey(): Promise<string | null> {
  if (cachedKey === undefined) {
    cachedKey = (await KeyManager.getPassword(API_KEY_NAME)) || null;
  }
  return cachedKey || process.env.OPENROUTER_API_KEY || null;
}

/**
 * Whether a key is configured. Sift stays inert (no triage, no thread card, no
 * composer button) until one is. Accurate once getApiKey() has run at startup.
 */
export function hasApiKey(): boolean {
  return !!(cachedKey || process.env.OPENROUTER_API_KEY);
}

export async function setApiKey(value: string) {
  const trimmed = value.trim();
  if (trimmed) {
    await KeyManager.replacePassword(API_KEY_NAME, trimmed);
  } else {
    await KeyManager.deletePassword(API_KEY_NAME);
  }
  cachedKey = trimmed || null;
}

export async function apiKeySource(): Promise<'keychain' | 'env' | null> {
  await getApiKey();
  if (cachedKey) return 'keychain';
  return process.env.OPENROUTER_API_KEY ? 'env' : null;
}
