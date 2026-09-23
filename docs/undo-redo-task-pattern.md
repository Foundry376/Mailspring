# Undo/Redo Task Pattern in Mailspring

This document explains how to implement undoable tasks in Mailspring following the established patterns.

## Overview

Mailspring uses a task-based architecture where operations are represented as `Task` objects that get queued and executed by the sync engine. The `UndoRedoStore` automatically tracks tasks that can be undone and provides undo/redo functionality.

## How It Works

### Automatic Registration

When a task is queued via `Actions.queueTask()`, the `UndoRedoStore._onQueue()` listener checks if the task has `canBeUndone = true`. If so, it automatically registers the task for undo:

```typescript
// In UndoRedoStore
_onQueue = (taskOrTasks: Task | Task[]) => {
  const tasks = taskOrTasks instanceof Array ? taskOrTasks : [taskOrTasks];

  if (tasks.every(t => t.canBeUndone)) {
    const block = {
      tasks: tasks,
      description: tasks.map(t => t.description()).join(', '),
      undo: () => {
        Actions.queueTasks(tasks.map(t => t.createUndoTask()));
      },
      redo: () => {
        Actions.queueTasks(tasks.map(t => t.createIdenticalTask()));
      },
    };
    this._onQueueBlock(block);
  }
};
```

### Task Requirements

For a task to be undoable, it must:

1. Have `canBeUndone` return `true`
2. Implement `createUndoTask()` that returns a task to reverse the operation
3. Implement `description()` for the undo toast message

## Patterns

### Pattern 1: Simple State Toggle (ChangeStarredTask)

For operations that toggle a boolean state:

```typescript
export class ChangeStarredTask extends ChangeMailTask {
  starred: boolean;

  // Inherited from ChangeMailTask: canBeUndone defaults to true

  createUndoTask() {
    const task = super.createUndoTask();
    task.starred = !this.starred;  // Simply flip the flag
    return task;
  }
}
```

### Pattern 2: State Snapshot (SyncbackMetadataTask, SyncbackEventTask)

For operations where the "inverse" isn't a simple toggle, store the original state:

```typescript
interface EventSnapshot {
  ics: string;
  recurrenceStart: number;
  recurrenceEnd: number;
}

export class SyncbackEventTask extends Task {
  event: Event;
  undoData?: EventSnapshot;  // Original state before modification
  taskDescription?: string;

  static forUpdating({ event, undoData, description }) {
    return new SyncbackEventTask({
      event,
      calendarId: event.calendarId,
      accountId: event.accountId,
      undoData,
      taskDescription: description,
    });
  }

  get canBeUndone(): boolean {
    return !!this.undoData;  // Only undoable if we have original state
  }

  description(): string | null {
    return this.taskDescription || null;
  }

  createUndoTask(): SyncbackEventTask {
    // Restore the original state
    const restoredEvent = this.event.clone();
    restoredEvent.ics = this.undoData.ics;
    restoredEvent.recurrenceStart = this.undoData.recurrenceStart;
    restoredEvent.recurrenceEnd = this.undoData.recurrenceEnd;

    // The undo task stores current state so redo works
    const undoTaskUndoData: EventSnapshot = {
      ics: this.event.ics,
      recurrenceStart: this.event.recurrenceStart,
      recurrenceEnd: this.event.recurrenceEnd,
    };

    return new SyncbackEventTask({
      event: restoredEvent,
      calendarId: this.calendarId,
      accountId: this.accountId,
      undoData: undoTaskUndoData,
      taskDescription: localized('Undo %@', this.taskDescription),
    });
  }
}
```

### Pattern 3: Engine-Written Snapshot (ChangeFolderTask)

Sometimes the client cannot know the original state when it queues the task. A folder move
is the canonical case: a message may have copies in several folders, and only the sync
engine knows which copies it moved and from where. The engine writes that snapshot onto the
task's data during its local phase (the same mechanism `DestroyDraftTask` uses to receive
`stubIds`), and the task streams back to the client as a Task persist delta.

