import React from 'react';
import ReactDOM from 'react-dom';
import { renderIntoDocument, Simulate } from 'react-dom/test-utils';
import { Account } from 'mailspring-exports';

import PreferencesAccountDetails from '../lib/tabs/preferences-account-details';

const makeComponent = (props: any = {}) => {
  return renderIntoDocument(<PreferencesAccountDetails {...(props as any)} />) as any;
};

const account = new Account({
  id: 1,
  name: 'someone',
  emailAddress: 'someone@nylas.com',
  aliases: [],
  defaultAlias: null,
});

describe('PreferencesAccountDetails', function preferencesAccountDetails() {
  beforeEach(() => {
    this.account = account;
    this.onAccountUpdated = jasmine.createSpy('onAccountUpdated');
    this.component = makeComponent({ account, onAccountUpdated: this.onAccountUpdated });
    spyOn(this.component, 'setState');
  });

  // setState is spied on, so apply the updater it was handed to the component's current state.
  const assertAccountState = (update, expected) => {
    const actual = typeof update === 'function' ? update(this.component.state) : update;
    for (const key of Object.keys(expected)) {
      expect(actual.account[key]).toEqual(expected[key]);
    }
  };

  describe('_makeAlias', () => {
    it('returns correct alias when empty string provided', () => {
      const alias = this.component._makeAlias('', this.account);
      expect(alias).toEqual('someone <someone@nylas.com>');
    });

    it('returns correct alias when only the name provided', () => {
      const alias = this.component._makeAlias('Chad', this.account);
      expect(alias).toEqual('Chad <someone@nylas.com>');
    });

    it('returns correct alias when email provided', () => {
      const alias = this.component._makeAlias('keith@nylas.com', this.account);
      expect(alias).toEqual('someone <keith@nylas.com>');
    });

    it('returns correct alias if name and email provided', () => {
      const alias = this.component._makeAlias('Donald donald@nylas.com', this.account);
      expect(alias).toEqual('Donald <donald@nylas.com>');
    });

    it('returns correct alias if alias provided', () => {
      const alias = this.component._makeAlias('Donald <donald@nylas.com>', this.account);
      expect(alias).toEqual('Donald <donald@nylas.com>');
    });
  });

  describe('_setState', () => {
    it('sets the correct state', () => {
      this.component._setState({ aliases: ['something'] });
      assertAccountState(this.component.setState.calls[0].args[0], { aliases: ['something'] });
    });
  });

  describe('_onDefaultAliasSelected', () => {
    it('sets the default alias correctly when set to None', () => {
      this.component._onDefaultAliasSelected({ target: { value: 'None' } });
      assertAccountState(this.component.setState.calls[0].args[0], { defaultAlias: null });
    });

    it('sets the default alias correctly when set to any value', () => {
      this.component._onDefaultAliasSelected({ target: { value: 'my alias' } });
      assertAccountState(this.component.setState.calls[0].args[0], { defaultAlias: 'my alias' });
    });
  });

  describe('alias handlers', () => {
    beforeEach(() => {
      this.currentAlias = 'juan <blah@nylas>';
      this.newAlias = 'some <alias@nylas.com>';
      this.account.aliases = [this.currentAlias];
      this.component = makeComponent({
        account: this.account,
        onAccountUpdated: this.onAccountUpdated,
      });
      spyOn(this.component, '_makeAlias').andCallFake((alias) => alias);
      spyOn(this.component, 'setState');
    });
    describe('_onAccountAliasCreated', () => {
      it('creates alias correctly', () => {
        this.component._onAccountAliasCreated(this.newAlias);
        assertAccountState(this.component.setState.calls[0].args[0], {
          aliases: [this.currentAlias, this.newAlias],
        });
      });
    });

    describe('_onAccountAliasUpdated', () => {
      it('updates alias correctly when no default alias present', () => {
        this.component._onAccountAliasUpdated(this.newAlias, this.currentAlias, 0);
        assertAccountState(this.component.setState.calls[0].args[0], { aliases: [this.newAlias] });
      });

      it('updates alias correctly when default alias present and it is being updated', () => {
        this.account.defaultAlias = this.currentAlias;
        this.component = makeComponent({
          account: this.account,
          onAccountUpdated: this.onAccountUpdated,
        });
        spyOn(this.component, '_makeAlias').andCallFake((alias) => alias);
        spyOn(this.component, 'setState');

        this.component._onAccountAliasUpdated(this.newAlias, this.currentAlias, 0);
        assertAccountState(this.component.setState.calls[0].args[0], {
          aliases: [this.newAlias],
          defaultAlias: this.newAlias,
        });
      });

      it('updates alias correctly when default alias present and it is not being updated', () => {
        this.account.defaultAlias = this.currentAlias;
        this.account.aliases.push('otheralias');
        this.component = makeComponent({
          account: this.account,
          onAccountUpdated: this.onAccountUpdated,
        });
        spyOn(this.component, '_makeAlias').andCallFake((alias) => alias);
        spyOn(this.component, 'setState');

        this.component._onAccountAliasUpdated(this.newAlias, 'otheralias', 1);
        assertAccountState(this.component.setState.calls[0].args[0], {
          aliases: [this.currentAlias, this.newAlias],
          defaultAlias: this.currentAlias,
        });
      });
    });

    describe('_onAccountAliasRemoved', () => {
      it('removes alias correctly when no default alias present', () => {
        this.component._onAccountAliasRemoved(this.currentAlias, 0);
        assertAccountState(this.component.setState.calls[0].args[0], { aliases: [] });
      });

      it('removes alias correctly when default alias present and it is being removed', () => {
        this.account.defaultAlias = this.currentAlias;
        this.component = makeComponent({
          account: this.account,
          onAccountUpdated: this.onAccountUpdated,
        });
        spyOn(this.component, '_makeAlias').andCallFake((alias) => alias);
        spyOn(this.component, 'setState');

        this.component._onAccountAliasRemoved(this.currentAlias, 0);
        assertAccountState(this.component.setState.calls[0].args[0], {
          aliases: [],
          defaultAlias: null,
        });
      });

      it('removes alias correctly when default alias present and it is not being removed', () => {
        this.account.defaultAlias = this.currentAlias;
        this.account.aliases.push('otheralias');
        this.component = makeComponent({
          account: this.account,
          onAccountUpdated: this.onAccountUpdated,
        });
        spyOn(this.component, '_makeAlias').andCallFake((alias) => alias);
        spyOn(this.component, 'setState');

        this.component._onAccountAliasRemoved('otheralias', 1);
        assertAccountState(this.component.setState.calls[0].args[0], {
          aliases: [this.currentAlias],
          defaultAlias: this.currentAlias,
        });
      });
    });
  });

  describe('when the store hands over a new account instance', () => {
    const accountJSON = {
      id: 'acct-1',
      name: 'Someone',
      label: 'someone@example.com',
      emailAddress: 'someone@example.com',
      provider: 'imap',
      syncState: Account.SYNC_STATE_OK,
      aliases: [],
      defaultAlias: null,
      autoaddress: { type: 'bcc', value: '' },
      color: '',
    };
    const fromStore = (overrides = {}) => new Account({ ...accountJSON, ...overrides });

    beforeEach(() => {
      this.container = document.createElement('div');
      this.render = (acct: Account) =>
        ReactDOM.render(
          <PreferencesAccountDetails
            account={acct}
            isOffline={false}
            onAccountUpdated={this.onAccountUpdated}
          />,
          this.container
        ) as any;
      this.details = this.render(fromStore());
      this.type = (id: string, value: string) =>
        Simulate.change(this.container.querySelector(`#${id}`), { target: { value } } as any);
    });

    afterEach(() => {
      ReactDOM.unmountComponentAtNode(this.container);
    });

    it('keeps an unsaved label and sender name while taking the store changes', () => {
      this.type('account-label', 'Work');
      this.type('account-sender-name', 'Someone Else');

      this.render(fromStore({ syncState: Account.SYNC_STATE_AUTH_FAILED, color: '#ff0000' }));

      const { account } = this.details.state;
      expect(account.label).toEqual('Work');
      expect(account.name).toEqual('Someone Else');
      expect(account.syncState).toEqual(Account.SYNC_STATE_AUTH_FAILED);
      expect(account.color).toEqual('#ff0000');
      expect(this.container.querySelector('#account-label').value).toEqual('Work');
      expect(this.container.querySelector('#account-sender-name').value).toEqual('Someone Else');
    });

    it('keeps unsaved automatic CC / BCC and color edits', () => {
      this.details._onAccountAutoaddressUpdated({ type: 'cc', value: 'boss@example.com' });
      this.details._onSetColor({ color: '#00ff00' });

      this.render(fromStore({ syncState: Account.SYNC_STATE_AUTH_FAILED }));

      const { account } = this.details.state;
      expect(account.autoaddress).toEqual({ type: 'cc', value: 'boss@example.com' });
      expect(account.color).toEqual('#00ff00');
      expect(account.syncState).toEqual(Account.SYNC_STATE_AUTH_FAILED);
    });

    it('takes the store value of fields the user has not edited', () => {
      this.type('account-label', 'Work');

      this.render(
        fromStore({ name: 'Renamed', autoaddress: { type: 'cc', value: 'team@example.com' } })
      );

      const { account } = this.details.state;
      expect(account.label).toEqual('Work');
      expect(account.name).toEqual('Renamed');
      expect(account.autoaddress).toEqual({ type: 'cc', value: 'team@example.com' });
    });

    it('keeps an edit across several refreshes until it is saved', () => {
      this.type('account-label', 'Work');
      this.render(fromStore({ syncState: Account.SYNC_STATE_AUTH_FAILED }));
      this.render(fromStore({ syncState: Account.SYNC_STATE_OK }));
      expect(this.details.state.account.label).toEqual('Work');
    });

    it('saves the edited label with the latest store state on blur', () => {
      this.type('account-label', 'Work');
      this.render(fromStore({ syncState: Account.SYNC_STATE_AUTH_FAILED }));

      Simulate.blur(this.container.querySelector('#account-label'));

      const saved = this.onAccountUpdated.mostRecentCall.args[1];
      expect(saved.label).toEqual('Work');
      expect(saved.syncState).toEqual(Account.SYNC_STATE_AUTH_FAILED);
    });

    it('discards edits when switching to a different account', () => {
      this.type('account-label', 'Work');
      this.type('account-sender-name', 'Someone Else');

      this.render(
        fromStore({
          id: 'acct-2',
          name: 'Other',
          label: 'other@example.com',
          emailAddress: 'other@example.com',
        })
      );

      const { account } = this.details.state;
      expect(account.id).toEqual('acct-2');
      expect(account.label).toEqual('other@example.com');
      expect(account.name).toEqual('Other');
    });
  });
});
