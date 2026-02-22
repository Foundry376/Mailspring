/* eslint global-require: 0 */
import { QuerySubscription } from './query-subscription';
import { DatabaseChangeRecord } from '../stores/database-change-record';
import ModelQuery from './query';
import { Model } from './model';
import * as Actions from '../actions';
let DatabaseStore = null;

/*
Public: The QuerySubscriptionPool maintains a list of all of the query
subscriptions in the app. In the future, this class will monitor performance,
merge equivalent subscriptions, etc.
*/
class QuerySubscriptionPool {
  _subscriptions = {};
  _cleanupChecks = [];

  constructor() {
    this._setup();
  }

  add(query: ModelQuery<any>, callback) {
    if (AppEnv.inDevMode()) {
      callback._registrationPoint = this._formatRegistrationPoint(new Error().stack);
    }

    const key = this._keyForQuery(query);
    let subscription = this._subscriptions[key];
    if (!subscription) {
      subscription = new QuerySubscription(query);
      this._subscriptions[key] = subscription;
    }

    subscription.addCallback(callback);
    return () => {
      subscription.removeCallback(callback);
      this._scheduleCleanupCheckForSubscription(key);
    };
  }

  addPrivateSubscription(key: string, subscription: QuerySubscription<any>, callback) {
    this._subscriptions[key] = subscription;
    subscription.addCallback(callback);
    return () => {
      subscription.removeCallback(callback);
      this._scheduleCleanupCheckForSubscription(key);
    };
  }

  printSubscriptions() {
    if (!AppEnv.inDevMode()) {
      console.log('printSubscriptions is only available in developer mode.');
      return;
    }

    for (const key of Object.keys(this._subscriptions)) {
      const subscription = this._subscriptions[key];
      console.log(key);
      console.group();
      for (const callback of subscription._callbacks) {
        console.log(`${callback._registrationPoint}`);
      }
      console.groupEnd();
    }
  }

  _scheduleCleanupCheckForSubscription(key: string) {
    // We unlisten / relisten to lots of subscriptions and setTimeout is actually
    // /not/ that fast. Create one timeout for all checks, not one for each.
    if (this._cleanupChecks.length === 0) {
      setTimeout(() => this._runCleanupChecks(), 1);
    }
    this._cleanupChecks.push(key);
  }

  _runCleanupChecks() {
    for (const key of this._cleanupChecks) {
      const subscription = this._subscriptions[key];
      if (subscription && subscription.callbackCount() === 0) {
        delete this._subscriptions[key];
      }
    }
    this._cleanupChecks = [];
  }

  _formatRegistrationPoint(stackString: string) {
    const stack = stackString.split('\n');
    let ii = 0;
    let seenRx = false;
    while (ii < stack.length) {
      const hasRx = stack[ii].indexOf('rx.lite') !== -1;
      seenRx = seenRx || hasRx;
      if (seenRx === true && !hasRx) {
        break;
      }
      ii += 1;
    }

    return stack.slice(ii, ii + 4).join('\n');
  }

  _keyForQuery<T extends Model | Model[]>(query: ModelQuery<T>) {
    return query.sql();
  }

  _setup() {
    DatabaseStore = DatabaseStore || require('../stores/database-store').default;
    DatabaseStore.listen(this._onChange);
    Actions.queueTask.listen(this._onQueueTask);
    Actions.queueTasks.listen(this._onQueueTasks);
  }

  _onChange = (record: DatabaseChangeRecord<Model>) => {
    for (const key of Object.keys(this._subscriptions)) {
      const subscription = this._subscriptions[key];
      subscription.applyChangeRecord(record);
    }
  };

  _onQueueTask = (task) => {
    try {
      this._optimisticallyRemoveThreads(task);
    } catch (error) {
      console.warn('QuerySubscriptionPool: optimistic removal failed for queueTask', error);
    }
  };

  _onQueueTasks = (tasks) => {
    if (!tasks || !tasks.length) return;
    try {
      for (const task of tasks) {
        this._optimisticallyRemoveThreads(task);
      }
    } catch (error) {
      console.warn('QuerySubscriptionPool: optimistic removal failed for queueTasks', error);
    }
  };

  _threadIdsForRemovalTask(task, subscription?: QuerySubscription<any>): string[] | null {
    const ChangeFolderTask = require('../tasks/change-folder-task').ChangeFolderTask;
    const ChangeLabelsTask = require('../tasks/change-labels-task').ChangeLabelsTask;

    if (task && task.isUndo) {
      return null;
    }

    if (
      !subscription ||
      !subscription._query ||
      subscription._query.objectClass() !== 'Thread'
    ) {
      return null;
    }

    if (
      task instanceof ChangeFolderTask &&
      task.threadIds &&
      task.threadIds.length > 0 &&
      this._subscriptionMatchesCategory(subscription, task.previousFolder && task.previousFolder.id) &&
      !this._subscriptionMatchesCategory(subscription, task.folder && task.folder.id)
    ) {
      return task.threadIds;
    }

    if (
      task instanceof ChangeLabelsTask &&
      task.threadIds &&
      task.threadIds.length > 0 &&
      task.labelsToRemove &&
      task.labelsToRemove.length > 0 &&
      (!task.labelsToAdd || task.labelsToAdd.length === 0)
    ) {
      const labelsToRemove = task.labelsToRemove.map(label => label && label.id).filter(id => !!id);
      if (labelsToRemove.some(labelId => this._subscriptionMatchesCategory(subscription, labelId))) {
        return task.threadIds;
      }
    }
    return null;
  }

  _subscriptionMatchesCategory(subscription: QuerySubscription<any>, categoryId: string) {
    if (!categoryId || !subscription || !subscription._query) {
      return false;
    }

    const query = subscription._query;
    const matchers = query.matchersFlattened ? query.matchersFlattened() : query.matchers();
    if (!matchers || !(matchers instanceof Array)) {
      return false;
    }

    const asId = value => (value && value.id ? value.id : value);
    return matchers.some(matcher => {
      if (!matcher || !matcher.attr) {
        return false;
      }

      const modelKey = matcher.attr.modelKey;
      if (!['categories', 'folders', 'labels'].includes(modelKey)) {
        return false;
      }

      const matcherValue = matcher.value instanceof Function ? matcher.value() : matcher.val;

      if (matcher.comparator === 'contains') {
        return asId(matcherValue) === categoryId;
      }

      if (matcher.comparator === 'containsAny' && matcherValue instanceof Array) {
        return matcherValue.map(asId).includes(categoryId);
      }

      return false;
    });
  }

  _optimisticallyRemoveThreads(task) {
    for (const key of Object.keys(this._subscriptions)) {
      const subscription = this._subscriptions[key];
      if (subscription._query && subscription._query.objectClass() === 'Thread') {
        const threadIds = this._threadIdsForRemovalTask(task, subscription);
        if (threadIds && threadIds.length > 0) {
          subscription.optimisticallyRemoveItemsById(threadIds);
        }
      }
    }
  }
}

const pool = new QuerySubscriptionPool();
export default pool;
