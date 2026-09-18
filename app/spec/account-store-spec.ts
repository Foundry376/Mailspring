import { Account } from '../src/flux/models/account';
import { AccountStore } from '../src/flux/stores/account-store';
import KeyManager from '../src/key-manager';

const ACCOUNTS_KEY = 'accounts';

const gmailOverIMAP = () => ({
  id: 'aaaaaaaa',
  name: 'Someone',
  provider: 'imap',
  emailAddress: 'someone@gmail.com',
  settings: {
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_username: 'someone@gmail.com',
    imap_security: 'SSL / TLS',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    smtp_username: 'someone@gmail.com',
    smtp_security: 'SSL / TLS',
  },
});

describe('AccountStore', function () {
  beforeEach(function () {
    this.saved = (AccountStore as any)._accounts;
    this.config = {};
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => this.config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key: string, val: any) => {
      this.config[key] = val;
    });
    // The real implementation writes the refresh token to the OS keychain.
    spyOn(KeyManager, 'extractAndStoreAccountSecrets').andCallFake(async (account: Account) => {
      const next = account.clone();
      delete next.settings.imap_password;
      delete next.settings.smtp_password;
      delete next.settings.refresh_token;
      return next;
    });
  });

  afterEach(function () {
    (AccountStore as any)._accounts = this.saved;
  });

  describe('addAccount', function () {
    it('takes the provider of the account that was just linked', async function () {
      this.config[ACCOUNTS_KEY] = [gmailOverIMAP()];

      // The same mailbox, re-linked through Google OAuth. Its id differs because it is
      // derived from the connection settings, so it merges on the email address.
      await AccountStore.addAccount(
        new Account({
          id: 'bbbbbbbb',
          name: 'Someone',
          provider: 'gmail',
          emailAddress: 'someone@gmail.com',
          settings: {
            ...gmailOverIMAP().settings,
            refresh_client_id: 'client-id',
            refresh_token: 'refresh-token',
          },
        })
      );

      const accounts = AccountStore.accounts();
      expect(accounts.length).toEqual(1);
      expect(accounts[0].id).toEqual('aaaaaaaa');
      expect(accounts[0].provider).toEqual('gmail');
    });
  });

  describe('_loadAccounts', function () {
    // mailsync resolves the OAuth token endpoint from `provider` and aborts on the empty
    // URL a provider without one produces, so accounts left mislabelled by the merge above
    // crash-loop until the provider is corrected.
    it('corrects the provider of an account that holds an OAuth client id', function () {
      this.config[ACCOUNTS_KEY] = [
        { ...gmailOverIMAP(), settings: { ...gmailOverIMAP().settings, refresh_client_id: 'x' } },
      ];
      (AccountStore as any)._loadAccounts();
      expect(AccountStore.accounts()[0].provider).toEqual('gmail');
    });

    it('leaves an account authenticated with a password alone', function () {
      this.config[ACCOUNTS_KEY] = [gmailOverIMAP()];
      (AccountStore as any)._loadAccounts();
      expect(AccountStore.accounts()[0].provider).toEqual('imap');
    });

    it('leaves an account whose provider has a token endpoint alone', function () {
      this.config[ACCOUNTS_KEY] = [
        {
          ...gmailOverIMAP(),
          provider: 'outlook',
          emailAddress: 'someone@outlook.com',
          settings: {
            imap_host: 'outlook.office365.com',
            smtp_host: 'smtp.office365.com',
            refresh_client_id: 'x',
          },
        },
      ];
      (AccountStore as any)._loadAccounts();
      expect(AccountStore.accounts()[0].provider).toEqual('outlook');
    });
  });
});
