import { ipcRenderer } from 'electron';
import { Message, Contact } from 'mailspring-exports';
import { buildPrompt, compileJsonSchema, schemaHash, Schema } from '../lib/extraction/prompt';
import {
  normalizeAnswer,
  parseMoney,
  parseNumber,
  parseDate,
  looksLikeMoney,
  occursIn,
} from '../lib/extraction/normalize';
import { runExtractJob, cancelJobsForView } from '../lib/bridge/extract';
import { ViewGrant } from '../lib/bridge/grant';
import { FULL_GRANT } from '../../mcp-server/lib/capabilities/grant';
import * as bodies from '../lib/bridge/bodies';
import { cacheKey, EXTRACTION_MODEL_VERSION } from '../../../src/browser/extraction-model';

const SENT = new Date(2026, 9, 2, 10, 0); // Fri Oct 2 2026, 10:00 local

describe('View extraction', function viewExtractionSpec() {
  describe('normalization', () => {
    it('parses money with currency', () => {
      expect(parseMoney('$1,204.50')).toEqual({ amount: 1204.5, currency: 'USD' });
      expect(parseMoney('Amount: 8.40 USD')).toEqual({ amount: 8.4, currency: 'USD' });
      expect(parseMoney('€12,30')).toEqual({ amount: 12.3, currency: 'EUR' });
      expect(parseMoney('£1.234,56')).toEqual({ amount: 1234.56, currency: 'GBP' });
      expect(parseMoney('38 minutes $0.00')).toEqual({ amount: 0, currency: 'USD' });
      expect(parseMoney('null')).toBe(null);
      expect(parseMoney('free')).toBe(null);
    });

    it('parses numbers', () => {
      expect(parseNumber('3 items')).toBe(3);
      expect(parseNumber('1,000')).toBe(1000);
      expect(parseNumber(7)).toBe(7);
      expect(parseNumber('n/a')).toBe(null);
    });

    it('resolves dates against the message date, not today', () => {
      const tomorrow = new Date(parseDate('tomorrow', SENT));
      expect(tomorrow.getFullYear()).toBe(2026);
      expect(tomorrow.getMonth()).toBe(9);
      expect(tomorrow.getDate()).toBe(3);
      const noYear = new Date(parseDate('Fri, Oct 9', SENT));
      expect(noYear.getFullYear()).toBe(2026);
      expect(noYear.getDate()).toBe(9);
      expect(parseDate('none', SENT)).toBe(null);
      expect(parseDate('not a date at all', SENT)).toBe(null);
    });

    it('only accepts money that looks like money', () => {
      expect(looksLikeMoney('$8.40')).toBe(true);
      expect(looksLikeMoney('8.40 USD')).toBe(true);
      expect(looksLikeMoney('12.30')).toBe(true);
      expect(looksLikeMoney('1')).toBe(false);
      expect(looksLikeMoney('$25/hr')).toBe(false);
      expect(looksLikeMoney('420 Taylor Street')).toBe(false);
      expect(parseMoney('420 Taylor Street, San Francisco')).toBe(null);
    });

    it('rejects bare times as dates', () => {
      expect(parseDate('12pm – 12:30pm', SENT)).toBe(null);
      expect(parseDate('today', SENT)).not.toBe(null);
    });

    it('drops copied values that do not occur in the email', () => {
      const source = 'From: Microsoft <billing@microsoft.com>\nAmount: 1,204.50 USD';
      expect(occursIn('$1204.50', source, 'money')).toBe(true);
      expect(occursIn('$23.10', source, 'money')).toBe(false);
      expect(occursIn('microsoft', source, 'string')).toBe(true);
      expect(occursIn('Lyft', source, 'string')).toBe(false);
      expect(
        normalizeAnswer(
          { total: 'money', merchant: 'string' },
          { total: '$23.10', merchant: 'Lyft' },
          SENT,
          source
        )
      ).toBe(null);
    });

    it('normalizes a whole answer and maps empty answers to null', () => {
      const schema: Schema = {
        merchant: 'string',
        total: 'money',
        status: { type: 'enum', values: ['shipped', 'delivered'] },
        paid: 'boolean',
        items: { type: 'list', of: { name: 'string', price: 'money' } },
      };
      const value = normalizeAnswer(
        schema,
        {
          merchant: ' Lyft ',
          total: '$23.10',
          status: 'Delivered',
          paid: 'yes',
          items: [{ name: 'Ride', price: '$20' }, 'junk'],
        },
        SENT
      );
      expect(value).toEqual({
        merchant: 'Lyft',
        total: { amount: 23.1, currency: 'USD' },
        status: 'delivered',
        paid: true,
        items: [{ name: 'Ride', price: { amount: 20, currency: 'USD' } }],
      });
      expect(
        normalizeAnswer(
          schema,
          { merchant: 'null', total: null, status: 'lost', paid: null, items: [] },
          SENT
        )
      ).toBe(null);
      expect(normalizeAnswer(schema, null, SENT)).toBe(null);
    });
  });

  describe('prompt and schema compilation', () => {
    const schema: Schema = {
      carrier: { type: 'enum', values: ['UPS', 'FedEx'], description: 'the shipping carrier' },
      eta: 'date',
      tags: { type: 'list', of: 'string' },
    };

    it('compiles a flat schema into a nullable JSON schema', () => {
      expect(compileJsonSchema(schema)).toEqual({
        type: 'object',
        properties: {
          carrier: { enum: ['UPS', 'FedEx', null] },
          eta: { type: ['string', 'null'] },
          tags: { type: 'array', maxItems: 8, items: { type: ['string', 'null'] } },
        },
        required: ['carrier', 'eta', 'tags'],
      });
    });

    it('hashes schemas independent of key order and sensitive to instructions', () => {
      const reordered: Schema = { tags: schema.tags, eta: schema.eta, carrier: schema.carrier };
      expect(schemaHash(reordered)).toBe(schemaHash(schema));
      expect(schemaHash(schema, 'only US packages')).not.toBe(schemaHash(schema));
      expect(schemaHash({ ...schema, eta: 'string' })).not.toBe(schemaHash(schema));
    });

    it('builds a prompt with every field, the rules, and the email', () => {
      const prompt = buildPrompt(
        schema,
        {
          fromName: 'UPS',
          fromEmail: 'mcinfo@ups.com',
          subject: 'On the way',
          date: SENT,
          text: 'Tracking 1Z999',
        },
        'Ignore return labels.'
      );
      expect(prompt).toContain('- carrier: the shipping carrier; one of "UPS", "FedEx", or null');
      expect(prompt).toContain('- eta: the date as written, or null');
      expect(prompt).toContain('never invent one');
      expect(prompt).toContain('Also: Ignore return labels.');
      expect(prompt).toContain('From: UPS <mcinfo@ups.com>\nSubject: On the way');
      expect(prompt).toContain('Tracking 1Z999');
      expect(prompt.endsWith('<think>\n\n</think>\n\n')).toBe(true);
    });

    it('keys the answer cache by message, schema and model', () => {
      const a = cacheKey('m1', 'h1', EXTRACTION_MODEL_VERSION);
      expect(a).toBe(cacheKey('m1', 'h1', EXTRACTION_MODEL_VERSION));
      expect(a).not.toBe(cacheKey('m2', 'h1', EXTRACTION_MODEL_VERSION));
      expect(a).not.toBe(cacheKey('m1', 'h2', EXTRACTION_MODEL_VERSION));
      expect(a).not.toBe(cacheKey('m1', 'h1', 'other-model'));
    });
  });

  describe('runExtractJob', () => {
    const grant: ViewGrant = {
      viewId: 'spec-extract',
      namespace: 'view:spec-extract',
      permissions: new Set(['mail.bodies']),
      scope: FULL_GRANT,
    };
    const messages = ['a', 'b', 'c'].map(
      (id) =>
        new Message({
          id,
          accountId: 'acc',
          subject: `Receipt ${id}`,
          date: SENT,
          from: [new Contact({ name: 'Lyft', email: 'no-reply@lyft.com' })],
          body: `<p>Total $1${id === 'a' ? '1' : '2'}.00</p>`,
        } as any)
    );
    let requests;

    beforeEach(() => {
      requests = [];
      spyOn(bodies, 'messagesWithBodies').andCallFake(async (g, ids) =>
        messages.filter((m) => ids.includes(m.id))
      );
      spyOn(ipcRenderer, 'invoke').andCallFake(async (channel, req) => {
        if (channel === 'extraction:status') return { available: true };
        if (channel === 'extraction:cancel-view') return 0;
        requests.push(req);
        return req.items.map((item) =>
          req.cacheOnly
            ? null
            : {
                messageId: item.messageId,
                value: { total: item.messageId === 'a' ? '$11.00' : '$99.00' },
                cached: false,
                ms: 5,
              }
        );
      });
      window.localStorage.clear();
    });

    it('sends tier-0 misses to the model, normalizes answers, and drops ungrounded ones', async () => {
      const progress = [];
      await runExtractJob(grant, ['a', 'b'], { total: 'money' }, { cancelled: false }, (p) =>
        progress.push(p)
      );
      expect(requests.length).toBe(1);
      expect(requests[0].viewId).toBe('spec-extract');
      expect(requests[0].items.map((i) => i.messageId)).toEqual(['a', 'b']);
      const results = progress.reduce((all, p) => all.concat(p.results), []);
      // "b" says $12.00, so the model's $99.00 for it never reaches the View.
      expect(results.map((r) => r.value)).toEqual([
        { total: { amount: 11, currency: 'USD' } },
        null,
      ]);
      expect(results[0].tier).toBe('model');
      expect(progress[progress.length - 1].status).toBe('done');
    });

    it('stops with status quota and keeps earlier answers when units run out', async () => {
      spyOn(AppEnv.config, 'get').andCallFake((key) =>
        key === 'core.views.extractQuotaForTesting' ? 0 : undefined
      );
      const progress = [];
      await runExtractJob(
        grant,
        ['c'],
        { total: 'money', note: 'string' },
        { cancelled: false },
        (p) => progress.push(p)
      );
      expect(requests[0].cacheOnly).toBe(true);
      expect(progress[progress.length - 1].status).toBe('quota');
    });

    it('cancels a View’s jobs and its queued prompts', async () => {
      const job = { cancelled: false };
      const run = runExtractJob(
        grant,
        ['a'],
        { merchant: 'string', other: 'number' },
        job,
        () => {}
      );
      await cancelJobsForView('spec-extract');
      await run;
      expect(job.cancelled).toBe(true);
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('extraction:cancel-view', 'spec-extract');
    });
  });
});
