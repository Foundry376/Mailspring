const configKey = 'core.composing.grammarCheckLearnedWords';

function normalize(words: unknown): string[] {
  if (!Array.isArray(words)) return [];
  return [
    ...new Set(
      words
        .filter((word): word is string => typeof word === 'string')
        .map((word) => word.trim())
        .filter(Boolean)
    ),
  ];
}

export const HarperDictionary = {
  configKey,
  normalize,
  words(config: { get: (key: string) => unknown } = AppEnv.config): string[] {
    return normalize(config.get(configKey));
  },
  learn(word: string) {
    const words = normalize([...this.words(), word]);
    AppEnv.config.set(configKey, words);
  },
};
