import { mount } from 'enzyme';
import React from 'react';
import { AccountStore, Account, Actions, KeyManager } from 'mailspring-exports';
import { ipcRenderer } from 'electron';
import AccountErrorNotification from '../lib/items/account-error-notif';

describe('AccountErrorNotif', function AccountErrorNotifTests() {
  describe('when one account is in the `invalid` state', () => {
    beforeEach(() => {
      spyOn(AccountStore, 'accounts').andReturn([
        new Account({
          id: 'A',
          syncState: Account.SYNC_STATE_AUTH_FAILED,
          emailAddress: '123@gmail.com',
        }),
        new Account({ id: 'B', syncState: Account.SYNC_STATE_OK, emailAddress: 'other@gmail.com' }),
      ]);
    });

    it('renders an error bar that mentions the account email', () => {
      const notif = mount(<AccountErrorNotification />);
      expect(
        notif
          .find('.title')
          .text()
          .indexOf('123@gmail.com') > 0
      ).toBe(true);
    });

    it('allows the user to refresh the account', () => {
      spyOn(AppEnv.mailsyncBridge, 'forceRelaunchClient').andReturn(Promise.resolve());
      const notif = mount(<AccountErrorNotification />);
      notif.find('#action-0').simulate('click'); // Expects first action to be the refresh action
      expect(AppEnv.mailsyncBridge.forceRelaunchClient).toHaveBeenCalled();
    });

    it('allows the user to reconnect the account', () => {
      const notif = mount(<AccountErrorNotification />);
      spyOn(KeyManager, 'insertAccountSecrets').andCallFake(acct => acct);
      spyOn(ipcRenderer, 'send');
      notif.find('#action-1').simulate('click'); // Expects second action to be the reconnect action

      waitsFor(() => {
        return ipcRenderer.send.callCount > 0;
      });
      runs(() => {
        expect(ipcRenderer.send).toHaveBeenCalledWith('command', 'application:add-account', {
          existingAccountJSON: AccountStore.accounts()[0],
        });
      });
    });
  });

  describe('when more than one account is in the `invalid` state', () => {
    beforeEach(() => {
      spyOn(AccountStore, 'accounts').andReturn([
        new Account({
          id: 'A',
          syncState: Account.SYNC_STATE_AUTH_FAILED,
          emailAddress: '123@gmail.com',
        }),
        new Account({
          id: 'B',
          syncState: Account.SYNC_STATE_AUTH_FAILED,
          emailAddress: 'other@gmail.com',
        }),
      ]);
    });

    it('renders an error bar', () => {
      const notif = mount(<AccountErrorNotification />);
      expect(notif.find('.notification').exists()).toEqual(true);
    });

    it('allows the user to refresh the accounts', () => {
      spyOn(AppEnv.mailsyncBridge, 'forceRelaunchClient').andReturn(Promise.resolve());
      const notif = mount(<AccountErrorNotification />);
      notif.find('#action-0').simulate('click'); // Expects first action to be the refresh action
      expect(AppEnv.mailsyncBridge.forceRelaunchClient).toHaveBeenCalled();
    });

    it('allows the user to open preferences', () => {
      spyOn(Actions, 'switchPreferencesTab');
      spyOn(Actions, 'openPreferences');
      const notif = mount(<AccountErrorNotification />);
      notif.find('#action-1').simulate('click'); // Expects second action to be the preferences action
      expect(Actions.openPreferences).toHaveBeenCalled();
      expect(Actions.switchPreferencesTab).toHaveBeenCalledWith('Accounts');
    });
  });

  describe('when all accounts are fine', () => {
    beforeEach(() => {
      spyOn(AccountStore, 'accounts').andReturn([
        new Account({ id: 'A', syncState: Account.SYNC_STATE_OK, emailAddress: '123@gmail.com' }),
        new Account({ id: 'B', syncState: Account.SYNC_STATE_OK, emailAddress: 'other@gmail.com' }),
      ]);
    });

    it('renders nothing', () => {
      const notif = mount(<AccountErrorNotification />);
      expect(notif.find('.notification').exists()).toEqual(false);
    });
  });
});
