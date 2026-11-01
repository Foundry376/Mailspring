import { HarperBackend } from '../internal_packages/composer-grammar-check/lib/grammar-check-service';

describe('Local Harper grammar checking', () => {
  let backend: HarperBackend;
  let config: Record<string, any>;

  beforeEach(() => {
    backend = new HarperBackend();
    config = {};
    spyOn(AppEnv.config, 'get').andCallFake((key) => config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key, value) => (config[key] = value));
    const localFetch = globalThis.fetch.bind(globalThis);
    spyOn(globalThis, 'fetch').andCallFake((url, ...args) => {
      if (!String(url).startsWith('data:')) throw new Error('Grammar must not access the network');
      return localFetch(url, ...args);
    });
  });

  it('checks real text locally with UTF-16 ranges and actionable replacements', () => {
    waitsForPromise(async () => {
      const text = '😀 This is a example. This is is wrong.';
      const errors = await backend.check(text, 'never-sent', 'en-US');
      const article = errors.find((error) => error.ruleId === 'AnA');
      expect(article).toBeDefined();
      expect(text.slice(article.offset, article.offset + article.length)).toBe('a');
      expect(article.offset).toBe(text.indexOf('a example'));
      expect(article.replacements).toContain('an');
      expect(errors.some((error) => error.ruleId === 'RepeatedWords')).toBe(true);
      expect(errors.some((error) => error.category === 'Spelling')).toBe(false);
    });
  });

  it('honors disabled rules, ignores unknown IDs, and can restore a rule', () => {
    waitsForPromise(async () => {
      const text = 'This is a example.';
      backend.addDisabledRule('AnA');
      config['core.composing.grammarCheckEnabledRules'] = 'AnA,UNKNOWN_LEGACY_RULE';
      expect((await backend.check(text, '', 'en')).some((e) => e.ruleId === 'AnA')).toBe(false);
      config['core.composing.grammarCheckDisabledRules'] = '';
      expect((await backend.check(text, '', 'en')).some((e) => e.ruleId === 'AnA')).toBe(true);
    });
  });

  it('does not pretend to support non-English languages', () => {
    waitsForPromise(async () => {
      expect(await backend.check('This is a example.', '', 'de-DE')).toEqual([]);
      expect(await backend.check('', '', 'en')).toEqual([]);
      expect(await backend.check('   ', '', 'auto')).toEqual([]);
    });
  });

  it('can enable an opt-in Harper rule without changing its default permanently', () => {
    waitsForPromise(async () => {
      const text = "I don't know.";
      expect(
        (await backend.check(text, '', 'en')).some((e) => e.ruleId === 'AvoidContractions')
      ).toBe(false);
      config['core.composing.grammarCheckEnabledRules'] = 'AvoidContractions';
      expect(
        (await backend.check(text, '', 'en')).some((e) => e.ruleId === 'AvoidContractions')
      ).toBe(true);
      config['core.composing.grammarCheckEnabledRules'] = '';
      expect(
        (await backend.check(text, '', 'en')).some((e) => e.ruleId === 'AvoidContractions')
      ).toBe(false);
    });
  });

  it('uses auto English isolation and does not duplicate native spellchecking', () => {
    waitsForPromise(async () => {
      expect((await backend.check('This is a example.')).some((e) => e.ruleId === 'AnA')).toBe(
        true
      );
      config['core.composing.grammarCheckEnabledRules'] = 'SpellCheck';
      const errors = await backend.check('The xyzzyplugh arrived.', '', 'en');
      expect(errors.some((error) => error.category === 'Spelling')).toBe(false);
    });
  });
});
