import MailspringStore from 'mailspring-store';

class NoProAccessError extends Error {}

export interface FeatureLexicon {
  headerText: string;
  rechargeText: string;
  iconUrl: string;
}

/** Local features have no subscription quotas or cloud usage reporting. */
class _FeatureUsageStore extends MailspringStore {
  NoProAccessError = NoProAccessError;

  isUsable(_feature: string) {
    return true;
  }

  async markUsedOrUpgrade(_feature: string, _lexicon: FeatureLexicon): Promise<void> {}

  markUsed(_feature: string) {}

  async displayUpgradeModal(_feature: string, _lexicon: FeatureLexicon): Promise<void> {
    throw new NoProAccessError(
      'Mailspring cloud subscriptions are not available in BetterMailspring.'
    );
  }

  deactivate() {
    this.stopListeningToAll();
  }
}

export const FeatureUsageStore = new _FeatureUsageStore();
