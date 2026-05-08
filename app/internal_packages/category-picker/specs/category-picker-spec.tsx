import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import MovePickerPopover from '../lib/move-picker-popover';

import {
  Folder,
  Label,
  Thread,
  Actions,
  AccountStore,
  CategoryStore,
  FocusedPerspectiveStore,
  MailboxPerspective,
  MailspringTestUtils,
  TaskQueue,
} from 'mailspring-exports';

import { Categories } from 'mailspring-observables';

describe('MovePickerPopover', function () {
  beforeEach(() => (CategoryStore._categoryCache = {}));

  const setupFor = function () {
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

    const observable = MailspringTestUtils.mockObservable(
      [this.inboxCategory, this.archiveCategory, this.userCategory],
      {}
    );
    (observable as any).sort = () => observable;

    spyOn(Categories, 'forAccount').andReturn(observable);
    spyOn(CategoryStore, 'getCategoryByRole').andReturn(this.inboxCategory);
    spyOn(AccountStore, 'accountForItems').andReturn(this.account);
    spyOn(Actions, 'closePopover');

    // By default we're going to set to "inbox". This has implications for
    // what categories get filtered out of the list.
    spyOn(FocusedPerspectiveStore, 'current').andCallFake(() => {
      return MailboxPerspective.forCategory(this.inboxCategory);
    });
  };

  const setupForCreateNew = function () {
    setupFor.call(this);

    this.testThread = new Thread({
      id: 't1',
      subject: 'fake',
      accountId: TEST_ACCOUNT_ID,
      categories: [],
      folders: [],
      labels: [],
    });
    this.picker = ReactTestUtils.renderIntoDocument(
      <MovePickerPopover threads={[this.testThread]} account={this.account} />
    );
  };

  describe('when using folders', function () {
    beforeEach(function () {
      setupFor.call(this);

      this.testThread = new Thread({
        id: 't1',
        subject: 'fake',
        accountId: TEST_ACCOUNT_ID,
        categories: [],
        folders: [],
        labels: [],
      });
      this.picker = ReactTestUtils.renderIntoDocument(
        <MovePickerPopover threads={[this.testThread]} account={this.account} />
      );
    });

    it('lists the desired categories', function () {
      const data = this.picker.state.categoryData;
      // NOTE: The inbox category is not included here because it's the
      // currently focused category, which gets filtered out of the list.
      expect(data.length).toBe(3);

      expect(data[0].id).toBe('id-456');
      expect(data[0].category.role).toBe('archive');
      expect(data[0].category).toBe(this.archiveCategory);

      expect(data[1].divider).toBe(true);
      expect(data[1].id).toBe('category-divider');

      expect(data[2].id).toBe('id-789');
      expect(data[2].category.role).toBeNull();
      expect(data[2].category).toBe(this.userCategory);
    });
  });

  describe("'create new' item", function () {
    beforeEach(function () {
      setupForCreateNew.call(this);
    });

    it('is not visible when the search box is empty', function () {
      const count = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.picker,
        'category-create-new'
      ).length;
      expect(count).toBe(0);
    });

    it('is visible when the search box has text', function () {
      const inputNode = ReactDOM.findDOMNode(
        ReactTestUtils.scryRenderedDOMComponentsWithTag(this.picker, 'input')[0]
      );
      ReactTestUtils.Simulate.change(
        inputNode as Element,
        { target: { value: 'calendar' } } as any
      );
      const count = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.picker,
        'category-create-new'
      ).length;
      expect(count).toBe(1);
    });

    it("shows folder icon if we're using exchange", function () {
      const inputNode = ReactDOM.findDOMNode(
        ReactTestUtils.scryRenderedDOMComponentsWithTag(this.picker, 'input')[0]
      );
      ReactTestUtils.Simulate.change(
        inputNode as Element,
        { target: { value: 'calendar' } } as any
      );
      const count = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.picker,
        'category-create-new-folder'
      ).length;
      expect(count).toBe(1);
    });
  });

  describe('_onSelectCategory', function () {
    beforeEach(function () {
      setupForCreateNew.call(this);
      spyOn(Actions, 'queueTask');
    });

    it('closes the popover', function () {
      this.picker._onSelectCategory({ category: this.archiveCategory });
      expect(Actions.closePopover).toHaveBeenCalled();
    });

    describe('when selecting a folder', () =>
      it('queues a ChangeFolderTask to move the threads', function () {
        this.picker._onSelectCategory({ category: this.archiveCategory });
        expect(Actions.queueTask).toHaveBeenCalled();
        const task = (Actions.queueTask as any).calls[0].args[0];
        expect(task.constructor.name).toBe('ChangeFolderTask');
        expect(task.folder).toBe(this.archiveCategory);
        expect(task.threadIds).toEqual([this.testThread.id]);
      }));

    describe('when selecting a label', () =>
      it('queues a ChangeLabelsTask to apply the label', function () {
        const labelCategory = new Label({
          id: 'lbl-1',
          path: 'MyLabel',
          accountId: TEST_ACCOUNT_ID,
        });
        this.picker._onSelectCategory({ category: labelCategory });
        expect(Actions.queueTask).toHaveBeenCalled();
        const task = (Actions.queueTask as any).calls[0].args[0];
        expect(task.constructor.name).toBe('ChangeLabelsTask');
        expect(task.labelsToAdd).toEqual([labelCategory]);
        expect(task.threadIds).toEqual([this.testThread.id]);
      }));

    describe('when selecting a new category', function () {
      beforeEach(function () {
        this.input = { newCategoryItem: true };
        this.picker.setState({ searchValue: 'teSTing!' });
      });

      it('queues a new syncback task for creating a category', function () {
        this.picker._onSelectCategory(this.input);
        expect(Actions.queueTask).toHaveBeenCalled();
        const syncbackTask = (Actions.queueTask as any).calls[0].args[0];
        expect(syncbackTask.constructor.name).toBe('SyncbackCategoryTask');
        expect(syncbackTask.path).toBe('teSTing!');
        expect(syncbackTask.accountId).toBe(TEST_ACCOUNT_ID);
      });

      it('queues a move task after the new category is saved', function () {
        const createdFolder = new Folder({
          id: 'created-1',
          path: 'teSTing!',
          accountId: TEST_ACCOUNT_ID,
        });
        let resolveSave: any = null;
        spyOn(TaskQueue, 'waitForPerformRemote').andCallFake(function (task) {
          expect(task.constructor.name).toBe('SyncbackCategoryTask');
          return new Promise(function (resolve) {
            resolveSave = resolve;
          });
        });

        this.picker._onSelectCategory(this.input);

        waitsFor(() => (Actions.queueTask as any).callCount > 0);

        runs(function () {
          // Simulate the syncback task completing with the created folder.
          resolveSave({ created: createdFolder });
        });

        waitsFor(() => (Actions.queueTask as any).callCount > 1);

        runs(function () {
          const moveTask = (Actions.queueTask as any).calls[1].args[0];
          expect(moveTask.constructor.name).toBe('ChangeFolderTask');
          expect(moveTask.folder).toBe(createdFolder);
          expect(moveTask.threadIds).toEqual([this.testThread.id]);
        });
      });
    });
  });
});
