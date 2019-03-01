import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import MovePickerPopover from '../lib/move-picker-popover';

import {
  Category,
  Folder,
  Thread,
  Actions,
  AccountStore,
  CategoryStore,
  DatabaseStore,
  TaskFactory,
  SyncbackCategoryTask,
  FocusedPerspectiveStore,
  MailboxPerspective,
  MailspringTestUtils,
  TaskQueue,
} from 'mailspring-exports';

import { Categories } from 'mailspring-observables';

describe('MovePickerPopover', function() {
  beforeEach(() => (CategoryStore._categoryCache = {}));

  const setupFor = function() {
    this.account = {
      id: TEST_ACCOUNT_ID,
    };

    this.inboxCategory = new Folder({
      id: 'id-123',
      role: 'inbox',
      path: 'INBOX',
      accountId: TEST_ACCOUNT_ID,
    });
    this.archiveCategory = new Folder({
      id: 'id-456',
      role: 'archive',
      path: 'ArCHIVe',
      accountId: TEST_ACCOUNT_ID,
    });
    this.userCategory = new Folder({
      id: 'id-789',
      role: null,
      path: 'MyCategory',
      accountId: TEST_ACCOUNT_ID,
    });

    const observable = MailspringTestUtils.mockObservable([
      this.inboxCategory,
      this.archiveCategory,
      this.userCategory,
    ]);
    observable.sort = () => observable;

    spyOn(Categories, 'forAccount').andReturn(observable);
    spyOn(CategoryStore, 'getCategoryByRole').andReturn(this.inboxCategory);
    spyOn(AccountStore, 'accountForItems').andReturn(this.account);
    spyOn(Actions, 'closePopover');

    // By default we're going to set to "inbox". This has implications for
    // what categories get filtered out of the list.
    spyOn(FocusedPerspectiveStore, 'current').and.callFake(() => {
      return MailboxPerspective.forCategory(this.inboxCategory);
    });
  };

  const setupForCreateNew = function() {
    setupFor.call(this);

    this.testThread = new Thread({
      id: 't1',
      subject: 'fake',
      accountId: TEST_ACCOUNT_ID,
      categories: [],
    });
    this.picker = ReactTestUtils.renderIntoDocument(
      <MovePickerPopover threads={[this.testThread]} account={this.account} />
    );
  };

  describe('when using folders', function() {
    beforeEach(function() {
      setupFor.call(this);

      this.testThread = new Thread({
        id: 't1',
        subject: 'fake',
        accountId: TEST_ACCOUNT_ID,
        categories: [],
      });
      this.picker = ReactTestUtils.renderIntoDocument(
        <MovePickerPopover threads={[this.testThread]} account={this.account} />
      );
    });

    it('lists the desired categories', function() {
      const data = this.picker.state.categoryData;
      // NOTE: The inbox category is not included here because it's the
      // currently focused category, which gets filtered out of the list.
      expect(data.length).toBe(3);

      expect(data[0].id).toBe('id-456');
      expect(data[0].name).toBe('archive');
      expect(data[0].category).toBe(this.archiveCategory);

      expect(data[1].divider).toBe(true);
      expect(data[1].id).toBe('category-divider');

      expect(data[2].id).toBe('id-789');
      expect(data[2].name).toBeUndefined();
      expect(data[2].category).toBe(this.userCategory);
    });
  });

  describe("'create new' item", function() {
    beforeEach(function() {
      setupForCreateNew.call(this);
    });

    it('is not visible when the search box is empty', function() {
      const count = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.picker,
        'category-create-new'
      ).length;
      expect(count).toBe(0);
    });

    it('is visible when the search box has text', function() {
      const inputNode = ReactDOM.findDOMNode(
        ReactTestUtils.scryRenderedDOMComponentsWithTag(this.picker, 'input')[0]
      );
      ReactTestUtils.Simulate.change(inputNode, { target: { value: 'calendar' } });
      const count = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.picker,
        'category-create-new'
      ).length;
      expect(count).toBe(1);
    });

    it("shows folder icon if we're using exchange", function() {
      const inputNode = ReactDOM.findDOMNode(
        ReactTestUtils.scryRenderedDOMComponentsWithTag(this.picker, 'input')[0]
      );
      ReactTestUtils.Simulate.change(inputNode, { target: { value: 'calendar' } });
      const count = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.picker,
        'category-create-new-folder'
      ).length;
      expect(count).toBe(1);
    });
  });

  describe('_onSelectCategory', function() {
    beforeEach(function() {
      setupForCreateNew.call(this);
      spyOn(TaskFactory, 'taskForRemovingCategory').andCallThrough();
      spyOn(TaskFactory, 'tasK').andCallThrough();
      spyOn(Actions, 'queueTask');
    });

    it('closes the popover', function() {
      this.picker._onSelectCategory({ usage: 0, category: 'asdf' });
      expect(Actions.closePopover).toHaveBeenCalled();
    });

    describe('when selecting a category currently on all the selected items', () =>
      it('fires a task to remove the category', function() {
        const input = {
          category: 'asdf',
          usage: 1,
        };

        this.picker._onSelectCategory(input);
        expect(TaskFactory.taskForRemovingCategory).toHaveBeenCalledWith({
          threads: [this.testThread],
          category: 'asdf',
        });
        expect(Actions.queueTask).toHaveBeenCalled();
      }));

    describe('when selecting a category not on all the selected items', () =>
      it('fires a task to add the category', function() {
        const input = {
          category: 'asdf',
          usage: 0,
        };

        this.picker._onSelectCategory(input);
        expect(TaskFactory.taskForApplyingCategory).toHaveBeenCalledWith({
          threads: [this.testThread],
          category: 'asdf',
        });
        expect(Actions.queueTask).toHaveBeenCalled();
      }));

    describe('when selecting a new category', function() {
      beforeEach(function() {
        this.input = { newCategoryItem: true };
        this.picker.setState({ searchValue: 'teSTing!' });
      });

      it('queues a new syncback task for creating a category', function() {
        this.picker._onSelectCategory(this.input);
        expect(Actions.queueTask).toHaveBeenCalled();
        const syncbackTask = Actions.queueTask.calls[0].args[0];
        const newCategory = syncbackTask.category;
        expect(newCategory instanceof Category).toBe(true);
        expect(newCategory.displayName).toBe('teSTing!');
        expect(newCategory.accountId).toBe(TEST_ACCOUNT_ID);
      });

      it('queues a task for applying the category after it has saved', function() {
        let category = false;
        let resolveSave = false;
        spyOn(TaskQueue, 'waitForPerformRemote').and.callFake(function(task) {
          expect(task instanceof SyncbackCategoryTask).toBe(true);
          return new Promise(function(resolve, reject) {
            resolveSave = resolve;
          });
        });

        spyOn(DatabaseStore, 'findBy').and.callFake(function(klass, { id }) {
          expect(klass).toBe(Category);
          expect(typeof id).toBe('string');
          Promise.resolve(category);
        });

        this.picker._onSelectCategory(this.input);

        waitsFor(() => Actions.queueTask.callCount > 0);

        runs(function() {
          ({ category } = Actions.queueTask.calls[0].args[0]);
          resolveSave();
        });

        waitsFor(() => TaskFactory.taskForApplyingCategory.calls.length === 1);

        runs(function() {
          expect(TaskFactory.taskForApplyingCategory).toHaveBeenCalledWith({
            threads: [this.testThread],
            category,
          });
        });
      });
    });
  });
});
