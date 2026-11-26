import { OpenRouterEngine, parseJSONAnswer } from '../src/browser/openrouter';
import { chatPrompt } from '../src/flux/stores/local-model-prompt';

function response(status: number, body: any, headers: { [k: string]: string } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: (name: string) => headers[name.toLowerCase()] || null },
    json: () => Promise.resolve(body),
  } as any;
}

function engine(responses: any[]) {
  const calls: { url: string; init: any }[] = [];
  const fetch = (url: string, init: any) => {
    calls.push({ url, init: { ...init, body: init.body && JSON.parse(init.body) } });
    return Promise.resolve(responses.shift());
  };
  return { calls, engine: new OpenRouterEngine({ fetch, wait: () => Promise.resolve() }) };
}

const schema = { type: 'object', properties: { merchant: { type: 'string' } } };

describe('OpenRouterEngine', function () {
  it('sends system and user messages and asks for the schema', async function () {
    const { calls, engine: e } = engine([
      response(200, { choices: [{ message: { content: '{"merchant":"Lyft"}' } }] }),
    ]);
    const result = await e.run({
      apiKey: 'sk-or-test',
      model: 'vendor/model',
      prompt: chatPrompt('Find the merchant.', 'Your Lyft receipt'),
      jsonSchema: schema,
      maxTokens: 200,
    });
    expect(result.value).toEqual({ merchant: 'Lyft' });
    const { url, init } = calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-or-test');
    expect(init.body.model).toBe('vendor/model');
    expect(init.body.messages).toEqual([
      { role: 'system', content: 'Find the merchant.' },
      { role: 'user', content: 'Your Lyft receipt' },
    ]);
    expect(init.body.response_format.json_schema.schema).toEqual(schema);
    expect(init.body.provider).toEqual({ require_parameters: true });
    expect(init.body.max_tokens).toBeGreaterThan(200);
  });

  it('returns free text without a schema, and fills fields the model left out', async function () {
    const { engine: e } = engine([
      response(200, { choices: [{ message: { content: '  A summary.  ' } }] }),
      response(200, { choices: [{ message: { content: '```json\n{}\n```' } }] }),
    ]);
    const base = { apiKey: 'k', model: 'm', prompt: chatPrompt('s', 'u'), maxTokens: 10 };
    expect((await e.run({ ...base, jsonSchema: null })).value).toEqual({ text: 'A summary.' });
    expect((await e.run({ ...base, jsonSchema: schema })).value).toEqual({ merchant: null });
  });

  it('retries rate limits and reports OpenRouter’s error message', async function () {
    const { calls, engine: e } = engine([
      response(429, {}),
      response(401, { error: { message: 'No auth credentials found' } }),
    ]);
    let error: Error = null;
    try {
      await e.run({ apiKey: 'k', model: 'm', prompt: 'p', jsonSchema: null, maxTokens: 10 });
    } catch (err) {
      error = err;
    }
    expect(calls.length).toBe(2);
    expect(error.message).toBe('No auth credentials found');
  });

  it('parses JSON answers, with or without a Markdown fence', function () {
    expect(parseJSONAnswer('{"a":1}')).toEqual({ a: 1 });
    expect(parseJSONAnswer('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJSONAnswer('not json')).toBe(null);
  });
});
