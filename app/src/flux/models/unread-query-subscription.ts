import * as Actions from '../actions';
import { MutableQuerySubscription } from './mutable-query-subscription';
import DatabaseStore from '../stores/database-store';
import { Matcher } from '../attributes/matcher';
import { Thread } from '../models/thread';
import { Task } from '../tasks/task';
import { ChangeUnreadTask } from '../tasks/change-unread-task';
import { ChangeLabelsTask } from '../tasks/change-labels-task';
import { ChangeFolderTask } from '../tasks/change-folder-task';
import FocusedContentStore from '../stores/focused-content-store';

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

// With this on, a thread read in the Unread view leaves it once another thread is opened,
// instead of when the view is left.
export const RELEASE_ON_NEXT_KEY = 'core.reading.unreadViewReleaseReadOnNext';

export default class UnreadQuerySubscription extends MutableQuerySubscription<Thread> {
  _categoryIds: string[];
  _recentlyReadIds: string[] = [];
  _focusedThreadId: string | null;
  _unlisteners: Array<() => void>;

  constructor(categoryIds: string[]) {
    super(buildQuery(categoryIds, []), { emitResultSet: true });
    this._categoryIds = categoryIds;
    this._focusedThreadId = FocusedContentStore.focusedId('thread') || null;
    this._unlisteners = [
      Actions.queueTask.listen((task: Task) => this.onTasksQueued([task])),
      Actions.queueTasks.listen((tasks: Task[]) => this.onTasksQueued(tasks)),
      FocusedContentStore.listen(this.onFocusChanged),
    ];
  }

  onTasksQueued = (tasks: Task[]) => {
    let ids = this._recentlyReadIds;
    for (const task of tasks) {
      if (task instanceof ChangeUnreadTask) {
        ids = ids.concat(task.threadIds.filter((id) => !ids.includes(id)));
      } else if (task instanceof ChangeLabelsTask || task instanceof ChangeFolderTask) {
        ids = ids.filter((id) => !task.threadIds.includes(id));
      }
    }
    // Swapped without a refetch: the thread's own delta is matched against the new query.
    this._setRecentlyReadIds(ids, { refetch: false });
  };

  // Releases read threads when the user moves to another thread, never because a task was
  // queued: mail rules and "mark as unread" queue the same ChangeUnreadTask, and with
  // "mark as read: manually" opening a thread queues nothing. The newly focused thread
  // stays whitelisted, so when split mode moves focus to the next row and that row is
  // marked read, it remains in the list and focus does not move on by itself.
  onFocusChanged = () => {
    const focusedId = FocusedContentStore.focusedId('thread') || null;
    // Leaving the reading pane (focus cleared) is not moving to another thread.
    if (!focusedId || focusedId === this._focusedThreadId) {
      return;
    }
    this._focusedThreadId = focusedId;
    if (!AppEnv.config.get(RELEASE_ON_NEXT_KEY)) {
      return;
    }
    const kept = this._recentlyReadIds.filter((id) => id === focusedId);
    // A released thread was already read, so no delta of its own will arrive to remove it.
    this._setRecentlyReadIds(kept, { refetch: true });
  };

  _setRecentlyReadIds(ids: string[], { refetch }: { refetch: boolean }) {
    const current = this._recentlyReadIds;
    if (ids.length === current.length && ids.every((id) => current.includes(id))) {
      return;
    }
    this._recentlyReadIds = ids;
    const { limit, offset } = this._query.range();
    this._query = buildQuery(this._categoryIds, ids).limit(limit).offset(offset);
    if (refetch) {
      this.update({ mustRefetchEntireRange: true });
    }
  }

  onLastCallbackRemoved() {
    this._unlisteners.forEach((unlisten) => unlisten());
  }
}
