import _ from 'underscore';
import { Actions, Account, AccountStore, CategoryStore, Folder, Thread } from 'mailspring-exports';
import { DatabaseChangeRecord } from '../../../src/flux/stores/database-change-record';
import { MutableQueryResultSet } from '../../../src/flux/models/mutable-query-result-set';
import { QueryRange } from '../../../src/flux/models/query-range';
import SearchQuerySubscription from '../lib/search-query-subscription';
import SearchMailboxPerspective from '../lib/search-mailbox-perspective';

const gmail = new Account({ id: 'a1', provider: 'gmail' });
const imap = new Account({ id: 'a2', provider: 'imap' });
const accounts = { a1: gmail, a2: imap };
const categories = {
  a1: [new Folder({ id: 'g-all', accountId: 'a1', role: 'all', path: '[Gmail]/All Mail' })],
  a2: [new Folder({ id: 'i-inbox', accountId: 'a2', role: 'inbox', path: 'INBOX' })],
};

describe('SearchQuerySubscription', function () {
  let sent;
  let unlisten;
  let bridge;
  let clients;

  const subscribe = (query: string, accountIds: string[]) => {
    const sub = new SearchQuerySubscription(query, accountIds);
    spyOn(sub, 'replaceQuery');
    sub.performSearch();
    return sub;
  };
  const searchIdFor = (accountId: string) =>
    sent.find((s) => s.accountId === accountId).packet.searchId;
  const lastQuery = (sub) => (sub.replaceQuery as jasmine.Spy).mostRecentCall.args[0];

  beforeEach(function () {
    sent = [];
    unlisten = jasmine.createSpy('unlisten');
    clients = { a1: { spawned: true }, a2: { spawned: true } };
    bridge = {
      clients: () => clients,
      sendMessageToAccount: (accountId, packet) => sent.push({ accountId, packet }),
    };
    AppEnv.mailsyncBridge = bridge as any;
    spyOn(_, 'defer');
    spyOn(AccountStore, 'accountForId').andCallFake((id) => accounts[id]);
    spyOn(CategoryStore, 'categories').andCallFake((id) => categories[id]);
    spyOn(Actions.remoteSearchResultReceived, 'listen').andReturn(unlisten);
  });

  afterEach(function () {
    AppEnv.mailsyncBridge = undefined;
  });

  it("sends each account's server the query in its own form", function () {
    subscribe('pineapple', ['a1', 'a2']);
    expect(sent.map((s) => s.accountId)).toEqual(['a1', 'a2']);
    expect(sent[0].packet).toEqual({
      type: 'search-remote',
      searchId: sent[0].packet.searchId,
      fetchLimit: 500,
      gmailRaw: 'pineapple',
    });
    expect(sent[1].packet).toEqual({
      type: 'search-remote',
      searchId: sent[1].packet.searchId,
      fetchLimit: 500,
      criteria: [
        'or',
        ['from', 'pineapple'],
        ['to', 'pineapple'],
        ['cc', 'pineapple'],
        ['subject', 'pineapple'],
        ['body', 'pineapple'],
      ],
    });
    expect(typeof sent[0].packet.searchId).toBe('string');
    expect(sent[0].packet.searchId).not.toEqual(sent[1].packet.searchId);
    expect(Actions.remoteSearchResultReceived.listen).toHaveBeenCalled();
  });

  it('searches every server for what the search bar submits', function () {
    spyOn(SearchQuerySubscription.prototype, 'replaceQuery');
    const perspective = new SearchMailboxPerspective(
      { accountIds: ['a1', 'a2'] } as any,
      'pineapple'
    );
    perspective.threads().performSearch();
    expect(sent.map((s) => s.packet.gmailRaw || s.packet.criteria)).toEqual([
      '(pineapple -((in:trash OR in:spam)))',
      [
        'or',
        ['from', 'pineapple'],
        ['to', 'pineapple'],
        ['cc', 'pineapple'],
        ['subject', 'pineapple'],
        ['body', 'pineapple'],
      ],
    ]);
    expect(sent.every((s) => s.packet.folderIds === undefined)).toBe(true);
  });

  it('skips an account whose server cannot run the query', function () {
    subscribe('in:inbox pineapple', ['a2', 'unknown']);
    expect(sent.map((s) => s.accountId)).toEqual(['a2']);
    sent = [];
    subscribe('pineapple OR in:inbox', ['a2']);
    expect(sent).toEqual([]);
  });

  it('skips an account whose sync process is not running, without a dialog', function () {
    delete clients.a2;
    const sub = subscribe('pineapple', ['a1', 'a2']);
    expect(sent.map((s) => s.accountId)).toEqual(['a1']);
    sent = [];
    sub.onLastCallbackRemoved();
    expect(sent.map((s) => s.accountId)).toEqual(['a1']);
  });

  it('skips an account whose sync process is registered but not yet spawned', function () {
    clients.a2 = { spawned: false };
    subscribe('pineapple', ['a1', 'a2']);
    expect(sent.map((s) => s.accountId)).toEqual(['a1']);
  });

  it('does not cancel on an account whose sync process has since gone', function () {
    const sub = subscribe('pineapple', ['a1', 'a2']);
    const running = searchIdFor('a1');
    delete clients.a2;
    sent = [];
    sub.onLastCallbackRemoved();
    expect(sent).toEqual([
      { accountId: 'a1', packet: { type: 'search-remote-cancel', searchId: running } },
    ]);
  });

  it('runs locally only when the query does not parse or there is no bridge', function () {
    subscribe('from:', ['a1']);
    expect(sent).toEqual([]);
    AppEnv.mailsyncBridge = undefined;
    subscribe('pineapple', ['a1']);
    expect(sent).toEqual([]);
  });

  it('keeps the local query as server results arrive', function () {
    const sub = subscribe('pineapple', ['a1']);
    const queries = (sub.replaceQuery as jasmine.Spy).callCount;
    expect(lastQuery(sub).sql()).toContain('MATCH');
    for (const phase of ['searching', 'fetching', 'done']) {
      sub._onRemoteSearchResult({
        id: searchIdFor('a1'),
        done: phase === 'done',
        phase,
        threadIds: ['t1', 't2'],
        candidates: 2,
        fetched: 1,
      } as any);
    }
    expect((sub.replaceQuery as jasmine.Spy).callCount).toBe(queries);
  });

  describe('when the sync engine saves a thread', function () {
    const date = new Date(2026, 10, 1);
    const thread = (id: string) =>
      new Thread({ id, accountId: 'a1', lastMessageReceivedTimestamp: date });
    const saved = (t: Thread) =>
      new DatabaseChangeRecord({
        type: 'persist',
        objectClass: 'Thread',
        objects: [t],
        objectsRawJSON: [t.toJSON()],
      });
    let sub;

    // A search showing `listed`, with no query in flight.
    beforeEach(function () {
      sub = subscribe('pineapple', ['a1']);
      sub._query = lastQuery(sub);
      sub._query.finalize();
      sub._set = new MutableQueryResultSet();
      sub._set.addModelsInRange([thread('listed')], new QueryRange({ offset: 0, limit: 1000 }));
      spyOn(sub, 'update');
      spyOn(sub, '_createResultAndTrigger');
    });

    // The engine saves the thread of every body it stores (Message::afterSave in Mailspring-Sync),
    // so this is how a thread whose newly indexed body matches joins the results.
    it('runs the local query again for a thread the results lack', function () {
      sub.applyChangeRecord(saved(thread('indexed')));
      expect(sub.update).toHaveBeenCalledWith({ mustRefetchEntireRange: true });
    });

    it('updates a listed thread in place', function () {
      sub.applyChangeRecord(saved(thread('listed')));
      expect(sub.update).not.toHaveBeenCalled();
      expect(sub._createResultAndTrigger).toHaveBeenCalled();
    });
  });

  it('cancels the server searches still running when it is torn down', function () {
    const sub = subscribe('pineapple', ['a1', 'a2']);
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true });
    const running = searchIdFor('a2');
    sent = [];
    sub.onLastCallbackRemoved();
    expect(unlisten).toHaveBeenCalled();
    expect(sent).toEqual([
      { accountId: 'a2', packet: { type: 'search-remote-cancel', searchId: running } },
    ]);
    sent = [];
    sub.onLastCallbackRemoved();
    expect(sent).toEqual([]);
  });

  describe('searching indicator', function () {
    const resultsArrive = (sub) => sub._createResultAndTrigger();
    let completed: jasmine.Spy;

    beforeEach(function () {
      spyOn(Object.getPrototypeOf(SearchQuerySubscription.prototype), '_createResultAndTrigger');
      completed = spyOn(Actions, 'searchCompleted');
    });

    it('stays on until every server has answered', function () {
      const sub = subscribe('pineapple', ['a1', 'a2']);
      resultsArrive(sub);
      expect(completed).not.toHaveBeenCalled();
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: false });
      resultsArrive(sub);
      expect(completed).not.toHaveBeenCalled();
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true });
      expect(completed).not.toHaveBeenCalled();
      sub._onRemoteSearchResult({ id: 'someone-elses', done: true });
      expect(completed).not.toHaveBeenCalled();
      sub._onRemoteSearchResult({
        id: searchIdFor('a2'),
        done: true,
        error: 'ErrorConnection',
      } as any);
      expect(completed.callCount).toBe(1);
      resultsArrive(sub);
      sub._onRemoteSearchResult({ id: searchIdFor('a2'), done: true });
      expect(completed.callCount).toBe(1);
    });

    it('turns off when the local query fails', function () {
      spyOn(AppEnv, 'reportError');
      const sub = subscribe('pineapple', ['a1']);
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true });
      expect(completed).not.toHaveBeenCalled();
      sub._onQueryFailed(new Error('DatabaseStore: Query failed in background'));
      expect(completed.callCount).toBe(1);
    });

    it('waits for the local results when the servers answer first', function () {
      const sub = subscribe('pineapple', ['a1']);
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true });
      expect(completed).not.toHaveBeenCalled();
      resultsArrive(sub);
      expect(completed.callCount).toBe(1);
    });

    it('waits for a local query still running when the servers answer', function () {
      const sub = subscribe('pineapple', ['a1']);
      resultsArrive(sub);
      sub._updateInFlight = true;
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true });
      expect(completed).not.toHaveBeenCalled();
      sub._updateInFlight = false;
      resultsArrive(sub);
      expect(completed.callCount).toBe(1);
    });

    it('goes off when the sync process it asked exits without answering', function () {
      const sub = subscribe('pineapple', ['a1', 'a2']);
      resultsArrive(sub);
      const sentTo = { ...clients };
      clients.a1 = { spawned: true };
      sub._onSyncProcessExited(clients.a1);
      expect(completed).not.toHaveBeenCalled();
      sub._onSyncProcessExited(sentTo.a1);
      expect(completed).not.toHaveBeenCalled();
      sub._onSyncProcessExited(sentTo.a2);
      expect(completed.callCount).toBe(1);
    });

    it('goes off with the local results when no server was asked', function () {
      AppEnv.mailsyncBridge = undefined;
      const sub = subscribe('pineapple', ['a1']);
      resultsArrive(sub);
      expect(completed.callCount).toBe(1);
    });
  });
});
