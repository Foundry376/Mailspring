/* eslint-disable */
/**
 * Utility-process half of on-device extraction (docs/plans/sandboxed-views-exploration.md §9).
 *
 * Holds the one bundled model and runs one prompt at a time. Everything else (queueing,
 * caching, prompt construction, normalization) lives in the processes that own the data, so
 * this file only turns `{ prompt, jsonSchema }` into JSON constrained to that schema. Running
 * it here keeps model memory and CPU out of the main process, and a crash in llama.cpp takes
 * down only this process.
 *
 * Plain CommonJS on purpose: utility processes don't get the app's TypeScript compile cache.
 * node-llama-cpp is ESM-only, so it is loaded with a dynamic import.
 */
const path = require('path');

let llamaModule = null;
let llama = null;
let model = null;
let context = null;
let sequence = null;
let completion = null;
const grammars = new Map();

async function load({ modelPath, gpu, threads, contextSize }) {
  llamaModule = await import(
    path.join(process.env.MAILSPRING_APP_NODE_MODULES, 'node-llama-cpp', 'dist', 'index.js')
  );
  // Only the prebuilt binaries that ship with the app: never download or compile llama.cpp on
  // a user's machine.
  llama = await llamaModule.getLlama({
    gpu: gpu ? 'auto' : false,
    build: 'never',
    skipDownload: true,
    progressLogs: false,
  });
  model = await llama.loadModel({ modelPath, gpuLayers: llama.gpu ? 'max' : 0 });
  context = await model.createContext({
    contextSize,
    threads: llama.gpu ? undefined : threads,
  });
  sequence = context.getSequence();
  completion = new llamaModule.LlamaCompletion({ contextSequence: sequence });
  return { gpu: llama.gpu || 'cpu' };
}

async function grammarFor(key, jsonSchema) {
  if (!grammars.has(key)) {
    grammars.set(key, await llama.createGrammarForJsonSchema(jsonSchema));
  }
  return grammars.get(key);
}

async function run({ prompt, jsonSchema, schemaKey, maxTokens }) {
  const grammar = await grammarFor(schemaKey, jsonSchema);
  const started = Date.now();
  try {
    // A plain string keeps `<|im_start|>` markers as text. That measured better than real
    // special tokens on the eval set (§9.8), so the template stays in this form.
    const raw = await completion.generateCompletion(prompt, { grammar, maxTokens, temperature: 0 });
    let value = null;
    try {
      value = grammar.parse(raw);
    } catch (err) {
      value = null;
    }
    return { raw, value, ms: Date.now() - started };
  } finally {
    // Qwen3.5 is a hybrid recurrent model, so a partially matching prefix can't be reused;
    // every prompt starts from an empty sequence.
    await sequence.clearHistory();
  }
}

process.parentPort.on('message', async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      process.parentPort.postMessage({ id, result: await load(data) });
    } else if (type === 'run') {
      process.parentPort.postMessage({ id, result: await run(data) });
    }
  } catch (err) {
    process.parentPort.postMessage({ id, error: String((err && err.message) || err) });
  }
});
