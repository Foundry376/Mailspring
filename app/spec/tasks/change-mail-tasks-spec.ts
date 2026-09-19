import {
  ChangeFolderTask,
  ChangeLabelsTask,
  SyncbackEventTask,
  CategoryStore,
  Thread,
  Folder,
  Label,
  Event as MailspringEvent,
} from 'mailspring-exports';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFolder(id: string, role: string, path?: string): Folder {
  return new Folder({ id, role, path: path || role } as any);
}

function makeLabel(id: string, role: string, path?: string): Label {
  return new Label({ id, role, path: path || role } as any);
}

function makeThread(id: string, accountId: string, folders: Folder[] = []): Thread {
  const t = new Thread({ id, accountId } as any);
  t.folders = folders;
  return t;
}

function makeEvent(overrides: Partial<MailspringEvent> = {}): MailspringEvent {
  return new MailspringEvent({
    id: 'event-id-1',
    accountId: 'test-account-id',
    calendarId: 'calendar-id-1',
    ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    recurrenceStart: 1000,
    recurrenceEnd: 2000,
    ...overrides,
  } as any);
}

// ---------------------------------------------------------------------------
// ChangeFolderTask
// ---------------------------------------------------------------------------

describe('ChangeFolderTask', function () {
  let inbox: Folder;
  let archive: Folder;
  let trash: Folder;
  let allMail: Folder;

  beforeEach(function () {
    inbox = makeFolder('inbox-id', 'inbox', 'INBOX');
    archive = makeFolder('archive-id', 'archive', 'archive');
    trash = makeFolder('trash-id', 'trash', 'trash');
    allMail = makeFolder('all-id', 'all', 'all');
  });

  describe('constructor', function () {
    it('is undoable by default, even when threads span several folders', function () {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      const t2 = makeThread('t2', 'ac-1', [trash]);
      const task = new ChangeFolderTask({ threads: [t1, t2], folder: archive } as any);
      expect(task.canBeUndone).toBe(true);
    });

    it('defaults sourceFolderIds to an empty array', function () {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      const task = new ChangeFolderTask({ threads: [t1], folder: archive } as any);
      expect(task.sourceFolderIds).toEqual([]);
      expect(task.toJSON().sourceFolderIds).toEqual([]);
    });

    it('drops the destination from sourceFolderIds', function () {
      // Gmail: dragging from the All Mail folder onto a label scopes the move to All
      // Mail and sends it to All Mail (mailbox-perspective actionsForReceivingThreads).
      const t1 = makeThread('t1', 'ac-1', [allMail]);
      const task = new ChangeFolderTask({
        threads: [t1],
        folder: allMail,
        sourceFolderIds: [allMail.id],
      } as any);
      expect(task.sourceFolderIds).toEqual([]);
      expect(() => task.willBeQueued()).not.toThrow();

      const mixed = new ChangeFolderTask({
        threads: [t1],
        folder: archive,
        sourceFolderIds: [inbox.id, archive.id],
      } as any);
      expect(mixed.sourceFolderIds).toEqual([inbox.id]);
    });

    it('keeps sourceFolderIds and round-trips them through JSON', function () {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      const task = new ChangeFolderTask({
        threads: [t1],
        folder: archive,
        sourceFolderIds: [inbox.id],
      } as any);
      expect(task.sourceFolderIds).toEqual([inbox.id]);
      const copy = task.createIdenticalTask();
      expect(copy.sourceFolderIds).toEqual([inbox.id]);
      expect(copy.folder.id).toBe(archive.id);
    });
  });

  describe('constructor validation', function () {
    it('throws when folder is provided but is not a Folder instance', function () {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      expect(() => {
        new ChangeFolderTask({ threads: [t1], folder: { id: 'not-a-folder' } } as any);
      }).toThrow();
    });

    it('does not throw when folder is a proper Folder instance', function () {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      expect(() => {
        new ChangeFolderTask({ threads: [t1], folder: archive } as any);
      }).not.toThrow();
    });
  });

  describe('willBeQueued()', function () {
    it('throws when folder is not set', function () {
      const task = new ChangeFolderTask({ threadIds: ['t1'] } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when both threads and messages are provided', function () {
      const task = new ChangeFolderTask({
        threadIds: ['t1'],
        messageIds: ['m1'],
        folder: archive,
      } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when neither threads nor messages are provided', function () {
      const task = new ChangeFolderTask({ folder: archive } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('does not throw for a valid task with only threads', function () {
      const task = new ChangeFolderTask({ threadIds: ['t1'], folder: archive } as any);
      expect(() => task.willBeQueued()).not.toThrow();
    });

    it('does not throw for a valid task with only messages', function () {
      const task = new ChangeFolderTask({ messageIds: ['m1'], folder: archive } as any);
      expect(() => task.willBeQueued()).not.toThrow();
    });

    it('throws when sourceFolderIds was changed after construction to contain the destination', function () {
      const task = new ChangeFolderTask({ threadIds: ['t1'], folder: archive } as any);
      task.sourceFolderIds = [archive.id];
      expect(() => task.willBeQueued()).toThrow();
    });
  });

  describe('description()', function () {
    it('returns taskDescription when set', function () {
      const task = new ChangeFolderTask({
        threadIds: ['t1'],
        folder: archive,
        taskDescription: 'My custom description',
      } as any);
      expect(task.description()).toBe('My custom description');
    });

    it('returns "Moved to <folder>" for a single thread', function () {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      const task = new ChangeFolderTask({ threads: [t1], folder: archive } as any);
      expect(task.description()).toContain('archive');
    });

    it('returns a plural message for multiple threads', function () {
      const task = new ChangeFolderTask({
        threadIds: ['t1', 't2', 't3'],
        folder: archive,
      } as any);
      const desc = task.description();
      expect(desc).toContain('3');
      expect(desc).toContain('thread');
    });

    it('returns a plural message for multiple messages', function () {
      const task = new ChangeFolderTask({
        messageIds: ['m1', 'm2'],
        folder: archive,
      } as any);
      const desc = task.description();
      expect(desc).toContain('2');
      expect(desc).toContain('message');
    });

    it('names the source folder when the move is scoped to one', function () {
      spyOn(CategoryStore, 'byId').andCallFake((aid, id) => (id === inbox.id ? inbox : undefined));
      const task = new ChangeFolderTask({
        threadIds: ['t1'],
        accountId: 'ac-1',
        folder: archive,
        sourceFolderIds: [inbox.id],
      } as any);
      expect(task.description()).toBe('Moved from Inbox to archive');
    });
  });

  describe('_isArchive()', function () {
    it('returns true when folder.name is "archive"', function () {
      const task = new ChangeFolderTask({ threadIds: ['t1'], folder: archive } as any);
      expect(task._isArchive()).toBe(true);
    });

    it('returns true when folder.name is "all"', function () {
      const task = new ChangeFolderTask({ threadIds: ['t1'], folder: allMail } as any);
      expect(task._isArchive()).toBe(true);
    });

    it('returns false for inbox', function () {
      const task = new ChangeFolderTask({ threadIds: ['t1'], folder: inbox } as any);
      expect(task._isArchive()).toBe(false);
    });

    it('returns false for trash', function () {
      const task = new ChangeFolderTask({ threadIds: ['t1'], folder: trash } as any);
      expect(task._isArchive()).toBe(false);
    });
  });

  describe('createUndoTask()', function () {
    beforeEach(function () {
      const known = { [inbox.id]: inbox, [archive.id]: archive, [trash.id]: trash };
      spyOn(CategoryStore, 'byId').andCallFake((aid, id) => known[id]);
    });

    // Mirrors the version of the task the engine streams back after its local phase.
    function taskAfterLocalPhase(undoPlacements) {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      const task = new ChangeFolderTask({
        threads: [t1],
        folder: archive,
        sourceFolderIds: [inbox.id],
      } as any);
      return new ChangeFolderTask({ ...task.toJSON(), status: 'remote', undoPlacements });
    }

    it('copies the engine-written undoPlacements to restorePlacements', function () {
      const undoPlacements = {
        'm-1': [{ folderId: inbox.id, remoteUID: 41 }],
        'm-2': [
          { folderId: inbox.id, remoteUID: 42 },
          { folderId: trash.id, remoteUID: 7 },
        ],
      };
      const undoTask = taskAfterLocalPhase(undoPlacements).createUndoTask();
      expect(undoTask.restorePlacements).toEqual(undoPlacements);
      expect(undoTask.undoPlacements).toBeUndefined();
      expect(undoTask.sourceFolderIds).toEqual([]);
      expect(undoTask.threadIds).toEqual(['t1']);
      expect(undoTask.isUndo).toBe(true);
    });

    it('sets folder to the first recorded source so the undo has a sensible description', function () {
      const undoTask = taskAfterLocalPhase({
        'm-1': [{ folderId: inbox.id, remoteUID: 41 }],
      }).createUndoTask();
      expect(undoTask.folder.id).toBe(inbox.id);
      expect(undoTask.description()).toBe('Moved to Inbox');
    });

    it('serializes restorePlacements for the engine', function () {
      const undoPlacements = { 'm-1': [{ folderId: inbox.id, remoteUID: 41 }] };
      const json = taskAfterLocalPhase(undoPlacements).createUndoTask().toJSON();
      expect(json.restorePlacements).toEqual(undoPlacements);
      expect(json.isUndo).toBe(true);
      expect(json.undoPlacements).toBeUndefined();
    });

    it('falls back to reversing a single-source move when the engine has not reported placements', function () {
      const t1 = makeThread('t1', 'ac-1', [inbox]);
      const task = new ChangeFolderTask({
        threads: [t1],
        folder: archive,
        sourceFolderIds: [inbox.id],
      } as any);
      const undoTask = task.createUndoTask();
      expect(undoTask.folder.id).toBe(inbox.id);
      expect(undoTask.sourceFolderIds).toEqual([archive.id]);
      expect(undoTask.restorePlacements).toBeUndefined();
    });

    describe('without undoPlacements or a single source folder', function () {
      it('sends each thread back to the folder it was in when the task was built', function () {
        const sent = makeFolder('sent-id', 'sent', 'Sent');
        const t1 = makeThread('t1', 'ac-1', [inbox, sent]);
        const t2 = makeThread('t2', 'ac-1', [inbox]);
        const t3 = makeThread('t3', 'ac-1', [trash]);
        const task = new ChangeFolderTask({ threads: [t1, t2, t3], folder: archive } as any);

        const undoTasks = task.createUndoTasks();
        expect(undoTasks.length).toBe(2);
        const [toInbox, toTrash] = undoTasks;
        expect(toInbox.folder.id).toBe(inbox.id);
        expect(toInbox.threadIds).toEqual(['t1', 't2']);
        expect(toInbox.sourceFolderIds).toEqual([archive.id]);
        expect(toInbox.isUndo).toBe(true);
        expect(toTrash.folder.id).toBe(trash.id);
        expect(toTrash.threadIds).toEqual(['t3']);
        expect(toTrash.sourceFolderIds).toEqual([archive.id]);
        expect(() => task.createUndoTask()).toThrow();
      });

      it('prefers a folder the move was scoped to over one it was not', function () {
        const spam = makeFolder('spam-id', 'spam', 'Spam');
        const t1 = makeThread('t1', 'ac-1', [inbox, spam]);
        const task = new ChangeFolderTask({
          threads: [t1],
          folder: trash,
          sourceFolderIds: [spam.id, 'other-folder-id'],
        } as any);
        const [undoTask] = task.createUndoTasks();
        expect(undoTask.folder.id).toBe(spam.id);
      });

      it('falls back to a Sent copy only when nothing else was moved', function () {
        const sent = makeFolder('sent-id', 'sent', 'Sent');
        const t1 = makeThread('t1', 'ac-1', [sent]);
        const task = new ChangeFolderTask({ threads: [t1], folder: trash } as any);
        const [undoTask] = task.createUndoTasks();
        expect(undoTask.folder.id).toBe(sent.id);
      });

      it('returns no undo tasks when the original folders are unknown', function () {
        const task = new ChangeFolderTask({ threadIds: ['t1'], folder: archive } as any);
        expect(task.createUndoTasks()).toEqual([]);
        expect(() => task.createUndoTask()).toThrow();
      });
    });

    it('does not carry undoPlacements onto a redo (identical) task', function () {
      const task = taskAfterLocalPhase({ 'm-1': [{ folderId: inbox.id, remoteUID: 41 }] });
      expect(task.createIdenticalTask().undoPlacements).toBeUndefined();
    });

    it('throws when attempting to create an undo of an undo', function () {
      const undoTask = taskAfterLocalPhase({
        'm-1': [{ folderId: inbox.id, remoteUID: 41 }],
      }).createUndoTask();
      expect(() => undoTask.createUndoTask()).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// ChangeLabelsTask
// ---------------------------------------------------------------------------

describe('ChangeLabelsTask', function () {
  let inbox: Label;
  let spam: Label;
  let trash: Label;
  let archive: Label;
  let allMail: Label;
  let workLabel: Label;

  beforeEach(function () {
    inbox = makeLabel('inbox-id', 'inbox', 'INBOX');
    spam = makeLabel('spam-id', 'spam', 'spam');
    trash = makeLabel('trash-id', 'trash', 'trash');
    archive = makeLabel('archive-id', 'archive', 'archive');
    allMail = makeLabel('all-id', 'all', 'all');
    workLabel = makeLabel('work-id', null, 'Work');
  });

  describe('description()', function () {
    it('returns taskDescription when set', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [spam],
        labelsToRemove: [],
        taskDescription: 'Custom label change',
      } as any);
      expect(task.description()).toBe('Custom label change');
    });

    it('returns "Marked as Spam" when adding spam label (single thread)', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [spam],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Marked as Spam');
    });

    it('returns "Marked 3 threads as Spam" when adding spam to multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2', 't3'],
        labelsToAdd: [spam],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Marked 3 threads as Spam');
    });

    it('returns "Unmarked as Spam" when removing spam label (single thread)', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [],
        labelsToRemove: [spam],
      } as any);
      expect(task.description()).toBe('Unmarked as Spam');
    });

    it('returns "Unmarked 2 threads as Spam" when removing spam from multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2'],
        labelsToAdd: [],
        labelsToRemove: [spam],
      } as any);
      expect(task.description()).toBe('Unmarked 2 threads as Spam');
    });

    it('returns "Trashed" when adding trash label (single thread)', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [trash],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Trashed');
    });

    it('returns "Trashed 2 threads" when adding trash to multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2'],
        labelsToAdd: [trash],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Trashed 2 threads');
    });

    it('returns "Removed from Trash" when removing trash label (single thread)', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [],
        labelsToRemove: [trash],
      } as any);
      expect(task.description()).toBe('Removed from Trash');
    });

    it('returns "Archived" when removing inbox label with no additions (single thread)', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [],
        labelsToRemove: [inbox],
      } as any);
      expect(task.description()).toBe('Archived');
    });

    it('returns "Archived 2 threads" when removing inbox from multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2'],
        labelsToAdd: [],
        labelsToRemove: [inbox],
      } as any);
      expect(task.description()).toBe('Archived 2 threads');
    });

    it('returns "Unarchived" when adding inbox label with no removals (single thread)', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [inbox],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Unarchived');
    });

    it('returns "Unarchived 3 threads" when adding inbox to multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2', 't3'],
        labelsToAdd: [inbox],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Unarchived 3 threads');
    });

    it('returns "Added <label>" for single label add on single thread', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Added Work');
    });

    it('returns "Added <label> to N threads" for single label add on multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2'],
        labelsToAdd: [workLabel],
        labelsToRemove: [],
      } as any);
      expect(task.description()).toBe('Added Work to 2 threads');
    });

    it('returns "Removed <label>" for single label remove on single thread', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [],
        labelsToRemove: [workLabel],
      } as any);
      expect(task.description()).toBe('Removed Work');
    });

    it('returns "Removed <label> from N threads" for single label remove on multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2'],
        labelsToAdd: [],
        labelsToRemove: [workLabel],
      } as any);
      expect(task.description()).toBe('Removed Work from 2 threads');
    });

    it('returns "Changed labels" for mixed add/remove on single thread', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [workLabel],
      } as any);
      expect(task.description()).toBe('Changed labels');
    });

    it('returns "Changed labels on N threads" for mixed add/remove on multiple threads', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1', 't2'],
        labelsToAdd: [workLabel],
        labelsToRemove: [workLabel],
      } as any);
      expect(task.description()).toBe('Changed labels on 2 threads');
    });
  });

  describe('willBeQueued()', function () {
    it('throws when messageIds are provided (individual message labels unsupported)', function () {
      const task = new ChangeLabelsTask({
        messageIds: ['m1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [],
      } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when labelsToAdd is missing', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToRemove: [],
      } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when labelsToRemove is missing', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [],
      } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when labelsToAdd contains a non-Label instance', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [{ id: 'not-a-label', role: 'inbox' }],
        labelsToRemove: [],
      } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when labelsToRemove contains a non-Label instance', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [],
        labelsToRemove: [{ id: 'not-a-label', role: 'spam' }],
      } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('does not throw for a valid task', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [inbox],
      } as any);
      expect(() => task.willBeQueued()).not.toThrow();
    });
  });

  describe('_isArchive()', function () {
    it('returns true when labelsToAdd includes "all"', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [allMail],
        labelsToRemove: [],
      } as any);
      expect(task._isArchive()).toBe(true);
    });

    it('returns true when labelsToAdd includes "archive"', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [archive],
        labelsToRemove: [],
      } as any);
      expect(task._isArchive()).toBe(true);
    });

    it('returns false when labelsToAdd does not include archive labels', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [],
      } as any);
      expect(task._isArchive()).toBe(false);
    });

    it('returns false when archive is only in labelsToRemove', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [],
        labelsToRemove: [archive],
      } as any);
      expect(task._isArchive()).toBe(false);
    });
  });

  describe('createUndoTask()', function () {
    it('swaps labelsToAdd and labelsToRemove', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [inbox],
      } as any);
      const undoTask = task.createUndoTask();
      expect(undoTask.labelsToAdd.map((l) => l.id)).toEqual([inbox.id]);
      expect(undoTask.labelsToRemove.map((l) => l.id)).toEqual([workLabel.id]);
    });

    it('marks the undo task as isUndo=true', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [],
      } as any);
      const undoTask = task.createUndoTask();
      expect(undoTask.isUndo).toBe(true);
    });

    it('preserves the original labelsToAdd/Remove (the undo task holds the originals)', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [spam],
        labelsToRemove: [inbox],
      } as any);
      const undoTask = task.createUndoTask();
      // After undo, we want to undo the spam add and restore inbox
      expect(undoTask.labelsToAdd[0].role).toBe('inbox');
      expect(undoTask.labelsToRemove[0].role).toBe('spam');
    });

    it('throws when attempting to create undo of an undo task', function () {
      const task = new ChangeLabelsTask({
        threadIds: ['t1'],
        labelsToAdd: [workLabel],
        labelsToRemove: [],
      } as any);
      const undoTask = task.createUndoTask();
      expect(() => undoTask.createUndoTask()).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// SyncbackEventTask
// ---------------------------------------------------------------------------

describe('SyncbackEventTask', function () {
  const SAMPLE_ICS_ORIGINAL = 'BEGIN:VCALENDAR\nSUMMARY:Original\nEND:VCALENDAR';
  const SAMPLE_ICS_NEW = 'BEGIN:VCALENDAR\nSUMMARY:Updated\nEND:VCALENDAR';

  describe('forCreating()', function () {
    it('creates a task without undoData', function () {
      const event = makeEvent();
      const task = SyncbackEventTask.forCreating({
        event,
        calendarId: 'cal-1',
        accountId: 'ac-1',
      });
      expect(task.undoData).toBeFalsy();
    });

    it('sets canBeUndone=false when there is no undoData', function () {
      const event = makeEvent();
      const task = SyncbackEventTask.forCreating({
        event,
        calendarId: 'cal-1',
        accountId: 'ac-1',
      });
      expect(task.canBeUndone).toBe(false);
    });

    it('sets event, calendarId and accountId correctly', function () {
      const event = makeEvent({ calendarId: 'cal-2', accountId: 'ac-2' } as any);
      const task = SyncbackEventTask.forCreating({
        event,
        calendarId: 'cal-2',
        accountId: 'ac-2',
      });
      expect(task.event).toBe(event);
      expect(task.calendarId).toBe('cal-2');
      expect(task.accountId).toBe('ac-2');
    });
  });

  describe('forUpdating()', function () {
    it('captures a newData snapshot from the event at creation time', function () {
      const event = makeEvent({
        ics: SAMPLE_ICS_NEW,
        recurrenceStart: 5000,
        recurrenceEnd: 6000,
      } as any);
      const task = SyncbackEventTask.forUpdating({
        event,
        undoData: { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 },
        description: 'Move event',
      });
      expect(task.newData).toBeDefined();
      expect(task.newData.ics).toBe(SAMPLE_ICS_NEW);
      expect(task.newData.recurrenceStart).toBe(5000);
      expect(task.newData.recurrenceEnd).toBe(6000);
    });

    it('sets canBeUndone=true when undoData is provided', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const task = SyncbackEventTask.forUpdating({
        event,
        undoData: { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 },
      });
      expect(task.canBeUndone).toBe(true);
    });

    it('sets canBeUndone=false when undoData is not provided', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const task = SyncbackEventTask.forUpdating({ event });
      expect(task.canBeUndone).toBe(false);
    });

    it('stores the undoData on the task', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({ event, undoData });
      expect(task.undoData).toBe(undoData);
    });

    it('stores the description as taskDescription', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const task = SyncbackEventTask.forUpdating({ event, description: 'Edit event title' });
      expect(task.taskDescription).toBe('Edit event title');
    });

    it('derives calendarId and accountId from the event', function () {
      const event = makeEvent({ calendarId: 'cal-3', accountId: 'ac-3' } as any);
      const task = SyncbackEventTask.forUpdating({ event });
      expect(task.calendarId).toBe('cal-3');
      expect(task.accountId).toBe('ac-3');
    });
  });

  describe('createUndoTask()', function () {
    it('throws when undoData is not present', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const task = SyncbackEventTask.forCreating({
        event,
        calendarId: 'cal-1',
        accountId: 'ac-1',
      });
      expect(() => task.createUndoTask()).toThrow();
    });

    it('restores the event to the undoData state', function () {
      const event = makeEvent({
        ics: SAMPLE_ICS_NEW,
        recurrenceStart: 5000,
        recurrenceEnd: 6000,
      } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({ event, undoData });
      const undoTask = task.createUndoTask();
      expect(undoTask.event.ics).toBe(SAMPLE_ICS_ORIGINAL);
      expect(undoTask.event.recurrenceStart).toBe(1000);
      expect(undoTask.event.recurrenceEnd).toBe(2000);
    });

    it('swaps undoData and newData so the undo task can itself be undone (redo)', function () {
      const event = makeEvent({
        ics: SAMPLE_ICS_NEW,
        recurrenceStart: 5000,
        recurrenceEnd: 6000,
      } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({ event, undoData });
      const undoTask = task.createUndoTask();

      // The undo task's undoData should be the original task's newData (so redo works)
      expect(undoTask.undoData).toBe(task.newData);
      // The undo task's newData should be the original undoData
      expect(undoTask.newData).toBe(undoData);
    });

    it('returns a cloned event (not the same reference)', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({ event, undoData });
      const undoTask = task.createUndoTask();
      expect(undoTask.event).not.toBe(event);
    });

    it('prefixes the taskDescription with "Undo"', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({
        event,
        undoData,
        description: 'Move event',
      });
      const undoTask = task.createUndoTask();
      expect(undoTask.taskDescription).toContain('Move event');
      expect(undoTask.taskDescription).toContain('Undo');
    });
  });

  describe('createIdenticalTask()', function () {
    it('falls back to default behavior when newData is not present (forCreating path)', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const task = SyncbackEventTask.forCreating({
        event,
        calendarId: 'cal-1',
        accountId: 'ac-1',
      });
      // Should not throw; falls back to super.createIdenticalTask()
      expect(() => task.createIdenticalTask()).not.toThrow();
    });

    it('creates a redo task with event state from the newData snapshot', function () {
      const event = makeEvent({
        ics: SAMPLE_ICS_NEW,
        recurrenceStart: 5000,
        recurrenceEnd: 6000,
      } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({ event, undoData });

      // Simulate the event being mutated after the task was created
      event.ics = 'BEGIN:VCALENDAR\nMUTATED\nEND:VCALENDAR';
      event.recurrenceStart = 9999;

      const redoTask = task.createIdenticalTask();
      // The redo task should use the snapshot, not the mutated event
      expect(redoTask.event.ics).toBe(SAMPLE_ICS_NEW);
      expect(redoTask.event.recurrenceStart).toBe(5000);
    });

    it('preserves undoData and newData on the redo task', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({ event, undoData });
      const redoTask = task.createIdenticalTask();
      expect(redoTask.undoData).toBe(task.undoData);
      expect(redoTask.newData).toBe(task.newData);
    });

    it('returns a cloned event (not the same reference)', function () {
      const event = makeEvent({ ics: SAMPLE_ICS_NEW } as any);
      const undoData = { ics: SAMPLE_ICS_ORIGINAL, recurrenceStart: 1000, recurrenceEnd: 2000 };
      const task = SyncbackEventTask.forUpdating({ event, undoData });
      const redoTask = task.createIdenticalTask();
      expect(redoTask.event).not.toBe(event);
    });
  });
});
