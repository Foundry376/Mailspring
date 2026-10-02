import * as Actions from '../../src/flux/actions';
import UnreadQuerySubscription from '../../src/flux/models/unread-query-subscription';
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

  it('starts empty, whatever earlier subscriptions whitelisted', () => {
    const earlier = new UnreadQuerySubscription(['inbox']);
    markRead();
    earlier.onLastCallbackRemoved();
    const next = new UnreadQuerySubscription(['inbox']);
    expect(next._query.sql()).not.toContain("'t1'");
    next.onLastCallbackRemoved();
  });
});
