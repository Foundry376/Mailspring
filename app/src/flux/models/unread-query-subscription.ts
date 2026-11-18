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

export type KeepReadMode = 'until-leaving' | 'until-next' | 'never';

// Decides which threads stay whitelisted in the Unread view after `readNow` are marked read
// or unread. A thread dropped from the list leaves the view on the next refetch. Returns
// `current` itself when nothing changes, so the caller can skip rebuilding the query.
// An unset or unknown mode keeps every read thread, the behavior before the setting existed.
export function nextRecentlyReadIds(
  mode: KeepReadMode,
  current: string[],
  readNow: string[]
): string[] {
  const unique = [...new Set(readNow)];
  const sameAs = (ids: string[]) =>
    ids.length === current.length && ids.every((id) => current.includes(id));

  if (mode === 'never') {
    return current.length ? [] : current;
  }
  if (mode === 'until-next') {
    // The open thread stays put under the cursor; the one read before it leaves.
    return sameAs(unique) ? current : unique;
  }
  const added = unique.filter((id) => !current.includes(id));
  return added.length ? current.concat(added) : current;
}

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
    const mode: KeepReadMode = AppEnv.config.get('core.reading.unreadViewKeepsRead');
    let ids = this._recentlyReadIds;
    let releasedReadThreads = false;
    for (const task of tasks) {
      if (task instanceof ChangeUnreadTask) {
        const next = nextRecentlyReadIds(mode, ids, task.threadIds);
        releasedReadThreads = releasedReadThreads || ids.some((id) => !next.includes(id));
        ids = next;
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
    // A released thread was already read, so no delta of its own will arrive to remove it.
    if (releasedReadThreads) {
      this.update({ mustRefetchEntireRange: true });
    }
  };

  onLastCallbackRemoved() {
    this._unlisteners.forEach((unlisten) => unlisten());
  }
}
