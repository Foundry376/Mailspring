const React = require('react');
const ReactDOM = require('react-dom');
const ReactTestUtils = require('react-dom/test-utils');
const {
  Thread,
  Actions,
  CategoryStore,
  TaskFactory,
  MailboxPerspective,
} = require('mailspring-exports');
const {
  ToggleStarredButton,
  ToggleUnreadButton,
  MarkAsSpamButton,
} = require('../lib/thread-toolbar-buttons');

const test_thread = new Thread().fromJSON({
  id: 'thread_12345',
  account_id: TEST_ACCOUNT_ID,
  subject: 'Subject 12345',
  starred: false,
});

const test_thread_starred = new Thread().fromJSON({
  id: 'thread_starred_12345',
  account_id: TEST_ACCOUNT_ID,
  subject: 'Subject 12345',
  starred: true,
});

describe('ThreadToolbarButtons', function() {
  beforeEach(function() {
    spyOn(Actions, 'queueTask');
    spyOn(Actions, 'queueTasks');
    spyOn(TaskFactory, 'taskForInvertingStarred').andCallThrough();
    spyOn(TaskFactory, 'taskForInvertingUnread').andCallThrough();
  });

  describe('Starring', function() {
    it('stars a thread if the star button is clicked and thread is unstarred', function() {
      const starButton = ReactTestUtils.renderIntoDocument(
        <ToggleStarredButton items={[test_thread]} />
      );

      ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(starButton));

      expect(TaskFactory.taskForInvertingStarred.mostRecentCall.args[0].threads).toEqual([
        test_thread,
      ]);
    });

    it('unstars a thread if the star button is clicked and thread is starred', function() {
      const starButton = ReactTestUtils.renderIntoDocument(
        <ToggleStarredButton items={[test_thread_starred]} />
      );

      ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(starButton));

      expect(TaskFactory.taskForInvertingStarred.mostRecentCall.args[0].threads).toEqual([
        test_thread_starred,
      ]);
    });
  });

  describe('Marking as unread', function() {
    let thread = null;
    let markUnreadBtn = null;

    beforeEach(function() {
      thread = new Thread({ id: 'thread-id-lol-123', accountId: TEST_ACCOUNT_ID, unread: false });
      markUnreadBtn = ReactTestUtils.renderIntoDocument(<ToggleUnreadButton items={[thread]} />);
    });

    it('queues a task to change unread status to true', function() {
      ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(markUnreadBtn).childNodes[0]);
      expect(TaskFactory.taskForInvertingUnread.mostRecentCall.args[0].threads).toEqual([thread]);
      expect(Actions.queueTask).toHaveBeenCalled();
    });

    it('returns to the thread list', function() {
      spyOn(Actions, 'popSheet');
      ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(markUnreadBtn).childNodes[0]);
      expect(Actions.popSheet).toHaveBeenCalled();
    });
  });

  describe('Marking as spam', function() {
    let thread = null;
    let markSpamButton = null;

    describe('when the thread is already in spam', function() {
      beforeEach(function() {
        thread = new Thread({
          id: 'thread-id-lol-123',
          accountId: TEST_ACCOUNT_ID,
          folders: [{ role: 'spam' }],
        });
        markSpamButton = ReactTestUtils.renderIntoDocument(<MarkAsSpamButton items={[thread]} />);
      });

      it('queues a task to remove spam', function() {
        spyOn(TaskFactory, 'tasksForMarkingNotSpam');
        spyOn(CategoryStore, 'getSpamCategory').andReturn(thread.folders[0]);
        ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(markSpamButton));
        expect(TaskFactory.tasksForMarkingNotSpam.mostRecentCall.args[0].threads).toEqual([thread]);
        expect(Actions.queueTasks).toHaveBeenCalled();
      });
    });

    describe('when the thread can be moved to spam', function() {
      beforeEach(function() {
        spyOn(MailboxPerspective.prototype, 'canMoveThreadsTo').andReturn(true);
        thread = new Thread({ id: 'thread-id-lol-123', accountId: TEST_ACCOUNT_ID, folders: [] });
        markSpamButton = ReactTestUtils.renderIntoDocument(<MarkAsSpamButton items={[thread]} />);
      });

      it('queues a task to mark as spam', function() {
        spyOn(TaskFactory, 'tasksForMarkingAsSpam');
        ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(markSpamButton));
        expect(TaskFactory.tasksForMarkingAsSpam).toHaveBeenCalledWith({
          threads: [thread],
          source: 'Toolbar Button: Thread List',
        });
      });

      it('returns to the thread list', function() {
        spyOn(Actions, 'popSheet');
        ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(markSpamButton));
        expect(Actions.popSheet).toHaveBeenCalled();
      });
    });
  });
});
