import * as Actions from '../actions';
import { MutableQuerySubscription } from './mutable-query-subscription';
import DatabaseStore from '../stores/database-store';
import { Matcher } from '../attributes/matcher';
import { Thread } from '../models/thread';
import { Task } from '../tasks/task';
import { ChangeUnreadTask } from '../tasks/change-unread-task';
import { ChangeLabelsTask } from '../tasks/change-labels-task';
import { ChangeFolderTask } from '../tasks/change-folder-task';

// The Unread view keeps a thread the user reads until they leave the view: the threads read
// while this subscription lives are whitelisted. Owning the list here ends it however the
// view is left, and nesting it under the category filter keeps threads read elsewhere out.
// One categories matcher keeps the query on ModelQuery's ThreadCategory subselect.
const buildQuery = (categoryIds: string[], recentlyReadIds: string[]) => {
  const unread = new Matcher.And([
    Thread.attributes.unread.equal(true),
    Thread.attributes.inAllMail.equal(true),
  ]);
  return DatabaseStore.findAll<Thread>(Thread)
    .where([
      Thread.attributes.categories.containsAny(categoryIds),
      recentlyReadIds.length
        ? new Matcher.Or([unread, Thread.attributes.id.in(recentlyReadIds)])
        : unread,
    ])
    .limit(0);
};

export default class UnreadQuerySubscription extends MutableQuerySubscription<Thread> {
  _categoryIds: string[];
  _recentlyReadIds: string[] = [];
  _unlisteners: Array<() => void>;

  constructor(categoryIds: string[]) {
    super(buildQuery(categoryIds, []), { emitResultSet: true });
    this._categoryIds = categoryIds;
    this._unlisteners = [
      Actions.queueTask.listen((task: Task) => this.onTasksQueued([task])),
      Actions.queueTasks.listen((tasks: Task[]) => this.onTasksQueued(tasks)),
    ];
  }

  onTasksQueued = (tasks: Task[]) => {
    let ids = this._recentlyReadIds;
    for (const task of tasks) {
      if (task instanceof ChangeUnreadTask) {
        ids = ids.concat(task.threadIds);
      } else if (task instanceof ChangeLabelsTask || task instanceof ChangeFolderTask) {
        ids = ids.filter((id) => !task.threadIds.includes(id));
      }
    }
    if (ids === this._recentlyReadIds) {
      return;
    }
    this._recentlyReadIds = ids;
    // Swapped without a refetch: the thread's own delta is matched against the new query.
    const { limit, offset } = this._query.range();
    this._query = buildQuery(this._categoryIds, ids).limit(limit).offset(offset);
  };

  onLastCallbackRemoved() {
    this._unlisteners.forEach((unlisten) => unlisten());
  }
}
