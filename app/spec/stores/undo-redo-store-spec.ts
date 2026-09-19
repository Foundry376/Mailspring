import UndoRedoStore from '../../src/flux/stores/undo-redo-store';
import TaskQueue from '../../src/flux/stores/task-queue';
import CategoryStore from '../../src/flux/stores/category-store';
import * as Actions from '../../src/flux/actions';
import { ChangeFolderTask } from '../../src/flux/tasks/change-folder-task';
import { Folder } from '../../src/flux/models/folder';

// Lets a chain of already-resolved promises settle without relying on real timers.
const flushPromises = () => new Promise<void>((resolve) => window.originalSetTimeout(resolve, 0));

describe('UndoRedoStore', function () {
  let inbox: Folder;
  let archive: Folder;
  let queued: ChangeFolderTask[][];

  beforeEach(function () {
    inbox = new Folder({ id: 'inbox-id', role: 'inbox', path: 'INBOX' } as any);
    archive = new Folder({ id: 'archive-id', role: 'archive', path: 'Archive' } as any);
    spyOn(CategoryStore, 'byId').andCallFake((aid, id) => ({ [inbox.id]: inbox })[id]);

    queued = [];
    spyOn(Actions, 'queueTasks').andCallFake((tasks) => queued.push(tasks));

    UndoRedoStore._undo = [];
    UndoRedoStore._redo = [];
    UndoRedoStore._mostRecentBlock = null;
  });

  function queueMove() {
    const task = new ChangeFolderTask({
      threadIds: ['t1'],
      accountId: 'ac-1',
      folder: archive,
      sourceFolderIds: [inbox.id],
    } as any);
    UndoRedoStore._onQueue(task);
    return task;
  }

  it('builds the undo task from the version the engine streamed back', async function () {
    const task = queueMove();
    const undoPlacements = { 'm-1': [{ folderId: inbox.id, remoteUID: 12 }] };
    const fromEngine = new ChangeFolderTask({ ...task.toJSON(), status: 'remote', undoPlacements });
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve(fromEngine));

    UndoRedoStore.undo();
    await flushPromises();

    expect(queued.length).toBe(1);
    const [undoTask] = queued[0];
    expect(undoTask.restorePlacements).toEqual(undoPlacements);
    expect(undoTask.isUndo).toBe(true);
  });

  it('falls back to the queued version when the engine never reports the local phase', async function () {
    const task = queueMove();
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(new Promise(() => {}));

    UndoRedoStore.undo();
    advanceClock(2001);
    await flushPromises();

    expect(queued.length).toBe(1);
    const [undoTask] = queued[0];
    expect(undoTask.restorePlacements).toBeUndefined();
    expect(undoTask.folder.id).toBe(inbox.id);
    expect(undoTask.sourceFolderIds).toEqual([task.folder.id]);
  });

  it('does not register the undo task itself as undoable', async function () {
    const task = queueMove();
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve(task));
    (Actions.queueTasks as any).andCallFake((tasks) => {
      queued.push(tasks);
      UndoRedoStore._onQueue(tasks);
    });

    UndoRedoStore.undo();
    await flushPromises();

    expect(queued.length).toBe(1);
    expect(UndoRedoStore._undo.length).toBe(0);
    expect(UndoRedoStore._redo.length).toBe(1);
  });
});
