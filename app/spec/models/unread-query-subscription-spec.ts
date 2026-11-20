import * as Actions from '../../src/flux/actions';
import UnreadQuerySubscription, {
  RELEASE_ON_NEXT_KEY,
} from '../../src/flux/models/unread-query-subscription';
import FocusedContentStore from '../../src/flux/stores/focused-content-store';
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

  describe('removing read threads when another thread is opened', () => {
    let focusedId: string | null;
    let releaseOnNext: boolean;
    const focus = (id: string | null) => {
      focusedId = id;
      FocusedContentStore.trigger({ impactsCollection: (c) => c === 'thread' });
    };
    const other = new Thread({ id: 't2', accountId: 'a1' });
    const third = new Thread({ id: 't3', accountId: 'a1' });
    const refetches = () =>
      (QuerySubscription.prototype.update as jasmine.Spy).calls.filter(
        (call) => call.args[0] && call.args[0].mustRefetchEntireRange
      ).length;

    beforeEach(() => {
      focusedId = null;
      releaseOnNext = true;
      spyOn(FocusedContentStore, 'focusedId').andCallFake((collection) =>
        collection === 'thread' ? focusedId : null
      );
      const get = AppEnv.config.get.bind(AppEnv.config);
      spyOn(AppEnv.config, 'get').andCallFake((key) =>
        key === RELEASE_ON_NEXT_KEY ? releaseOnNext : get(key)
      );
    });

    it('keeps the open thread when it is marked read, so split mode does not chain-read the list', () => {
      const subscription = new UnreadQuerySubscription(['inbox']);
      focus('t1');
      markRead();
      expect(subscription._query.sql()).toContain("'t1'");
      expect(refetches()).toBe(0);
      subscription.onLastCallbackRemoved();
    });

    // Focusing t2 queues no task here, as with "mark as read: manually".
    it('drops the previous read thread once another thread is focused', () => {
      const subscription = new UnreadQuerySubscription(['inbox']);
      focus('t1');
      markRead();
      focus('t2');
      expect(subscription._query.sql()).not.toContain("'t1'");
      expect(refetches()).toBe(1);
      subscription.onLastCallbackRemoved();
    });

    it('keeps the newly focused thread when focus moves onto a thread already read', () => {
      const subscription = new UnreadQuerySubscription(['inbox']);
      focus('t1');
      markRead();
      Actions.queueTask(new ChangeUnreadTask({ threads: [other], unread: false, source: 'spec' }));
      focus('t2');
      const sql = subscription._query.sql();
      expect(sql).toContain("'t2'");
      expect(sql).not.toContain("'t1'");
      subscription.onLastCallbackRemoved();
    });

    it('does not drop anything when a mail rule or "mark as unread" queues a task', () => {
      const subscription = new UnreadQuerySubscription(['inbox']);
      focus('t1');
      markRead();
      Actions.queueTask(
        new ChangeUnreadTask({ threads: [other], unread: false, source: 'Mail Rules' })
      );
      Actions.queueTask(new ChangeUnreadTask({ threads: [third], unread: true, source: 'spec' }));
      const sql = subscription._query.sql();
      expect(sql).toContain("'t1'");
      expect(refetches()).toBe(0);
      subscription.onLastCallbackRemoved();
    });

    it('keeps read threads when focus is only cleared, as when going back to the list', () => {
      const subscription = new UnreadQuerySubscription(['inbox']);
      focus('t1');
      markRead();
      focus(null);
      focus('t1');
      expect(subscription._query.sql()).toContain("'t1'");
      expect(refetches()).toBe(0);
      subscription.onLastCallbackRemoved();
    });

    it('keeps read threads until the view is left when the setting is off', () => {
      releaseOnNext = false;
      const subscription = new UnreadQuerySubscription(['inbox']);
      focus('t1');
      markRead();
      focus('t2');
      expect(subscription._query.sql()).toContain("'t1'");
      expect(refetches()).toBe(0);
      subscription.onLastCallbackRemoved();
    });

    it('stops listening for focus changes once the view is left', () => {
      const subscription = new UnreadQuerySubscription(['inbox']);
      focus('t1');
      markRead();
      subscription.onLastCallbackRemoved();
      focus('t2');
      expect(subscription._query.sql()).toContain("'t1'");
    });
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
