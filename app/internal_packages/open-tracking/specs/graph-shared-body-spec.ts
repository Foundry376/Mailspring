import { Account, AccountStore, Contact, Message, SendDraftTask } from 'mailspring-exports';
import { PLUGIN_ID as OPEN_PLUGIN_ID } from '../lib/open-tracking-constants';
import { recipientIsUnknowable } from '../../activity/lib/activity-events';
import { activate, deactivate } from '../lib/main';

const accountId = 'graph-spec-account';

function trackedDraft(recipients: string[]) {
  const draft = new Message({
    accountId,
    headerMessageId: 'tracked@example.test',
    body: '<p>Hello <a href="https://example.com/page">page</a></p>',
    plaintext: false,
    from: [new Contact({ email: 'me@contoso.com', name: 'Me' })],
    to: recipients.map((email) => new Contact({ email, name: email })),
    cc: [],
    bcc: [],
  });
  draft.directlyAttachMetadata(OPEN_PLUGIN_ID, { open_count: 0 });
  return draft;
}

describe('Local sending and historical read receipts', () => {
  beforeEach(activate);
  afterEach(deactivate);

  for (const graphSend of [false, true]) {
    it(`preserves HTML and original links without tracking for ${graphSend ? 'Graph' : 'SMTP'}`, () => {
      spyOn(AccountStore, 'accountForId').andReturn(
        new Account({
          id: accountId,
          provider: 'office365',
          settings: { graph_send: graphSend },
        } as any)
      );
      const draft = trackedDraft(['a@example.com', 'b@example.com']);
      const body = draft.body;
      const task = SendDraftTask.forSending(draft);
      expect(task.draft.body).toBe(body);
      expect(task.perRecipientBodies).toBeUndefined();
    });
    it(`preserves plaintext without tracking for ${graphSend ? 'Graph' : 'SMTP'}`, () => {
      spyOn(AccountStore, 'accountForId').andReturn(
        new Account({
          id: accountId,
          provider: 'office365',
          settings: { graph_send: graphSend },
        } as any)
      );
      const draft = trackedDraft(['a@example.com']);
      draft.plaintext = true;
      draft.body = 'Hello https://example.com/page';
      const task = SendDraftTask.forSending(draft);
      expect(task.draft.body).toBe('Hello https://example.com/page');
      expect(task.perRecipientBodies).toBeUndefined();
    });
  }

  describe('recipientIsUnknowable', () => {
    const message = (n: number) =>
      new Message({
        to: Array.from({ length: n }, (_, i) => new Contact({ email: `r${i}@example.com` })),
        cc: [],
        bcc: [],
      });

    it('is true for a shared body sent to several recipients', () => {
      expect(recipientIsUnknowable(message(2), { shared_body: true })).toBe(true);
    });

    it('is false for a shared body sent to one recipient, whose events are theirs', () => {
      expect(recipientIsUnknowable(message(1), { shared_body: true })).toBe(false);
    });

    it('is false for per-recipient bodies and missing metadata', () => {
      expect(recipientIsUnknowable(message(2), {})).toBe(false);
      expect(recipientIsUnknowable(message(2), null)).toBe(false);
    });
  });
});
