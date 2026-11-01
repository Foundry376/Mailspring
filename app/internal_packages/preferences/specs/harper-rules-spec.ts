import { HarperRules } from 'mailspring-exports';

const catalog = {
  groups: [],
  exclusive: [['OxfordComma', 'NoOxfordComma']],
  presets: {
    essentials: ['SpellCheck'],
    recommended: ['SpellCheck', 'OxfordComma', 'AnA'],
    everything: ['SpellCheck', 'OxfordComma', 'AnA', 'BoringWords'],
  },
};

describe('HarperRules', () => {
  let values: Record<string, unknown>;
  const config = {
    get: (key: string) => values[key],
    set: (key: string, value: unknown) => (values[key] = value),
  };
  const isEnabled = (rule: string) => HarperRules.isEnabled(rule, catalog as any, config);
  const setRules = (rules: string[], on: boolean) =>
    HarperRules.setRules(rules, on, catalog as any, config);

  beforeEach(() => {
    values = {};
  });

  it('defaults to Harper defaults', () => {
    expect(HarperRules.preset(config)).toBe('recommended');
    expect(isEnabled('AnA')).toBe(true);
    expect(isEnabled('BoringWords')).toBe(false);
  });

  it('stores only differences from the preset', () => {
    setRules(['BoringWords'], true);
    setRules(['AnA'], false);
    expect(values[HarperRules.enabledKey]).toBe('BoringWords');
    expect(values[HarperRules.disabledKey]).toBe('AnA');

    setRules(['BoringWords'], false);
    setRules(['AnA'], true);
    expect(values[HarperRules.enabledKey]).toBe('');
    expect(values[HarperRules.disabledKey]).toBe('');
  });

  it('keeps overrides across preset changes until they are reset', () => {
    setRules(['AnA'], false);
    values[HarperRules.presetKey] = 'everything';
    expect(isEnabled('AnA')).toBe(false);
    expect(isEnabled('BoringWords')).toBe(true);

    HarperRules.resetOverrides(config);
    expect(isEnabled('AnA')).toBe(true);
  });

  it('turns off the opposite when an exclusive rule is turned on', () => {
    setRules(['NoOxfordComma'], true);
    expect(isEnabled('NoOxfordComma')).toBe(true);
    expect(isEnabled('OxfordComma')).toBe(false);
  });

  it('preserves rule names it does not recognize', () => {
    values[HarperRules.disabledKey] = 'LegacyRule';
    setRules(['BoringWords'], true);
    expect(values[HarperRules.disabledKey]).toBe('LegacyRule');
  });
});
