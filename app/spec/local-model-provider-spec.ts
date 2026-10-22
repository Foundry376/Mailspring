import {
  AppleFMHelper,
  HelperError,
  parseHelperLine,
  supportsSystemModel,
} from '../src/browser/apple-fm';
import {
  AppleFMBackend,
  backendModelVersion,
  completeAnswer,
  fitToContext,
  selectBackend,
  splitChatPrompt,
} from '../src/browser/local-model-provider';

const APPLE = { available: true, name: 'Apple Intelligence', contextSize: 4096 };
const NO_APPLE = {
  available: false,
  reason: 'appleIntelligenceNotEnabled',
  name: 'Apple Intelligence',
};

const chat = (system: string, user: string) =>
  `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;

function fakeHelper(responses: any[]) {
  const calls: any[] = [];
  const helper = {
    generate: (req) => {
      calls.push(req);
      const next = responses.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    warmup: () => Promise.resolve(),
  } as unknown as AppleFMHelper;
  return { helper, calls };
}

describe('local model backends', () => {
  describe('selectBackend', () => {
    it('uses Apple’s model when it is available and the user left the choice on auto', () => {
      expect(selectBackend('auto', APPLE)).toBe('apple-fm');
    });

    it('uses Qwen when Apple’s model is unavailable, checking, or the user picked Qwen', () => {
      expect(selectBackend('auto', NO_APPLE)).toBe('llama-qwen');
      expect(selectBackend('auto', { available: false, reason: 'checking', name: 'x' })).toBe(
        'llama-qwen'
      );
      expect(selectBackend('qwen', APPLE)).toBe('llama-qwen');
    });
  });

  describe('backendModelVersion', () => {
    it('keys Apple answers to the OS build and Qwen answers to the pinned file', () => {
      expect(backendModelVersion('apple-fm', 'qwen@abc', { osBuild: '26A434' })).toBe(
        'apple-fm@26A434'
      );
      expect(backendModelVersion('llama-qwen', 'qwen@abc', { osBuild: '26A434' })).toBe('qwen@abc');
      expect(backendModelVersion('apple-fm', 'q', { osBuild: '26A434' })).not.toBe(
        backendModelVersion('apple-fm', 'q', { osBuild: '26B12' })
      );
    });
  });

  describe('splitChatPrompt', () => {
    it('turns the Qwen chat template into instructions and a prompt', () => {
      expect(splitChatPrompt(chat('Extract fields.', 'EMAIL:\nhi'))).toEqual({
        instructions: 'Extract fields.',
        prompt: 'EMAIL:\nhi',
      });
    });

    it('passes a plain prompt through', () => {
      expect(splitChatPrompt('just text')).toEqual({ instructions: '', prompt: 'just text' });
    });
  });

  describe('fitToContext', () => {
    it('leaves prompts that fit alone and trims the tail of ones that don’t', () => {
      expect(fitToContext('sys', 'short', 200, 4096)).toBe('short');
      const long = 'x'.repeat(40000);
      const fitted = fitToContext('sys', long, 200, 4096);
      expect(fitted.length).toBeLessThan(long.length);
      expect(fitted.length).toBeGreaterThan(8000);
      expect(fitToContext('sys', long, 200, 8192).length).toBeGreaterThan(fitted.length);
    });
  });

  describe('completeAnswer', () => {
    it('fills fields the model omitted with null', () => {
      const schema = { properties: { a: {}, b: {} } };
      expect(completeAnswer({ a: 1 }, schema)).toEqual({ a: 1, b: null });
    });

    it('treats the string "null" as no value', () => {
      const schema = { properties: { total: {}, merchant: {} } };
      expect(completeAnswer({ total: 'null', merchant: 'Uber' }, schema)).toEqual({
        total: null,
        merchant: 'Uber',
      });
    });
  });

  describe('AppleFMBackend', () => {
    const schema = { type: 'object', properties: { total: {}, merchant: {} } };
    const sleep = () => Promise.resolve();

    it('sends instructions and prompt separately and completes the answer', async () => {
      const { helper, calls } = fakeHelper([{ value: { total: '$4.00' }, ms: 900 }]);
      const backend = new AppleFMBackend(helper, () => 4096, sleep);
      const result = await backend.run({
        prompt: chat('S', 'U'),
        jsonSchema: schema,
        maxTokens: 100,
      });
      expect(calls[0].instructions).toBe('S');
      expect(calls[0].prompt).toBe('U');
      expect(result.value).toEqual({ total: '$4.00', merchant: null });
    });

    it('treats a guardrail refusal as no value rather than an error', async () => {
      const { helper } = fakeHelper([new HelperError('refused', 'guardrailViolation')]);
      const backend = new AppleFMBackend(helper, () => 4096, sleep);
      const result = await backend.run({ prompt: 'p', jsonSchema: schema, maxTokens: 100 });
      expect(result.value).toBe(null);
      expect(result.refused).toBe(true);
    });

    it('backs off and retries when rate limited', async () => {
      const { helper, calls } = fakeHelper([
        new HelperError('rateLimited', ''),
        new HelperError('rateLimited', ''),
        { value: { total: null, merchant: 'Uber' }, ms: 1 },
      ]);
      const waits: number[] = [];
      const backend = new AppleFMBackend(
        helper,
        () => 4096,
        (ms) => {
          waits.push(ms);
          return Promise.resolve();
        }
      );
      const result = await backend.run({ prompt: 'p', jsonSchema: schema, maxTokens: 100 });
      expect(calls.length).toBe(3);
      expect(waits.length).toBe(2);
      expect(result.value.merchant).toBe('Uber');
      expect(backend.throttled).toBe(false);
    });

    it('retries once with a shorter prompt when the context is exceeded, then gives up', async () => {
      const { helper, calls } = fakeHelper([
        new HelperError('contextExceeded', ''),
        new HelperError('contextExceeded', ''),
      ]);
      const backend = new AppleFMBackend(helper, () => 4096, sleep);
      let error = null;
      try {
        await backend.run({ prompt: 'x'.repeat(1000), jsonSchema: schema, maxTokens: 100 });
      } catch (err) {
        error = err;
      }
      expect(calls.length).toBe(2);
      expect(calls[1].prompt.length).toBe(500);
      expect(error.code).toBe('contextExceeded');
    });

    it('returns free text when there is no schema', async () => {
      const { helper } = fakeHelper([{ text: '  A busy day.  ', ms: 1 }]);
      const backend = new AppleFMBackend(helper, () => 4096, sleep);
      const result = await backend.run({ prompt: 'p', jsonSchema: null, maxTokens: 100 });
      expect(result.value).toEqual({ text: 'A busy day.' });
    });
  });

  describe('helper protocol', () => {
    it('parses replies and ignores anything else on stdout', () => {
      expect(parseHelperLine('{"id":3,"result":{"available":true}}')).toEqual({
        id: 3,
        result: { available: true },
      });
      expect(parseHelperLine('{"id":"3"}')).toBe(null);
      expect(parseHelperLine('not json')).toBe(null);
      expect(parseHelperLine('')).toBe(null);
    });

    it('only offers the system model on Apple-silicon macOS 26 or later', () => {
      expect(supportsSystemModel('darwin', 'arm64', '25.0.0')).toBe(true);
      expect(supportsSystemModel('darwin', 'arm64', '26.1.0')).toBe(true);
      expect(supportsSystemModel('darwin', 'arm64', '24.6.0')).toBe(false);
      expect(supportsSystemModel('darwin', 'x64', '25.0.0')).toBe(false);
      expect(supportsSystemModel('win32', 'arm64', '10.0.0')).toBe(false);
    });
  });
});
