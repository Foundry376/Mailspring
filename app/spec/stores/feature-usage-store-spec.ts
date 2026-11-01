import { Actions } from 'mailspring-exports';
import { FeatureUsageStore } from '../../src/flux/stores/feature-usage-store';
import { IdentityStore } from '../../src/flux/stores/identity-store';

describe('Cloud-free FeatureUsageStore compatibility', () => {
  const lexicon = { headerText: '', rechargeText: '', iconUrl: '' };

  beforeEach(() => {
    spyOn(Actions, 'queueTask');
    spyOn(Actions, 'openModal');
    spyOn(IdentityStore, 'saveIdentity');
    spyOn(IdentityStore, 'identity').andReturn({
      featureUsage: { snooze: { quota: 1, usedInPeriod: 100 } },
    });
  });

  it('ignores legacy quotas for local features', () => {
    expect(FeatureUsageStore.isUsable('snooze')).toBe(true);
    expect(FeatureUsageStore.isUsable('send-later')).toBe(true);
    expect(FeatureUsageStore.isUsable('send-reminders')).toBe(true);
    expect(IdentityStore.identity).not.toHaveBeenCalled();
  });

  it('does not report usage, mutate identity, or open subscription prompts', () => {
    waitsForPromise(async () => {
      for (let i = 0; i < 30; i++) {
        await FeatureUsageStore.markUsedOrUpgrade('snooze', lexicon);
        FeatureUsageStore.markUsed('snooze');
      }
      expect(Actions.queueTask).not.toHaveBeenCalled();
      expect(Actions.openModal).not.toHaveBeenCalled();
      expect(IdentityStore.saveIdentity).not.toHaveBeenCalled();
    });
  });

  it('rejects obsolete upgrade requests without pretending cloud service is available', () => {
    waitsForPromise(async () => {
      let error: Error;
      try {
        await FeatureUsageStore.displayUpgradeModal('cloud-service', lexicon);
      } catch (err) {
        error = err;
      }
      expect(error instanceof FeatureUsageStore.NoProAccessError).toBe(true);
      expect(Actions.openModal).not.toHaveBeenCalled();
      expect(Actions.queueTask).not.toHaveBeenCalled();
    });
  });
});
