const { parentPort } = require('worker_threads');

const localFetch = global.fetch;
global.fetch = (url, options) => {
  if (!String(url).startsWith('data:application/wasm;base64,')) {
    throw new Error('Harper may only load its bundled WASM binary');
  }
  return localFetch(url, options);
};

let linter;
let pending = Promise.resolve();

async function check({ text, locale, enabledRules, disabledRules }) {
  // Native import() must stay in JavaScript; TypeScript targets CommonJS.
  if (!linter) {
    const { LocalLinter } = await import('harper.js');
    const { binaryInlined } = await import('harper.js/binaryInlined');
    linter = new LocalLinter({ binary: binaryInlined });
    await linter.setup();
  }
  const dialects = { 'en-us': 0, 'en-gb': 1, 'en-au': 2, 'en-ca': 3, 'en-in': 4 };
  await linter.setDialect(dialects[locale] ?? 0);
  const config = await linter.getDefaultLintConfig();
  for (const rule of enabledRules) {
    if (Object.prototype.hasOwnProperty.call(config, rule)) config[rule] = true;
  }
  for (const rule of disabledRules) {
    if (Object.prototype.hasOwnProperty.call(config, rule)) config[rule] = false;
  }
  // Electron's native spellchecker owns spelling; Harper owns grammar and style.
  config.SpellCheck = false;
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
        if (category === 'Spelling') continue;
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
          issueType: 'grammar',
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
      parentPort.postMessage({ id: request.id, errors: await check(request) });
    } catch (error) {
      parentPort.postMessage({ id: request.id, error: error.message });
    }
  });
});
