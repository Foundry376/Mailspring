import {
  Account,
  AccountStore,
  Actions,
  Contact,
  Message,
  SendDraftTask,
} from 'mailspring-exports';

describe('SendDraftTask smtp-auth-disabled errors', function () {
  const failWith = (settings: object) => {
    spyOn(AccountStore, 'accountForId').andReturn(
      new Account({
        id: 'a1',
        emailAddress: 'team@contoso.com',
        provider: 'office365',
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

  it('tells the owner of an account to reconnect it, which switches it to Graph', function () {
    expect(failWith({ smtp_username: 'team@contoso.com' })).toContain('Reconnect the account');
  });

  it('tells a shared mailbox that an administrator must enable SMTP AUTH instead', function () {
    const message = failWith({ smtp_username: 'owner@contoso.com' });
    expect(message).toContain('shared mailbox');
    expect(message).not.toContain('Reconnect');
  });
});
