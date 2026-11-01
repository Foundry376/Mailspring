const { parentPort } = require('worker_threads');

const localFetch = global.fetch;
global.fetch = (url, options) => {
  if (!String(url).startsWith('data:application/wasm;base64,')) {
    throw new Error('Harper may only load its bundled WASM binary');
  }
  return localFetch(url, options);
};

// Opposites Harper's structured config does not declare as a OneOfMany setting.
const EXTRA_EXCLUSIVE_RULES = [['AnotherThingComing', 'AnotherThinkComing']];
const NON_ESSENTIAL_GROUPS = new Set([
  'Style and Redundancy',
  'Word Choice and Usage',
  'Regionalisms and Dialect',
  'Miscellaneous',
]);
const ALWAYS_ESSENTIAL_RULES = ['SpellCheck', 'RepeatedWords'];

let linter;
let catalog;
let dictionaryKey = '[]';
let pending = Promise.resolve();

async function getLinter() {
  // Native import() must stay in JavaScript; TypeScript targets CommonJS.
  if (!linter) {
    const { LocalLinter } = await import('harper.js');
    const { binaryInlined } = await import('harper.js/binaryInlined');
    linter = new LocalLinter({ binary: binaryInlined });
    await linter.setup();
  }
  return linter;
}

async function getRuleCatalog() {
  if (catalog) return catalog;
  const harper = await getLinter();
  const defaults = await harper.getDefaultLintConfig();
  const descriptions = await harper.getLintDescriptions();
  const { settings } = await harper.getStructuredLintConfig();

  const exclusive = [...EXTRA_EXCLUSIVE_RULES];
  const groups = settings
    .filter((setting) => setting.Group)
    .map(({ Group: { label, description, child } }) => {
      const names = child.settings.flatMap((setting) => {
        if (setting.Bool) return [setting.Bool.name];
        if (!setting.OneOfMany) return [];
        exclusive.push(setting.OneOfMany.names);
        return setting.OneOfMany.names;
      });
      return {
        label,
        description,
        rules: names.map((name) => ({ name, description: descriptions[name] || '' })),
      };
    });

  const allRules = groups.flatMap((group) => group.rules.map((rule) => rule.name));
  const nonDefaultAlternatives = new Set(exclusive.flat().filter((name) => !defaults[name]));
  const nonEssential = new Set(
    groups
      .filter((group) => NON_ESSENTIAL_GROUPS.has(group.label))
      .flatMap((group) => group.rules.map((rule) => rule.name))
  );
  const recommended = allRules.filter((name) => defaults[name]);
  catalog = {
    groups,
    exclusive,
    presets: {
      essentials: [
        ...new Set([
          ...recommended.filter((name) => !nonEssential.has(name)),
          ...ALWAYS_ESSENTIAL_RULES,
        ]),
      ],
      recommended,
      everything: allRules.filter((name) => !nonDefaultAlternatives.has(name)),
    },
  };
  return catalog;
}

async function check({ text, locale, preset, enabledRules, disabledRules, learnedWords = [] }) {
  const { presets } = await getRuleCatalog();
  await getLinter();
  const dialects = { 'en-us': 0, 'en-gb': 1, 'en-au': 2, 'en-ca': 3, 'en-in': 4 };
  await linter.setDialect(dialects[locale] ?? 0);
  const nextDictionaryKey = JSON.stringify(learnedWords);
  if (dictionaryKey !== nextDictionaryKey) {
    await linter.clearWords();
    await linter.importWords(learnedWords);
    dictionaryKey = nextDictionaryKey;
  }
  const presetRules = new Set(presets[preset] || presets.recommended);
  const config = await linter.getDefaultLintConfig();
  for (const rule of Object.keys(config)) config[rule] = presetRules.has(rule);
  for (const rule of enabledRules) {
    if (Object.prototype.hasOwnProperty.call(config, rule)) config[rule] = true;
  }
  for (const rule of disabledRules) {
    if (Object.prototype.hasOwnProperty.call(config, rule)) config[rule] = false;
  }
  await linter.setLintConfig(config);
  const descriptions = await linter.getLintDescriptions();
  const groups = await linter.organizedLints(text, {
    language: 'plaintext',
    isolateEnglish: locale === 'auto',
  });
  const errors = [];
  for (const [ruleId, lints] of Object.entries(groups)) {
    for (const lint of lints) {
      try {
        const category = lint.lint_kind();
        const span = lint.span();
        const offset = span.start;
        const length = span.end - span.start;
        span.free();
        const replacements = lint.suggestions().map((suggestion) => {
          try {
            const replacement = suggestion.get_replacement_text();
            return suggestion.kind() === 2
              ? text.slice(offset, offset + length) + replacement
              : replacement;
          } finally {
            suggestion.free();
          }
        });
        errors.push({
          offset,
          length,
          message: lint.message(),
          shortMessage: '',
          replacements,
          ruleId,
          ruleDescription: descriptions[ruleId] || ruleId,
          category,
          categoryName: lint.lint_kind_pretty(),
          issueType: category === 'Spelling' ? 'misspelling' : 'grammar',
          sentence: text,
          contextText: text,
          contextOffset: offset,
          contextLength: length,
        });
      } finally {
        lint.free();
      }
    }
  }
  return errors.sort((a, b) => a.offset - b.offset);
}

parentPort.on('message', (request) => {
  // Configuration and linting share a mutable WASM linter. Serialize across drafts.
  pending = pending.then(async () => {
    try {
      const result = await (request.type === 'catalog' ? getRuleCatalog() : check(request));
      parentPort.postMessage({ id: request.id, result });
    } catch (error) {
      parentPort.postMessage({ id: request.id, error: error.message });
    }
  });
});
