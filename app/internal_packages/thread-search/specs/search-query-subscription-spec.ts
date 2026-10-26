import _ from 'underscore';
import { Actions, Account, AccountStore, CategoryStore, Folder } from 'mailspring-exports';
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
  const lastQuerySQL = (sub) => (sub.replaceQuery as jasmine.Spy).mostRecentCall.args[0].sql();

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
      gmailRaw: 'pineapple',
    });
    expect(sent[1].packet).toEqual({
      type: 'search-remote',
      searchId: sent[1].packet.searchId,
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

  it("adds the server's threads to the local matches", function () {
    const sub = subscribe('pineapple', ['a1']);
    expect(lastQuerySQL(sub)).not.toContain("'t1'");
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: false, threadIds: ['t1', 't2'] });
    expect(lastQuerySQL(sub)).toContain("in ('t1','t2')");
    expect(lastQuerySQL(sub)).toContain('MATCH');
  });

  it('ignores results for other searches and threads it already has', function () {
    const sub = subscribe('pineapple', ['a1']);
    const queries = (sub.replaceQuery as jasmine.Spy).callCount;
    sub._onRemoteSearchResult({ id: 'someone-elses', done: true, threadIds: ['t9'] });
    expect((sub.replaceQuery as jasmine.Spy).callCount).toBe(queries);
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: false, threadIds: ['t1'] });
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: false, threadIds: ['t1'] });
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: false, threadIds: [] });
    expect((sub.replaceQuery as jasmine.Spy).callCount).toBe(queries + 1);
  });

  it('cancels the server searches still running when it is torn down', function () {
    const sub = subscribe('pineapple', ['a1', 'a2']);
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true, threadIds: [] });
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
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: false, threadIds: ['t1'] });
      resultsArrive(sub);
      expect(completed).not.toHaveBeenCalled();
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true, threadIds: [] });
      expect(completed).not.toHaveBeenCalled();
      sub._onRemoteSearchResult({ id: searchIdFor('a2'), done: true, error: 'ErrorConnection' });
      expect(completed.callCount).toBe(1);
      resultsArrive(sub);
      expect(completed.callCount).toBe(1);
    });

    it('waits for the local results when the servers answer first', function () {
      const sub = subscribe('pineapple', ['a1']);
      sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true, threadIds: [] });
      expect(completed).not.toHaveBeenCalled();
      resultsArrive(sub);
      expect(completed.callCount).toBe(1);
    });

    it('goes off when a sync process exits without answering', function () {
      const sub = subscribe('pineapple', ['a1', 'a2']);
      resultsArrive(sub);
      sub._onSyncProcessExited('a1');
      expect(completed).not.toHaveBeenCalled();
      sub._onSyncProcessExited('a2');
      expect(completed.callCount).toBe(1);
    });

    it('goes off with the local results when no server was asked', function () {
      AppEnv.mailsyncBridge = undefined;
      const sub = subscribe('pineapple', ['a1']);
      resultsArrive(sub);
      expect(completed.callCount).toBe(1);
    });
  });

  it('ignores results that arrive after a search is done', function () {
    const sub = subscribe('pineapple', ['a1']);
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true, threadIds: ['t1'] });
    const queries = (sub.replaceQuery as jasmine.Spy).callCount;
    sub._onRemoteSearchResult({ id: searchIdFor('a1'), done: true, threadIds: ['t2'] });
    expect((sub.replaceQuery as jasmine.Spy).callCount).toBe(queries);
  });
});
