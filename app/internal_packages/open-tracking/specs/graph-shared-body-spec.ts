import {
  Account,
  AccountStore,
  Contact,
  ExtensionRegistry,
  Message,
  SendDraftTask,
} from 'mailspring-exports';
import OpenTrackingComposerExtension from '../lib/open-tracking-composer-extension';
import { PLUGIN_ID as OPEN_PLUGIN_ID } from '../lib/open-tracking-constants';
import LinkTrackingComposerExtension from '../../link-tracking/lib/link-tracking-composer-extension';
import { PLUGIN_ID as LINK_PLUGIN_ID } from '../../link-tracking/lib/link-tracking-constants';
import { recipientIsUnknowable } from '../../activity/lib/activity-events';

const accountId = 'graph-spec-account';

function decodeOpenToken(html: string) {
  const token = html.match(/\/o\/([A-Za-z0-9_-]+)\.png/)[1];
  return JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/')));
}

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
  draft.directlyAttachMetadata(LINK_PLUGIN_ID, { tracked: true });
  return draft;
}

describe('Tracking for accounts that send through Microsoft Graph', () => {
  beforeEach(() => {
    ExtensionRegistry.Composer.register(OpenTrackingComposerExtension);
    ExtensionRegistry.Composer.register(LinkTrackingComposerExtension);
  });

  afterEach(() => {
    ExtensionRegistry.Composer.unregister(OpenTrackingComposerExtension);
    ExtensionRegistry.Composer.unregister(LinkTrackingComposerExtension);
  });

  it('sends each recipient their own body when the account sends over SMTP', () => {
    spyOn(AccountStore, 'accountForId').andReturn(
      new Account({ id: accountId, provider: 'office365', settings: {} } as any)
    );
    const task = SendDraftTask.forSending(trackedDraft(['a@example.com', 'b@example.com']));

    expect(Object.keys(task.perRecipientBodies).sort()).toEqual([
      'a@example.com',
      'b@example.com',
      'self',
    ]);
    expect(decodeOpenToken(task.perRecipientBodies['a@example.com']).recipient).toEqual(
      'a@example.com'
    );
    expect(task.draft.metadataForPluginId(OPEN_PLUGIN_ID).shared_body).toBeUndefined();
    expect(task.draft.metadataForPluginId(LINK_PLUGIN_ID).shared_body).toBeUndefined();
  });

  it('sends one tracked body to everyone and records that when the account sends through Graph', () => {
    spyOn(AccountStore, 'accountForId').andReturn(
      new Account({ id: accountId, provider: 'office365', settings: { graph_send: true } } as any)
    );
    const task = SendDraftTask.forSending(trackedDraft(['a@example.com', 'b@example.com']));

    expect(task.perRecipientBodies).toBeFalsy();
    expect(decodeOpenToken(task.draft.body).recipient).toBeUndefined();
    expect(task.draft.body).toContain('/link/tracked@example.test/0?redirect=');
    expect(task.draft.body).not.toContain('&recipient=');
    expect(task.draft.metadataForPluginId(OPEN_PLUGIN_ID).shared_body).toBe(true);
    expect(task.draft.metadataForPluginId(LINK_PLUGIN_ID).shared_body).toBe(true);
  });

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
