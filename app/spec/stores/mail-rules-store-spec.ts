import MailRulesStore from '../../src/flux/stores/mail-rules-store';
import MailRulesProcessor from '../../src/mail-rules-processor';
import { DatabaseChangeRecord } from '../../src/flux/stores/database-change-record';
import { Message } from '../../src/flux/models/message';
import { Contact } from '../../src/flux/models/contact';
import { AccountStore } from '../../src/flux/stores/account-store';

describe('MailRulesStore', function () {
  const now = Date.now();

  function persist(messages: Message[], rawJSON: Record<string, any>[]) {
    MailRulesStore._onDatabaseChanged(
      new DatabaseChangeRecord<Message>({
        type: 'persist',
        objectClass: Message.name,
        objects: messages,
        objectsRawJSON: rawJSON,
      })
    );
  }

  function message(id: string, attrs: Partial<Message> = {}) {
    return new Message({ id, accountId: 'a', date: new Date(now), draft: false, ...attrs });
  }

  beforeEach(function () {
    spyOn(MailRulesProcessor, 'processMessages');
    this.autoSince = MailRulesStore._autoSince;
    MailRulesStore._autoSince = now - 60 * 1000;
  });

  afterEach(function () {
    MailRulesStore._autoSince = this.autoSince;
  });

  it('runs rules on messages whose delta carries rulesReady', function () {
    const ready = message('ready');
    const other = message('other');
    persist([ready, other], [{ id: 'ready', rulesReady: true }, { id: 'other' }]);
    expect(MailRulesProcessor.processMessages).toHaveBeenCalledWith([ready]);
  });

  it('ignores fullSyncComplete, which the engine also sets when the body of sent mail is stored', function () {
    persist([message('sent')], [{ id: 'sent', fullSyncComplete: true }]);
    expect(MailRulesProcessor.processMessages).not.toHaveBeenCalled();
  });

  it('skips drafts and messages dated before rules were enabled', function () {
    const draft = message('draft', { draft: true });
    const old = message('old', { date: new Date(now - 120 * 1000) });
    persist(
      [draft, old],
      [
        { id: 'draft', rulesReady: true },
        { id: 'old', rulesReady: true },
      ]
    );
    expect(MailRulesProcessor.processMessages).not.toHaveBeenCalled();
  });

  describe('mail the account sent', function () {
    const work = new Contact({ email: 'me@work.test' });
    const home = new Contact({ email: 'me@home.test' });
    const bob = new Contact({ email: 'bob@example.test' });

    beforeEach(function () {
      const accounts = { 'me@work.test': { id: 'a' }, 'me@home.test': { id: 'b' } };
      spyOn(AccountStore, 'accountForEmail').andCallFake(
        (email: string) => accounts[email] || null
      );
    });

    it('skips mail this account sent to others, which the engine flags once it is filed out of Sent', function () {
      persist(
        [message('filed', { from: [work], to: [bob], cc: [], bcc: [] })],
        [{ id: 'filed', rulesReady: true, body: '' }]
      );
      expect(MailRulesProcessor.processMessages).not.toHaveBeenCalled();
    });

    it('runs rules on mail this account sent to itself', function () {
      const self = message('self', { from: [work], to: [bob], cc: [], bcc: [work] });
      persist([self], [{ id: 'self', rulesReady: true, body: '' }]);
      expect(MailRulesProcessor.processMessages).toHaveBeenCalledWith([self]);
    });

    it("runs rules on mail from another of the user's accounts", function () {
      const fromHome = message('fromHome', { from: [home], to: [work], cc: [], bcc: [] });
      persist([fromHome], [{ id: 'fromHome', rulesReady: true, body: '' }]);
      expect(MailRulesProcessor.processMessages).toHaveBeenCalledWith([fromHome]);
    });
  });

  it('ignores unpersist records', function () {
    MailRulesStore._onDatabaseChanged(
      new DatabaseChangeRecord<Message>({
        type: 'unpersist',
        objectClass: Message.name,
        objects: [message('gone')],
        objectsRawJSON: [{ id: 'gone', rulesReady: true }],
      })
    );
    expect(MailRulesProcessor.processMessages).not.toHaveBeenCalled();
  });
});
