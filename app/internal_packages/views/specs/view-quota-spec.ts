import {
  continueLabel,
  exhaustedNotice,
  homeUsageLine,
  limitNotice,
  meterText,
  messageLengthHint,
  parseUsage,
  raiseStepCents,
} from '../lib/agent/quota';

const free = (used: number, usedCents: number) => ({
  plan: 'free' as const,
  period: 'unlimited',
  builds: { used, limit: 2 },
  spend: { usedCents, limitCents: 500 },
  resetsAt: null,
});
const pro = (used: number, usedCents: number) => ({
  plan: 'pro' as const,
  period: '2026-10',
  builds: { used, limit: 10 },
  spend: { usedCents, limitCents: 800 },
  resetsAt: '2026-11-01T00:00:00.000Z',
});

describe('View agent quota', () => {
  describe('limitNotice', () => {
    it('words each plan and limit', () => {
      expect(limitNotice('quota', { plan: 'free', limit: 2, period: 'unlimited' }).message).toBe(
        'Thanks for trying out Views! Upgrade to Mailspring Pro and build 10 new Views every month.'
      );
      expect(
        limitNotice('spend_quota', { plan: 'free', limitCents: 500, period: 'unlimited' }).message
      ).toBe(
        "You've used the AI tokens included with your trial of this Pro feature. Upgrade to Mailspring Pro and build 10 new Views every month."
      );
      expect(
        limitNotice('quota', {
          plan: 'pro',
          limit: 10,
          period: 'monthly',
          resetsAt: '2026-11-01T00:00:00.000Z',
        }).message
      ).toBe("You've built 10 Views this month. Your limit resets on November 1.");
      expect(
        limitNotice('spend_quota', {
          plan: 'pro',
          limitCents: 800,
          period: 'monthly',
          resetsAt: '2026-11-01T00:00:00.000Z',
        }).message
      ).toBe(
        "You've used up the AI tokens included in your Pro subscription this month. Tokens reset on November 1."
      );
    });

    it('quotes the Pro build allowance from the payload to free users', () => {
      const notice = limitNotice('quota', {
        plan: 'free',
        limit: 3,
        proLimits: { builds: 25 },
      });
      expect(notice.message).toContain('build 25 new Views every month');
    });

    it('only offers an upgrade on the free plan', () => {
      expect(limitNotice('quota', { plan: 'free', limit: 2 }).canUpgrade).toBe(true);
      expect(limitNotice('quota', { plan: 'pro', limit: 10 }).canUpgrade).toBe(false);
    });

    it('never leaves a placeholder when fields are missing', () => {
      for (const code of ['quota', 'spend_quota']) {
        for (const plan of ['free', 'pro'] as const) {
          const text = limitNotice(code, { plan }).message;
          expect(text).not.toContain('%');
          expect(text).not.toContain('undefined');
        }
      }
      expect(limitNotice('offline', {})).toBe(null);
    });
  });

  describe('budget raises', () => {
    it('steps by $2, or by what is left of the allowance', () => {
      expect(raiseStepCents(null)).toBe(200);
      expect(raiseStepCents(free(1, 100))).toBe(200);
      expect(raiseStepCents(free(1, 420))).toBe(80);
      expect(raiseStepCents(free(1, 500))).toBe(0);
      expect(raiseStepCents(pro(1, 812))).toBe(0);
    });

    it('labels the Continue button with the actual amount', () => {
      expect(continueLabel(200)).toBe('Continue +$2');
      expect(continueLabel(80)).toBe('Continue +$0.80');
      expect(continueLabel(150)).toBe('Continue +$1.50');
    });

    it('describes an exhausted allowance as a notice', () => {
      expect(exhaustedNotice(free(1, 200), 'spend')).toBe(null);
      expect(exhaustedNotice(free(1, 500), 'spend').message).toContain('AI tokens included');
      expect(exhaustedNotice(pro(10, 10), 'build').message).toContain('10 Views this month');
    });
  });

  describe('usage', () => {
    it('parses the /usage response and rejects malformed ones', () => {
      expect(parseUsage(pro(3, 120))).toEqual(pro(3, 120));
      expect(parseUsage({ ...free(0, 0), plan: 'enterprise' }).plan).toBe('free');
      expect(parseUsage(null)).toBe(null);
      expect(parseUsage({ builds: { used: 1 } })).toBe(null);
      expect(parseUsage({ builds: { used: 1, limit: 2 }, spend: { usedCents: '5' } })).toBe(null);
    });

    it('formats the panel meter and the home line by plan', () => {
      expect(meterText(free(1, 311))).toBe(null);
      expect(meterText(free(1, 375))).toBe('$3.75 of $5.00 used');
      expect(meterText(pro(3, 120))).toBe(null);
      expect(meterText(pro(3, 700))).toBe('$7.00 of $8.00 this month');
      expect(homeUsageLine(free(2, 311))).toBe('2 of 2 free Views used');
      expect(homeUsageLine(free(5, 311))).toBe('2 of 2 free Views used');
      expect(homeUsageLine(pro(3, 120))).toBe('3 of 10 Views this month');
      expect(homeUsageLine(pro(3, 700))).toBe('3 of 10 Views this month · $7.00 of $8.00');
      const single = (used: number) => ({ ...free(used, 0), builds: { used, limit: 1 } });
      expect(homeUsageLine(single(0))).toBe(
        'Custom views are a Mailspring Pro feature, but you can try building one for free!'
      );
      expect(homeUsageLine(single(1))).toBe(
        'Custom views are a Mailspring Pro feature - Upgrade today to create more Views!'
      );
    });
  });

  describe('messageLengthHint', () => {
    it('stays quiet for short messages, counts near the limit and explains once over', () => {
      expect(messageLengthHint(120)).toBe(null);
      expect(messageLengthHint(3599)).toBe(null);
      expect(messageLengthHint(3812)).toEqual({ over: false, text: '3,812 / 4,000' });
      expect(messageLengthHint(4000)).toEqual({ over: false, text: '4,000 / 4,000' });
      expect(messageLengthHint(5210)).toEqual({
        over: true,
        text: 'Messages can be up to 4,000 characters — this one is 5,210.',
      });
      expect(messageLengthHint(2100, 2000).over).toBe(true);
    });
  });
});