```typescript
export class ChangeFolderTask extends ChangeMailTask {
  folder: Folder;
  sourceFolderIds: string[];
  undoPlacements?: SourceFoldersByMessageId;     // written by the engine: where each moved copy came from
  restorePlacements?: SourceFoldersByMessageId;  // read by the engine on the undo task

  engineWritesUndoData = true;                   // tells UndoRedoStore to wait for the engine's version

  createUndoTasks() {
    const task = super.createUndoTask();         // isUndo = true
    task.folder = this._firstRestoreFolder();    // for the description only
    task.sourceFolderIds = [this.folder.id];     // the copies to send back are in the destination
    task.restorePlacements = this.undoPlacements;
    return [task];
  }
}
```

Three consequences for anyone using this pattern:

1. Set `engineWritesUndoData = true` on the task class. `UndoRedoStore.undo()` then resolves
   each such task through `TaskQueue.waitForPerformLocal()` before building the undo, so it
   runs against the **engine-updated** version. The wait is bounded (and abandoned early when
   the engine never echoes the task back), so an offline engine degrades to an approximate
   undo rather than none. Tasks without the flag, and tasks registered through
   `Actions.queueUndoOnlyTask`, are reversed immediately from the client's copy.
2. Implement `createUndoTasks()` when the approximate undo can need several tasks (one per
   original folder), and return `[]` when nothing can be reversed; `createUndoTask()` stays
   for callers that can only queue one.
3. `createIdenticalTask()` (used for redo) must strip the engine-written field so a re-run
   starts with a clean snapshot.

## Implementation Steps

### Step 1: Add Undo Data Attributes

Add attributes to store the original state:

```typescript
static attributes = {
  ...Task.attributes,

  undoData: Attributes.Obj({
    modelKey: 'undoData',
  }),
  taskDescription: Attributes.String({
    modelKey: 'taskDescription',
  }),
};
```

### Step 2: Capture State Before Modification

Before modifying the model, capture its current state:

```typescript
function modifyEvent(event: Event, newData: EventData) {
  // Capture BEFORE modifying
  const undoData = {
    ics: event.ics,
    recurrenceStart: event.recurrenceStart,
    recurrenceEnd: event.recurrenceEnd,
  };

  // Now modify
  event.ics = newData.ics;
  event.recurrenceStart = newData.start;
  event.recurrenceEnd = newData.end;

  // Queue with undo support
  Actions.queueTask(SyncbackEventTask.forUpdating({
    event,
    undoData,
    description: localized('Edit event'),
  }));
}
```

### Step 3: Implement canBeUndone and createUndoTask

```typescript
get canBeUndone(): boolean {
  return !!this.undoData;
}

createUndoTask(): YourTask {
  if (!this.undoData) {
    throw new Error('Cannot create undo task without undoData');
  }

  // Create task that restores original state
  // Store current state in the undo task's undoData for redo
}
```

## Anti-Patterns to Avoid

### Don't Use Custom UndoBlock

❌ **Wrong**: Manually registering undo callbacks

```typescript
// DON'T DO THIS
const undoBlock = {
  description: 'My action',
  undo: async () => { /* custom undo logic */ },
  redo: async () => { /* custom redo logic */ },
};
UndoRedoStore.queueUndoBlock(undoBlock);
```

✅ **Correct**: Use task-based undo

```typescript
// DO THIS
Actions.queueTask(MyTask.forUpdating({
  model,
  undoData: captureCurrentState(model),
  description: 'My action',
}));
```

### Don't Forget to Capture State First

❌ **Wrong**: Capturing after modification

```typescript
event.ics = newIcs;  // Modified first!
const undoData = { ics: event.ics };  // Too late - this is the new state
```

✅ **Correct**: Capture before modification

```typescript
const undoData = { ics: event.ics };  // Capture original
event.ics = newIcs;  // Now modify
```

## Testing Undo

1. Perform the action
2. Press Cmd/Ctrl+Z to undo
3. Verify the model is restored to original state
4. Press Cmd/Ctrl+Shift+Z to redo
5. Verify the model has the modified state again

## Related Files

- `app/src/flux/stores/undo-redo-store.ts` - UndoRedoStore implementation
- `app/src/flux/tasks/task.ts` - Base Task class
- `app/src/flux/tasks/change-mail-task.ts` - Base class for mail changes
- `app/src/flux/tasks/syncback-metadata-task.ts` - Example of snapshot pattern
- `app/src/flux/tasks/syncback-event-task.ts` - Calendar event undo implementation
- `app/src/flux/tasks/change-folder-task.ts` - Engine-written snapshot (`undoPlacements`)
