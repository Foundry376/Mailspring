import MailspringStore from 'mailspring-store';

export interface IIdentity {
  id: string;
  token: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  stripePlan: string;
  stripePlanEffective: string;
  featureUsage: {
    [featureKey: string]: {
      featureLimitName: 'pro';
      usedInPeriod: number;
      quota: number;
      period: 'weekly' | 'monthly';
    };
  };
}

export type IdentityAuthResponse = IIdentity | { skipped: true };

export const EMPTY_FEATURE_USAGE = {
  featureLimitName: 'pro',
  period: 'monthly',
  usedInPeriod: 0,
  quota: 0,
};

/**
 * Compatibility surface for plugins and sync clients. BetterMailspring has no
 * cloud identity; existing config and keychain entries are left untouched.
 */
class _IdentityStore extends MailspringStore {
  identity(): IIdentity | null {
    return null;
  }

  identityId(): string | null {
    return null;
  }

  hasProFeatures() {
    return false;
  }

  async saveIdentity(_identity: IIdentity | null): Promise<void> {}

  async fetchIdentity(): Promise<IIdentity | null> {
    return null;
  }

  fetchIdentitySoon = () => {};

  async fetchSingleSignOnURL(
    _path: string,
    _options: { source?: string; campaign?: string; content?: string } = {}
  ): Promise<string> {
    throw new Error('Mailspring cloud sign-in is not available in BetterMailspring.');
  }

  deactivate() {
    this.stopListeningToAll();
  }
}

export const IdentityStore = new _IdentityStore();
