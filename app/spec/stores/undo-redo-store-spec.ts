import UndoRedoStore from '../../src/flux/stores/undo-redo-store';
import TaskQueue from '../../src/flux/stores/task-queue';
import CategoryStore from '../../src/flux/stores/category-store';
import * as Actions from '../../src/flux/actions';
import { ChangeFolderTask } from '../../src/flux/tasks/change-folder-task';
import { ChangeStarredTask } from '../../src/flux/tasks/change-starred-task';
import { SyncbackMetadataTask } from '../../src/flux/tasks/syncback-metadata-task';
import { Folder } from '../../src/flux/models/folder';
import { Message } from '../../src/flux/models/message';
import { Thread } from '../../src/flux/models/thread';

// Lets a chain of already-resolved promises settle without relying on real timers.
const flushPromises = () => new Promise<void>((resolve) => window.originalSetTimeout(resolve, 0));

describe('UndoRedoStore', function () {
  let inbox: Folder;
  let archive: Folder;
  let trash: Folder;
  let queued: any[][];

  beforeEach(function () {
    inbox = new Folder({ id: 'inbox-id', role: 'inbox', path: 'INBOX' } as any);
    archive = new Folder({ id: 'archive-id', role: 'archive', path: 'Archive' } as any);
    trash = new Folder({ id: 'trash-id', role: 'trash', path: 'Trash' } as any);
    spyOn(CategoryStore, 'byId').andCallFake((aid, id) => ({ [inbox.id]: inbox })[id]);

    queued = [];
    spyOn(Actions, 'queueTasks').andCallFake((tasks) => queued.push(tasks));
    spyOn(AppEnv, 'reportError');
    spyOn(console, 'warn');

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
    const undoPlacements = { 'm-1': [inbox.id] };
    const fromEngine = new ChangeFolderTask({ ...task.toJSON(), status: 'remote', undoPlacements });
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve(fromEngine));

    UndoRedoStore.undo();
    await flushPromises();

    expect(queued.length).toBe(1);
    const [undoTask] = queued[0];
    expect(undoTask.restorePlacements).toEqual(undoPlacements);
    expect(undoTask.sourceFolderIds).toEqual([archive.id]);
    expect(undoTask.isUndo).toBe(true);
  });

  it('falls back to the queued version when the engine never acknowledges the task', async function () {
    const task = queueMove();
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(new Promise(() => {}));
    spyOn(TaskQueue, 'allTasks').andReturn([]);

    UndoRedoStore.undo();
    advanceClock(1999);
    await flushPromises();
    expect(queued.length).toBe(0);

    advanceClock(2);
    await flushPromises();
    expect(queued.length).toBe(1);
    const [undoTask] = queued[0];
    expect(undoTask.restorePlacements).toBeUndefined();
    expect(undoTask.folder.id).toBe(inbox.id);
    expect(undoTask.sourceFolderIds).toEqual([task.folder.id]);
    expect(AppEnv.reportError).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('keeps waiting for a slow local phase once the engine has the task', async function () {
    const task = queueMove();
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(new Promise(() => {}));
    spyOn(TaskQueue, 'allTasks').andReturn([task]);

    UndoRedoStore.undo();
    advanceClock(9999);
    await flushPromises();
    expect(queued.length).toBe(0);

    advanceClock(2);
    await flushPromises();
    expect(queued.length).toBe(1);
    expect(queued[0][0].folder.id).toBe(inbox.id);
  });

  it('does not wait for an undo-only task, which the engine never sees', async function () {
    const draft = new Message({ id: 'd-1', accountId: 'ac-1', headerMessageId: 'h' } as any);
    const task = SyncbackMetadataTask.forSaving({
      pluginId: 'send-later',
      model: draft,
      value: { expiration: 1 },
      undoValue: { expiration: null, isUndoSend: true },
    });
    spyOn(TaskQueue, 'waitForPerformLocal');
    UndoRedoStore._onQueueUndoOnly(task);

    UndoRedoStore.undo();
    await flushPromises();

    expect(TaskQueue.waitForPerformLocal).not.toHaveBeenCalled();
    expect(queued.length).toBe(1);
    expect(queued[0][0].value).toEqual({ expiration: null, isUndoSend: true });
  });

  it('does not wait for tasks the engine does not annotate', async function () {
    const task = new ChangeStarredTask({ threadIds: ['t1'], accountId: 'ac-1', starred: true });
    spyOn(TaskQueue, 'waitForPerformLocal');
    UndoRedoStore._onQueue(task);

    UndoRedoStore.undo();
    await flushPromises();

    expect(TaskQueue.waitForPerformLocal).not.toHaveBeenCalled();
    expect(queued.length).toBe(1);
    expect(queued[0][0].starred).toBe(false);
  });

  it('reverses a multi-source move approximately when the engine never reports placements', async function () {
    const t1 = new Thread({ id: 't1', accountId: 'ac-1' } as any);
    t1.folders = [inbox];
    const t2 = new Thread({ id: 't2', accountId: 'ac-1' } as any);
    t2.folders = [trash];
    const task = new ChangeFolderTask({ threads: [t1, t2], folder: archive } as any);
    UndoRedoStore._onQueue(task);
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(new Promise(() => {}));
    spyOn(TaskQueue, 'allTasks').andReturn([]);

    UndoRedoStore.undo();
    advanceClock(2001);
    await flushPromises();

    expect(queued.length).toBe(1);
    expect(queued[0].map((t) => [t.folder.id, t.threadIds])).toEqual([
      [inbox.id, ['t1']],
      [trash.id, ['t2']],
    ]);
    expect(AppEnv.reportError).not.toHaveBeenCalled();
  });

  it('queues nothing and warns when no undo can be built', async function () {
    const task = new ChangeFolderTask({ threadIds: ['t1'], accountId: 'ac-1', folder: archive });
    UndoRedoStore._onQueue(task);
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(new Promise(() => {}));
    spyOn(TaskQueue, 'allTasks').andReturn([]);

    UndoRedoStore.undo();
    advanceClock(2001);
    await flushPromises();

    expect(queued.length).toBe(0);
    expect(AppEnv.reportError).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
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
