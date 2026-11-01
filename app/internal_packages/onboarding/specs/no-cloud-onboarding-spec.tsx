import React from 'react';
import ReactDOM from 'react-dom';
import { Simulate } from 'react-dom/test-utils';
import { ipcRenderer } from 'electron';
import { Account, AccountStore, FeatureUsageStore, IdentityStore } from 'mailspring-exports';
import OnboardingStore from '../lib/onboarding-store';
import * as OnboardingActions from '../lib/onboarding-actions';
import WelcomePage from '../lib/page-welcome';
import InitialPreferencesPage from '../lib/page-initial-preferences';

describe('Cloud-free onboarding', () => {
  let store: typeof OnboardingStore;
  let container: HTMLDivElement;

  beforeEach(() => {
    spyOn(AccountStore, 'accounts').andReturn([]);
    spyOn(AppEnv, 'getWindowProps').andReturn({});
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (store) store.stopListeningToAll();
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  function createStore() {
    const Store = OnboardingStore.constructor as new () => typeof OnboardingStore;
    store = new Store();
    return store;
  }

  it('takes a new user straight from welcome to mail-provider selection', () => {
    expect(createStore().page()).toBe('welcome');
    const move = spyOn(OnboardingActions, 'moveToPage');
    ReactDOM.render(<WelcomePage />, container);
    Simulate.click(container.querySelector('button'));
    expect(move).toHaveBeenCalledWith('account-choose');
    expect(container.querySelector('webview')).toBe(null);
  });

  it('does not ask existing mail users to authenticate a Mailspring ID', () => {
    (AccountStore.accounts as jasmine.Spy).andReturn([new Account({})]);
    expect(createStore().page()).toBe('account-choose');
    expect(store.account().emailAddress).toBe('');
  });

  it('preserves provider-specific reconnect routes', () => {
    (AppEnv.getWindowProps as jasmine.Spy).andReturn({
      existingAccountJSON: new Account({ provider: 'office365' }).toJSON(),
    });
    expect(createStore().page()).toBe('account-settings-o365');
  });

  it('finishes initial preferences without a subscription page', () => {
    const send = spyOn(ipcRenderer, 'send');
    const component = new InitialPreferencesPage({});
    component._onFinished();
    expect(send).toHaveBeenCalledWith('account-setup-successful');
  });

  it('never supplies a fake paid identity or changes stored credentials', () => {
    waitsForPromise(async () => {
      const set = spyOn(AppEnv.config, 'set');
      expect(IdentityStore.identity()).toBe(null);
      expect(IdentityStore.identityId()).toBe(null);
      expect(IdentityStore.hasProFeatures()).toBe(false);
      expect(await IdentityStore.fetchIdentity()).toBe(null);
      await IdentityStore.saveIdentity(null);
      expect(set).not.toHaveBeenCalled();
    });
  });

  it('allows repeated local feature use without a quota or usage report', () => {
    waitsForPromise(async () => {
      const lexicon = { headerText: '', rechargeText: '', iconUrl: '' };
      const set = spyOn(AppEnv.config, 'set');
      for (const feature of ['snooze', 'send-later', 'send-reminders', 'templates']) {
        for (let i = 0; i < 20; i++) {
          await FeatureUsageStore.markUsedOrUpgrade(feature, lexicon);
          FeatureUsageStore.markUsed(feature);
        }
        expect(FeatureUsageStore.isUsable(feature)).toBe(true);
      }
      expect(set).not.toHaveBeenCalled();
      expect(IdentityStore.identity()).toBe(null);
    });
  });
});
