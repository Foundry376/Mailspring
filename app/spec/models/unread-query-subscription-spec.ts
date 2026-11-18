import * as Actions from '../../src/flux/actions';
import UnreadQuerySubscription, {
  KeepReadMode,
  nextRecentlyReadIds,
} from '../../src/flux/models/unread-query-subscription';
import { QuerySubscription } from '../../src/flux/models/query-subscription';
import { Thread } from '../../src/flux/models/thread';
import { Folder } from '../../src/flux/models/folder';
import { ChangeUnreadTask } from '../../src/flux/tasks/change-unread-task';
import { ChangeFolderTask } from '../../src/flux/tasks/change-folder-task';

const thread = new Thread({ id: 't1', accountId: 'a1' });
const markRead = () =>
  Actions.queueTask(new ChangeUnreadTask({ threads: [thread], unread: false, source: 'spec' }));

describe('UnreadQuerySubscription', function UnreadQuerySubscriptionSpecs() {
  beforeEach(() => {
    spyOn(QuerySubscription.prototype, 'update');
  });

  it('keeps a thread read in the view, inside the view categories, on the ThreadCategory subselect', () => {
    const subscription = new UnreadQuerySubscription(['inbox']);
    markRead();
    const sql = subscription._query.sql();
    expect(sql).toContain('WHERE `id` IN (SELECT `id` FROM `ThreadCategory`');
    expect(sql).toContain(
      "`ThreadCategory`.`value` IN ('inbox') AND ((`ThreadCategory`.`unread` != 0 AND `ThreadCategory`.`inAllMail` != 0) OR `ThreadCategory`.`id` = 't1')"
    );
    subscription.onLastCallbackRemoved();
  });

  it('drops a thread from the whitelist when it is moved', () => {
    const subscription = new UnreadQuerySubscription(['inbox']);
    markRead();
    Actions.queueTask(
      new ChangeFolderTask({
        threads: [thread],
        folder: new Folder({ id: 'archive', accountId: 'a1', path: 'Archive' }),
        source: 'spec',
      })
    );
    expect(subscription._query.sql()).not.toContain("'t1'");
    subscription.onLastCallbackRemoved();
  });

  describe('nextRecentlyReadIds', () => {
    it('keeps every read thread until the view is left', () => {
      expect(nextRecentlyReadIds('until-leaving', ['t1'], ['t2'])).toEqual(['t1', 't2']);
      expect(nextRecentlyReadIds(undefined as KeepReadMode, ['t1'], ['t2'])).toEqual(['t1', 't2']);
    });

    it('keeps only the latest read threads until another one is opened', () => {
      expect(nextRecentlyReadIds('until-next', ['t1'], ['t2'])).toEqual(['t2']);
      expect(nextRecentlyReadIds('until-next', [], ['t2', 't3'])).toEqual(['t2', 't3']);
    });

    it('keeps nothing when read threads should leave right away', () => {
      expect(nextRecentlyReadIds('never', ['t1'], ['t2'])).toEqual([]);
    });

    it('returns the same list when nothing changes, so the query is not rebuilt', () => {
      const current = ['t1'];
      expect(nextRecentlyReadIds('until-leaving', current, ['t1'])).toBe(current);
      expect(nextRecentlyReadIds('until-next', current, ['t1', 't1'])).toBe(current);
      const empty: string[] = [];
      expect(nextRecentlyReadIds('never', empty, ['t1'])).toBe(empty);
    });
  });

  it('refetches to drop the previous thread when only the latest is kept', () => {
    spyOn(AppEnv.config, 'get').andCallFake((key) =>
      key === 'core.reading.unreadViewKeepsRead' ? 'until-next' : undefined
    );
    const subscription = new UnreadQuerySubscription(['inbox']);
    markRead();
    (QuerySubscription.prototype.update as jasmine.Spy).reset();
    const other = new Thread({ id: 't2', accountId: 'a1' });
    Actions.queueTask(new ChangeUnreadTask({ threads: [other], unread: false, source: 'spec' }));
    const sql = subscription._query.sql();
    expect(sql).toContain("'t2'");
    expect(sql).not.toContain("'t1'");
    expect(QuerySubscription.prototype.update).toHaveBeenCalledWith({
      mustRefetchEntireRange: true,
    });
    subscription.onLastCallbackRemoved();
  });

  it('starts empty, whatever earlier subscriptions whitelisted', () => {
    const earlier = new UnreadQuerySubscription(['inbox']);
    markRead();
    earlier.onLastCallbackRemoved();
    const next = new UnreadQuerySubscription(['inbox']);
    expect(next._query.sql()).not.toContain("'t1'");
    next.onLastCallbackRemoved();
  });
});
