export type HarperPreset = 'essentials' | 'recommended' | 'everything';

export interface HarperRule {
  name: string;
  description: string;
}

export interface HarperRuleGroup {
  label: string;
  description: string;
  rules: HarperRule[];
}

export interface HarperRuleCatalog {
  groups: HarperRuleGroup[];
  // Rule sets where turning one on must turn the others off.
  exclusive: string[][];
  presets: Record<HarperPreset, string[]>;
}

type ConfigReader = { get: (key: string) => unknown };
type ConfigWriter = ConfigReader & { set: (key: string, value: unknown) => void };

const presetKey = 'core.composing.grammarCheckPreset';
const enabledKey = 'core.composing.grammarCheckEnabledRules';
const disabledKey = 'core.composing.grammarCheckDisabledRules';

let loadCatalog: (() => Promise<HarperRuleCatalog>) | null = null;

function ruleNames(value: unknown): Set<string> {
  return new Set(
    (typeof value === 'string' ? value : '')
      .split(',')
      .map((rule) => rule.trim())
      .filter(Boolean)
  );
}

/**
 * The preset picks a base set of rules; the enabled and disabled lists are per-rule overrides
 * on top of it, and survive a preset change so ignored rules stay ignored.
 */
export const HarperRules = {
  presetKey,
  enabledKey,
  disabledKey,
  configKeys: [presetKey, enabledKey, disabledKey],

  preset(config: ConfigReader = AppEnv.config): HarperPreset {
    return (config.get(presetKey) as HarperPreset) || 'recommended';
  },
  enabled(config: ConfigReader = AppEnv.config) {
    return ruleNames(config.get(enabledKey));
  },
  disabled(config: ConfigReader = AppEnv.config) {
    return ruleNames(config.get(disabledKey));
  },

  isEnabled(rule: string, catalog: HarperRuleCatalog, config: ConfigReader = AppEnv.config) {
    if (this.disabled(config).has(rule)) return false;
    return this.enabled(config).has(rule) || catalog.presets[this.preset(config)].includes(rule);
  },

  /** Saves only differences from the preset, so a rule set back to its preset value stays tidy. */
  setRules(
    rules: string[],
    on: boolean,
    catalog: HarperRuleCatalog,
    config: ConfigWriter = AppEnv.config
  ) {
    const presetRules = new Set(catalog.presets[this.preset(config)]);
    const enabled = this.enabled(config);
    const disabled = this.disabled(config);
    const apply = (rule: string, value: boolean) => {
      enabled.delete(rule);
      disabled.delete(rule);
      if (value !== presetRules.has(rule)) (value ? enabled : disabled).add(rule);
    };

    for (const rule of rules) apply(rule, on);
    if (on) {
      for (const set of catalog.exclusive) {
        const chosen = set.find((rule) => rules.includes(rule));
        if (chosen) set.filter((rule) => rule !== chosen).forEach((rule) => apply(rule, false));
      }
    }
    config.set(enabledKey, [...enabled].join(','));
    config.set(disabledKey, [...disabled].join(','));
  },

  resetOverrides(config: ConfigWriter = AppEnv.config) {
    config.set(enabledKey, '');
    config.set(disabledKey, '');
  },

  registerCatalogLoader(loader: (() => Promise<HarperRuleCatalog>) | null) {
    loadCatalog = loader;
  },

  catalog(): Promise<HarperRuleCatalog> {
    if (!loadCatalog) return Promise.reject(new Error('Harper is not active'));
    return loadCatalog();
  },
};
