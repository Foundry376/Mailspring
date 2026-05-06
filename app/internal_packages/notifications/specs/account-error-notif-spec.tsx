import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { AccountStore, Account, Actions, KeyManager } from 'mailspring-exports';
import { ipcRenderer } from 'electron';
import AccountErrorNotification from '../lib/items/account-error-notif';

describe('AccountErrorNotif', function AccountErrorNotifTests() {
  afterEach(cleanup);

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
      const { container } = render(<AccountErrorNotification />);
      expect(container.querySelector('.title').textContent.indexOf('123@gmail.com') > 0).toBe(true);
    });

    it('allows the user to refresh the account', () => {
      spyOn(AppEnv.mailsyncBridge, 'forceRelaunchClient').andReturn(Promise.resolve());
      const { container } = render(<AccountErrorNotification />);
      fireEvent.click(container.querySelector('#action-0'));
      expect(AppEnv.mailsyncBridge.forceRelaunchClient).toHaveBeenCalled();
    });

    it('allows the user to reconnect the account', () => {
      const { container } = render(<AccountErrorNotification />);
      spyOn(KeyManager, 'insertAccountSecrets').andCallFake(acct => acct);
      spyOn(ipcRenderer, 'send');
      fireEvent.click(container.querySelector('#action-1'));

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
      const { container } = render(<AccountErrorNotification />);
      expect(container.querySelector('.notification') !== null).toEqual(true);
    });

    it('allows the user to refresh the accounts', () => {
      spyOn(AppEnv.mailsyncBridge, 'forceRelaunchClient').andReturn(Promise.resolve());
      const { container } = render(<AccountErrorNotification />);
      fireEvent.click(container.querySelector('#action-0'));
      expect(AppEnv.mailsyncBridge.forceRelaunchClient).toHaveBeenCalled();
    });

    it('allows the user to open preferences', () => {
      spyOn(Actions, 'switchPreferencesTab');
      spyOn(Actions, 'openPreferences');
      const { container } = render(<AccountErrorNotification />);
      fireEvent.click(container.querySelector('#action-1'));
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
      const { container } = render(<AccountErrorNotification />);
      expect(container.querySelector('.notification') !== null).toEqual(false);
    });
  });
});
