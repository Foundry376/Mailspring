import { KeyManager } from 'mailspring-exports';
import { IdentityStore, IIdentity } from '../../src/flux/stores/identity-store';
import * as MailspringAPIRequest from '../../src/flux/mailspring-api-request';

describe('Cloud-free IdentityStore compatibility', () => {
  beforeEach(() => {
    spyOn(KeyManager, 'getPassword');
    spyOn(KeyManager, 'deletePassword');
    spyOn(KeyManager, 'replacePassword');
    spyOn(AppEnv.config, 'set');
    spyOn(AppEnv.config, 'get').andReturn({ id: 'legacy', token: 'legacy-token' });
    spyOn(MailspringAPIRequest, 'makeRequest');
  });

  it('does not expose a legacy identity or paid entitlement', () => {
    expect(IdentityStore.identity()).toBe(null);
    expect(IdentityStore.identityId()).toBe(null);
    expect(IdentityStore.hasProFeatures()).toBe(false);
    expect(AppEnv.config.get).not.toHaveBeenCalled();
    expect(KeyManager.getPassword).not.toHaveBeenCalled();
  });

  it('leaves existing account config and credentials untouched', () => {
    waitsForPromise(async () => {
      await IdentityStore.saveIdentity({ id: 'legacy', token: 'legacy-token' } as IIdentity);
      await IdentityStore.saveIdentity(null);
      expect(IdentityStore.identity()).toBe(null);
      expect(AppEnv.config.set).not.toHaveBeenCalled();
      expect(KeyManager.deletePassword).not.toHaveBeenCalled();
      expect(KeyManager.replacePassword).not.toHaveBeenCalled();
    });
  });

  it('does not fetch or poll Mailspring identity services', () => {
    waitsForPromise(async () => {
      jasmine.Clock.useMock();
      const Store = IdentityStore.constructor as new () => typeof IdentityStore;
      const store = new Store();
      expect(await store.fetchIdentity()).toBe(null);
      store.fetchIdentitySoon();
      jasmine.Clock.tick(1000 * 60 * 30);
      expect(MailspringAPIRequest.makeRequest).not.toHaveBeenCalled();
      store.deactivate();
    });
  });

  it('rejects cloud SSO without creating a login link', () => {
    waitsForPromise(async () => {
      let error: Error;
      try {
        await IdentityStore.fetchSingleSignOnURL('/payment');
      } catch (err) {
        error = err;
      }
      expect(error.message).toContain('not available');
      expect(MailspringAPIRequest.makeRequest).not.toHaveBeenCalled();
    });
  });
});
