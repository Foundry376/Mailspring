import {
  Account,
  AccountStore,
  Actions,
  Contact,
  Message,
  SendDraftTask,
} from 'mailspring-exports';

describe('SendDraftTask smtp-auth-disabled errors', function () {
  const failWith = (settings: object, provider = 'office365') => {
    spyOn(AccountStore, 'accountForId').andReturn(
      new Account({
        id: 'a1',
        emailAddress: 'team@contoso.com',
        provider,
        settings,
      } as any)
    );
    const failed = spyOn(Actions, 'draftDeliveryFailed');
    const task = new SendDraftTask({});
    task.draft = new Message({
      accountId: 'a1',
      from: [new Contact({ email: 'team@contoso.com' })],
    });
    task.onError({
      key: 'smtp-auth-disabled',
      debuginfo: '535 5.7.139 Authentication unsuccessful',
    });
    return failed.mostRecentCall.args[0].errorMessage;
  };

  it('tells the owner of a Microsoft account to reconnect it, which switches it to Graph', function () {
    const message = failWith({ smtp_username: 'team@contoso.com' });
    expect(message).toContain('Reconnect the account');
    expect(message).toContain("administrator's approval");
  });

  it('tells a shared mailbox that an administrator must enable SMTP AUTH instead', function () {
    const message = failWith({ smtp_username: 'owner@contoso.com' });
    expect(message).toContain('An administrator must enable SMTP AUTH');
    expect(message).not.toContain('Reconnect');
  });

  it('tells a password-based IMAP/SMTP account that an administrator must enable SMTP AUTH', function () {
    const message = failWith({ smtp_username: 'team@contoso.com' }, 'imap');
    expect(message).toContain('An administrator must enable SMTP AUTH');
    expect(message).not.toContain('Reconnect');
  });
});
