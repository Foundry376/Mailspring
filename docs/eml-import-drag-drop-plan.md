# EML Import via Drag-and-Drop: Implementation Plan

## Overview

Allow users to drag `.eml` files from their desktop/file manager onto a folder
in the Mailspring sidebar to upload those messages to the remote mail server via
IMAP APPEND. This is the natural complement to the EML export feature.

## Motivation

Users have requested a way to import email messages into Mailspring without
needing an external client like Thunderbird. Since Mailspring already supports
dragging threads between folders in the sidebar, extending the drop handler to
accept native `.eml` files is a natural fit.

## Architecture

The data flow is the mirror image of `GetMessageRFC2822Task` (export):

```
Export:  IMAP server → sync engine → .eml file on disk
Import:  .eml file on disk → sync engine → IMAP APPEND → server
```

Both use a `filepath` string in the task JSON. The sync engine reads the file
locally. No binary data flows through the JSON task queue.

```
┌──────────────┐   drop event    ┌──────────────┐   queue-task   ┌────────────────┐
│  Desktop /   │ ──────────────▶ │  Sidebar      │ ────────────▶ │  MailsyncBridge │
│  File Manager│   .eml files    │  Drop Handler │  JSON stdin   │  → Sync Engine  │
└──────────────┘                 └──────────────┘               └───────┬────────┘
                                                                        │
                                                                  IMAP APPEND
                                                                        │
                                                                        ▼
                                                                ┌────────────────┐
                                                                │  IMAP Server   │
                                                                └───────┬────────┘
                                                                        │
                                                                  sync + deltas
                                                                        │
                                                                        ▼
                                                                ┌────────────────┐
                                                                │  UI updates    │
                                                                │  automatically │
                                                                └────────────────┘
```

## Frontend Changes

### 1. New Task: `AppendMessageTask`

**File:** `app/src/flux/tasks/append-message-task.ts`

```typescript
export class AppendMessageTask extends Task {
  static attributes = {
    ...Task.attributes,
    filepath: Attributes.String({ modelKey: 'filepath' }),
    folderId: Attributes.String({ modelKey: 'folderId' }),
    folderPath: Attributes.String({ modelKey: 'folderPath' }),
  };

  filepath: string;
  folderId: string;
  folderPath: string;

  label() {
    return 'Importing message';
  }
}
```

Register in `mailspring-exports.js` and `.d.ts`.

### 2. Extend Sidebar Drop Handlers

**File:** `app/internal_packages/account-sidebar/lib/sidebar-item.ts`

Modify `shouldAcceptDrop` to also accept native file drops:

```typescript
shouldAcceptDrop(item, event) {
  // Existing thread-move logic
  if (event.dataTransfer.types.includes('mailspring-threads-data')) {
    // ... existing checks ...
  }

  // New: accept .eml file drops
  if (event.dataTransfer.types.includes('Files')) {
    const category = item.perspective.category();
    if (!category) return false;
    if (LOCKED_IMPORT_ROLES.has(category.role)) return false;
    return true;
  }

  return false;
},
```

Modify `onDrop` to handle file drops:

```typescript
onDrop(item, event) {
  // Existing thread-move path
  const jsonString = event.dataTransfer.getData('mailspring-threads-data');
  if (jsonString) {
    // ... existing logic ...
    return;
  }

  // New: .eml file import path
  const { webUtils } = require('electron');
  const category = item.perspective.category();
  if (!category) return;

  for (const file of Array.from(event.dataTransfer.files)) {
    if (!file.name.endsWith('.eml')) continue;
    const filePath = webUtils.getPathForFile(file);
    Actions.queueTask(new AppendMessageTask({
      accountId: category.accountId,
      filepath: filePath,
      folderId: category.id,
      folderPath: category.path,
    }));
  }
},
```

### 3. Folder Eligibility

Block drops on virtual/system perspectives that don't map to real IMAP folders:

- **Blocked:** Starred, Unread, Drafts (virtual or local-only)
- **Allowed:** Inbox, Sent, Archive, Trash, Spam, user-created folders

The `category.role` check handles this (same pattern as folder export).

## Backend Changes (Mailspring-Sync)

### 1. New Task Handler: `AppendMessageTask`

In the sync engine's task processor, add a handler that:

1. Reads the `.eml` file from `filepath`
2. Validates it starts with RFC2822 headers
3. Resolves the target folder from `folderPath`
4. Executes `IMAP APPEND <folder-path> (\Seen) <date> {<size>}\r\n<message-data>`
5. Reports success/error via task status delta

### 2. Post-APPEND Sync

After a successful APPEND, the sync engine should:

- Trigger a folder sync to pick up the new message UID
- Emit database deltas so the UI shows the imported message immediately
- Alternatively, parse the APPENDUID response (RFC 4315) if the server supports
  UIDPLUS to directly create the local message record

### 3. Error Handling

| Error | Handling |
|-------|----------|
| File not found | Task error with user-facing message |
| Invalid .eml format | Task error: "File is not a valid email message" |
| Server rejects (size limit) | Task error with server message |
| Locked/read-only folder | Prevent in frontend; task error as fallback |
| Network failure | Standard task retry logic |

## Complexity Estimate

| Component | Effort | Notes |
|-----------|--------|-------|
| `AppendMessageTask` class | Low | ~20 lines, mirrors existing tasks |
| Sidebar drop handler changes | Low | Extend existing handlers |
| Folder eligibility checks | Low | Reuse `category.role` pattern |
| Sync engine IMAP APPEND | Medium | Core work; needs MIME validation |
| Error handling & edge cases | Medium | Server variations, size limits |
| Integration testing | Medium | Multiple account types & servers |

## Existing Infrastructure Leveraged

- **Task queue + MailsyncBridge:** Routes tasks to correct account worker
- **Sidebar drop system:** `onDrop`/`shouldAcceptDrop` already wired up
- **Electron `webUtils.getPathForFile()`:** Composer already uses this for file drops
- **Filepath-in-task pattern:** `GetMessageRFC2822Task` proves this works
- **Automatic UI updates:** Normal folder sync picks up new messages via deltas

## Open Questions

1. **Should we support dragging multiple .eml files at once?** The implementation
   above handles it naturally (loop over `event.dataTransfer.files`), but we may
   want a progress indicator for large batches.

2. **Should we support drag-to-label (Gmail)?** For Gmail accounts using labels
   instead of folders, APPEND would place the message in the target label. The
   `ChangeLabelsTask` pattern could inform how we handle this.

3. **Should we validate .eml files before sending to the backend?** A quick
   header check on the frontend could catch obviously invalid files early,
   but full validation belongs in the sync engine.
