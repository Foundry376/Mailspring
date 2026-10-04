import {
  continueLabel,
  exhaustedNotice,
  homeUsageLine,
  limitNotice,
  meterText,
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
    it('words each plan and limit from the payload', () => {
      expect(limitNotice('quota', { plan: 'free', limit: 2, period: 'unlimited' }).message).toBe(
        "You've used your 2 free Views. Upgrade to Pro to build up to 10 Views a month."
      );
      expect(
        limitNotice('spend_quota', { plan: 'free', limitCents: 500, period: 'unlimited' }).message
      ).toBe(
        "You've used the $5.00 of AI building included with the free plan. Upgrade to Pro for $8.00 of building every month."
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
      ).toBe("You've used this month's $8.00 of AI building. It resets on November 1.");
    });

    it('takes its numbers from the payload, including Pro limits quoted to free users', () => {
      const notice = limitNotice('quota', {
        plan: 'free',
        limit: 3,
        proLimits: { builds: 25 },
      });
      expect(notice.message).toContain('3 free Views');
      expect(notice.message).toContain('up to 25 Views a month');
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
      expect(exhaustedNotice(free(1, 500), 'spend').message).toContain('$5.00');
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
      expect(meterText(free(1, 311))).toBe('$3.11 of $5.00 used');
      expect(meterText(pro(3, 120))).toBe('$1.20 of $8.00 this month');
      expect(homeUsageLine(free(2, 311))).toBe('2 of 2 free Views used');
      expect(homeUsageLine(free(5, 311))).toBe('2 of 2 free Views used');
      expect(homeUsageLine(pro(3, 120))).toBe('3 of 10 Views this month · $1.20 of $8.00');
    });
  });
});
