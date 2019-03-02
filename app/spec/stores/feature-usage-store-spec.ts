import { Actions, TaskQueue } from 'mailspring-exports';
import FeatureUsageStore from '../../src/flux/stores/feature-usage-store';
import { IdentityStore } from '../../src/flux/stores/identity-store';

describe('FeatureUsageStore', function featureUsageStoreSpec() {
  beforeEach(() => {
    this.fakeIdentity = {
      id: 'foo',
      featureUsage: {
        'is-usable': {
          quota: 10,
          period: 'monthly',
          usedInPeriod: 8,
          featureLimitName: 'Usable Group A',
        },
        'not-usable': {
          quota: 10,
          period: 'monthly',
          usedInPeriod: 10,
          featureLimitName: 'Unusable Group A',
        },
      },
    };
    spyOn(IdentityStore, 'identity').and.returnValue(this.fakeIdentity);
    spyOn(IdentityStore, 'saveIdentity').and.callFake(async ident => {
      this.fakeIdentity = ident;
    });
  });

  describe('isUsable', () => {
    it("returns true if a feature hasn't met it's quota", () => {
      expect(FeatureUsageStore.isUsable('is-usable')).toBe(true);
    });

    it('returns false if a feature is at its quota', () => {
      expect(FeatureUsageStore.isUsable('not-usable')).toBe(false);
    });

    it('returns true if no quota is present for the feature', () => {
      spyOn(AppEnv, 'reportError');
      expect(FeatureUsageStore.isUsable('unsupported')).toBe(true);
      expect(AppEnv.reportError).toHaveBeenCalled();
    });
  });

  describe('markUsed', () => {
    beforeEach(() => {
      spyOn(Actions, 'queueTask');
    });

    afterEach(() => {
      TaskQueue._queue = [];
    });

    it('immediately increments the identity counter', () => {
      const before = this.fakeIdentity.featureUsage['is-usable'].usedInPeriod;
      FeatureUsageStore.markUsed('is-usable');
      const after = this.fakeIdentity.featureUsage['is-usable'].usedInPeriod;
      expect(after).toEqual(before + 1);
    });

    it('queues a task to sync the optimistic changes to the server', () => {
      FeatureUsageStore.markUsed('is-usable');
      expect(Actions.queueTask).toHaveBeenCalled();
    });
  });

  describe('markUsedOrUpgrade', () => {
    beforeEach(() => {
      spyOn(FeatureUsageStore, 'markUsed').and.returnValue(Promise.resolve());
      spyOn(Actions, 'openModal');
    });

    it("marks the feature used if it's usable", async () => {
      await FeatureUsageStore.markUsedOrUpgrade('is-usable');
      expect(FeatureUsageStore.markUsed).toHaveBeenCalled();
      expect(FeatureUsageStore.markUsed.callCount).toBe(1);
    });

    describe('showing modal', () => {
      beforeEach(() => {
        this.lexicon = {
          headerText: 'all test used',
          rechargeText: 'add a test to',
          iconUrl: 'icon url',
        };
      });

      it('resolves the modal if you upgrade', async () => {
        setImmediate(() => {
          this.fakeIdentity.featureUsage['not-usable'].quota = 10000;
          FeatureUsageStore._onModalClose();
        });
        await FeatureUsageStore.markUsedOrUpgrade('not-usable', this.lexicon);
        expect(Actions.openModal).toHaveBeenCalled();
        expect(Actions.openModal.calls.length).toBe(1);
      });

      it('pops open a modal with the correct text', async () => {
        setImmediate(() => {
          this.fakeIdentity.featureUsage['not-usable'].quota = 10000;
          FeatureUsageStore._onModalClose();
        });
        await FeatureUsageStore.markUsedOrUpgrade('not-usable', this.lexicon);
        expect(Actions.openModal).toHaveBeenCalled();
        expect(Actions.openModal.calls.length).toBe(1);
        const component = Actions.openModal.calls[0].args[0].component;
        expect(component.props).toEqual({
          modalClass: 'not-usable',
          headerText: 'all test used',
          iconUrl: 'icon url',
          rechargeText:
            'You can add a test to 10 emails a month with Mailspring Basic. Upgrade to Pro today!',
        });
      });

      it("rejects if you don't upgrade", async () => {
        let caughtError = false;
        setImmediate(() => {
          FeatureUsageStore._onModalClose();
        });
        try {
          await FeatureUsageStore.markUsedOrUpgrade('not-usable', this.lexicon);
        } catch (err) {
          expect(err instanceof FeatureUsageStore.NoProAccessError).toBe(true);
          caughtError = true;
        }
        expect(caughtError).toBe(true);
      });
    });
  });
});
