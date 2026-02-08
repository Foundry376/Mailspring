import QuerySubscriptionPool from '../../src/flux/models/query-subscription-pool';
import DatabaseStore from '../../src/flux/stores/database-store';
import { Label } from '../../src/flux/models/label';
import { Thread } from '../../src/flux/models/thread';
import { Folder } from '../../src/flux/models/folder';
import { ChangeFolderTask } from '../../src/flux/tasks/change-folder-task';
import { ChangeLabelsTask } from '../../src/flux/tasks/change-labels-task';

describe('QuerySubscriptionPool', function QuerySubscriptionPoolSpecs() {
  beforeEach(() => {
    this.query = DatabaseStore.findAll<Label>(Label);
    this.queryKey = this.query.sql();
    QuerySubscriptionPool._subscriptions = {};
    QuerySubscriptionPool._cleanupChecks = [];
  });

  describe('add', () => {
    it('should add a new subscription with the callback', () => {
      const callback = jasmine.createSpy('callback');
      QuerySubscriptionPool.add(this.query, callback);
      expect(QuerySubscriptionPool._subscriptions[this.queryKey]).toBeDefined();

      const subscription = QuerySubscriptionPool._subscriptions[this.queryKey];
      expect(subscription.hasCallback(callback)).toBe(true);
    });

    it('should yield database changes to the subscription', () => {
      const callback = jasmine.createSpy('callback');
      QuerySubscriptionPool.add(this.query, callback);
      const subscription = QuerySubscriptionPool._subscriptions[this.queryKey];
      spyOn(subscription, 'applyChangeRecord');

      const record = { objectType: 'whateves' };
      QuerySubscriptionPool._onChange(record);
      expect(subscription.applyChangeRecord).toHaveBeenCalledWith(record);
    });

    describe('unsubscribe', () => {
      it('should return an unsubscribe method', () => {
        expect(QuerySubscriptionPool.add(this.query, () => {}) instanceof Function).toBe(true);
      });

      it('should remove the callback from the subscription', () => {
        const cb = () => {};

        const unsub = QuerySubscriptionPool.add(this.query, cb);
        const subscription = QuerySubscriptionPool._subscriptions[this.queryKey];

        expect(subscription.hasCallback(cb)).toBe(true);
        unsub();
        expect(subscription.hasCallback(cb)).toBe(false);
      });

      it("should wait before removing th subscription to make sure it's not reused", () => {
        const unsub = QuerySubscriptionPool.add(this.query, () => {});
        expect(QuerySubscriptionPool._subscriptions[this.queryKey]).toBeDefined();
        unsub();
        expect(QuerySubscriptionPool._subscriptions[this.queryKey]).toBeDefined();
        advanceClock();
        expect(QuerySubscriptionPool._subscriptions[this.queryKey]).toBeUndefined();
      });
    });
  });

  describe('_threadIdsForRemovalTask', () => {
    it('should return threadIds for a ChangeFolderTask', () => {
      const threads = [
        new Thread({ id: 't1', accountId: 'a1', folders: [new Folder({ id: 'f1' })] }),
      ];
      const task = new ChangeFolderTask({
        threads,
        folder: new Folder({ id: 'trash-folder', role: 'trash', accountId: 'a1' }),
      });
      const result = QuerySubscriptionPool._threadIdsForRemovalTask(task);
      expect(result).toEqual(['t1']);
    });

    it('should return threadIds for a ChangeLabelsTask with only removals', () => {
      const task = new ChangeLabelsTask({
        threads: [new Thread({ id: 't2', accountId: 'a1' })],
        labelsToRemove: [new Label({ id: 'inbox', role: 'inbox', accountId: 'a1' })],
        labelsToAdd: [],
      });
      const result = QuerySubscriptionPool._threadIdsForRemovalTask(task);
      expect(result).toEqual(['t2']);
    });

    it('should return null for a ChangeLabelsTask with additions', () => {
      const task = new ChangeLabelsTask({
        threads: [new Thread({ id: 't3', accountId: 'a1' })],
        labelsToRemove: [new Label({ id: 'inbox', role: 'inbox', accountId: 'a1' })],
        labelsToAdd: [new Label({ id: 'archive', role: 'all', accountId: 'a1' })],
      });
      const result = QuerySubscriptionPool._threadIdsForRemovalTask(task);
      expect(result).toBeNull();
    });
  });

  describe('_optimisticallyRemoveThreads', () => {
    it('should call optimisticallyRemoveItemsById on Thread subscriptions', () => {
      const threadQuery = DatabaseStore.findAll<Thread>(Thread);
      const threadKey = threadQuery.sql();
      const callback = jasmine.createSpy('callback');
      QuerySubscriptionPool.add(threadQuery, callback);
      const subscription = QuerySubscriptionPool._subscriptions[threadKey];
      spyOn(subscription, 'optimisticallyRemoveItemsById');

      QuerySubscriptionPool._optimisticallyRemoveThreads(['t1', 't2']);
      expect(subscription.optimisticallyRemoveItemsById).toHaveBeenCalledWith(['t1', 't2']);
    });

    it('should not call optimisticallyRemoveItemsById on non-Thread subscriptions', () => {
      const labelQuery = DatabaseStore.findAll<Label>(Label);
      const labelKey = labelQuery.sql();
      const callback = jasmine.createSpy('callback');
      QuerySubscriptionPool.add(labelQuery, callback);
      const subscription = QuerySubscriptionPool._subscriptions[labelKey];
      spyOn(subscription, 'optimisticallyRemoveItemsById');

      QuerySubscriptionPool._optimisticallyRemoveThreads(['t1']);
      expect(subscription.optimisticallyRemoveItemsById).not.toHaveBeenCalled();
    });
  });
});
