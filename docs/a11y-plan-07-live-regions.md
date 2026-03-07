# Accessibility Plan 07: ARIA Live Regions for Dynamic Content

## Executive Summary

Mailspring has zero `aria-live` regions anywhere in its UI. This plan introduces a singleton `Announcer` service with two always-mounted DOM nodes, wires it into the existing store/action infrastructure, and covers every user-facing dynamic event that a screen reader user would need to hear. The design avoids React lifecycle issues by keeping the DOM nodes permanently in the document outside the React tree.

---

## Codebase Findings

### App Root Rendering

`AppEnv.initializeReactRoot()` in `app/src/app-env.ts` (lines 780–800) is the single place where React mounts. It creates `<mailspring-workspace>`, renders `SheetContainer`, and appends to `document.body`. Live region nodes must be appended to `document.body` here, before any React render, so they are always present.

### No Existing Live Regions

`aria-live` only appears in the bundled PDF.js viewer (an unrelated iframe). No `role="alert"`, `role="status"`, or `.sr-only` CSS class exists in the app's own code.

### Task `description()` Methods Already Exist

Every `ChangeMailTask` subclass already implements `description()` with fully localized strings:
- `ChangeFolderTask.description()` → "Moved to Inbox", "Moved 3 threads to Archive"
- `ChangeLabelsTask.description()` → "Archived", "Trashed", "Marked as Spam"
- `ChangeStarredTask.description()` → "Starred", "Unstarred"
- `ChangeUnreadTask.description()` → "Marked as read", "Marked as unread"

The `UndoRedoStore` assembles these into `block.description` for the visual undo toast. Announcements for task completion reuse exactly this text, maintaining consistency between visual and audio feedback.

### Key Integration Points

| Event | Source |
|---|---|
| Draft sent successfully | `DraftStore._onSendDraftSuccess` |
| Draft send failed | `DraftStore._onSendDraftFailed` |
| Thread archived/trashed/moved/starred/unread | `UndoRedoStore._onQueueBlock` (`block.description`) |
| Undo/redo performed | `UndoRedoStore.undo()` / `UndoRedoStore.redo()` |
| New mail arrived | `unread-notifications/lib/main.ts` `Notifier._notifyOne` |
| Account sync error | `AccountErrorNotification` (from `AccountStore`) |
| App offline/online | `OnlineStatusStore.onSyncProcessStateReceived` |
| Search completed | `SearchStore._onSearchCompleted` |
| Snooze set | `SnoozeStore._onSnoozeThreads` |
| Snooze reminder fires | `SnoozeStore._onUnsnoozeThreads` |

---

## 1. Design: The `Announcer` Service

**New file:** `app/src/services/a11y-announcer.ts`

A singleton module (not a React component, not a Store) that owns two DOM nodes and exposes `announce()`. Keeping it outside React avoids lifecycle pitfalls and works across all Electron windows.

```typescript
// app/src/services/a11y-announcer.ts

let politeEl: HTMLElement | null = null;
let assertiveEl: HTMLElement | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Call once at app startup from AppEnv.initializeReactRoot().
 * Must be called before any React render.
 */
export function initializeLiveRegions(): void {
  politeEl = document.createElement('div');
  politeEl.setAttribute('aria-live', 'polite');
  politeEl.setAttribute('aria-atomic', 'true');
  politeEl.setAttribute('aria-relevant', 'additions text');
  politeEl.className = 'sr-only';
  politeEl.id = 'a11y-announcer-polite';
  document.body.appendChild(politeEl);

  assertiveEl = document.createElement('div');
  assertiveEl.setAttribute('aria-live', 'assertive');
  assertiveEl.setAttribute('aria-atomic', 'true');
  assertiveEl.setAttribute('aria-relevant', 'additions text');
  assertiveEl.className = 'sr-only';
  assertiveEl.id = 'a11y-announcer-assertive';
  document.body.appendChild(assertiveEl);
}

/**
 * Announce a message to screen readers.
 *
 * @param message - The localized string to announce.
 * @param level   - 'polite' for non-urgent updates, 'assertive' for errors.
 */
export function announce(message: string, level: 'polite' | 'assertive' = 'polite'): void {
  const el = level === 'assertive' ? assertiveEl : politeEl;
  if (!el) return; // Not initialized (e.g., in tests); silently ignore

  // Cancel pending clear so new announcement isn't immediately wiped
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  // Clear first (synchronous) so re-announcing the same string triggers a new mutation
  el.textContent = '';

  // Set content after one animation frame: two distinct DOM mutations
  // ensures screen readers detect the change even for repeated messages
  requestAnimationFrame(() => {
    if (el) {
      el.textContent = message;
    }

    // Clear after 5 seconds to prevent stale text in AT item lists
    clearTimer = setTimeout(() => {
      if (el) el.textContent = '';
      clearTimer = null;
    }, 5000);
  });
}
```

**Why a singleton module (not React Context or a Store):**
- React Context would require wrapping `SheetContainer`, which doesn't cover composer pop-out windows or other secondary Electron windows
- A Store would trigger re-renders with no benefit — this is a DOM side-effect, not state
- Matches how `SoundRegistry` already works for the "play a sound on new mail" use case

---

## 2. Mounting the Live Region Nodes

**File to modify:** `app/src/app-env.ts`, method `initializeReactRoot()`

```typescript
initializeReactRoot() {
  // Initialize ARIA live regions BEFORE React renders.
  // They must always be present in the DOM.
  const { initializeLiveRegions } = require('./services/a11y-announcer');
  initializeLiveRegions();

  const item = document.createElement('mailspring-workspace');
  // ... rest unchanged ...
}
```

---

## 3. The `.sr-only` CSS Class

**File to modify:** `app/static/style/utilities.less`

```less
// Visually hidden but accessible to screen readers.
// NEVER use display:none or visibility:hidden — those hide from AT too.
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

## 4. Export from `mailspring-exports`

**File to modify:** `app/src/global/mailspring-exports.js`

```javascript
lazyLoadWithGetter('announce', () => require('../services/a11y-announcer').announce);
```

Allows any store or plugin to call `announce()` without a long relative import path, consistent with how `localized`, `Actions`, and stores are accessed.

---

## 5. Complete Integration Points

### 5.1 Draft Send Success — `polite`

**File:** `app/src/flux/stores/draft-store.ts`, method `_onSendDraftSuccess`

```typescript
_onSendDraftSuccess = ({ headerMessageId }) => {
  delete this._draftsSending[headerMessageId];
  this.trigger({ headerMessageId });
  announce(localized('Message sent'));  // ADD
};
```

### 5.2 Draft Send Failure — `assertive`

**File:** `app/src/flux/stores/draft-store.ts`, method `_onSendDraftFailed`

```typescript
_onSendDraftFailed = ({ headerMessageId, errorMessage, ... }) => {
  this._draftsSending[headerMessageId] = false;
  this.trigger({ headerMessageId });
  announce(localized('Message failed to send: %@', errorMessage), 'assertive');  // ADD
  // ... rest unchanged ...
};
```

### 5.3 Thread Actions via UndoRedoStore — `polite`

**File:** `app/src/flux/stores/undo-redo-store.ts`, method `_onQueueBlock`

```typescript
_onQueueBlock = (block: UndoBlock): void => {
  this._redo = [];
  this._mostRecentBlock = block;
  this._undo.push(block);
  this.trigger();
  if (block.description) {
    announce(block.description);  // ADD — covers archive, trash, star, unread, move, spam
  }
};
```

Single hook covers: archive, trash, move-to-folder, star/unstar, mark-as-read/unread, mark-as-spam, and all future undoable tasks.

### 5.4 Undo / Redo — `polite`

**File:** `app/src/flux/stores/undo-redo-store.ts`, methods `undo()` and `redo()`

```typescript
undo = (): void => {
  const block = this._undo.pop();
  if (!block) return;
  block.undo();
  this._redo.push(block);
  this.trigger();
  announce(localized('Undone: %@', block.description || localized('last action')));  // ADD
};

redo = (): void => {
  const block = this._redo.pop();
  if (!block) return;
  block.redo ? block.redo() : block.do();
  this._undo.push(block);
  this.trigger();
  announce(localized('Redone: %@', block.description || localized('last action')));  // ADD
};
```

### 5.5 New Mail Received — `polite`

**File:** `app/internal_packages/unread-notifications/lib/main.ts`, `Notifier._notifyOne`

```typescript
async _notifyOne({ message, thread }) {
  const from = message.from[0] ? message.from[0].displayName() : localized('Unknown');
  // ... existing notification logic unchanged ...
  const subject = message.subject || message.snippet || '';
  announce(localized('New message from %@: %@', from, subject));  // ADD
}
```

For bulk mail (`_notifyAll`):
```typescript
async _notifyAll() {
  const count = this.unnotifiedQueue.length;
  // ... existing logic ...
  announce(localized('%@ new messages', count));  // ADD
}
```

### 5.6 Account Sync Error — `assertive`

**File:** `app/internal_packages/notifications/lib/items/account-error-notif.tsx`

Add listener in `componentDidMount`:
```typescript
componentDidMount() {
  this.unlisten = AccountStore.listen(() => {
    const erroredAccounts = AccountStore.accounts().filter(a => a.hasSyncStateError());
    const prevErrored = this._prevErroredCount || 0;
    this._prevErroredCount = erroredAccounts.length;

    if (erroredAccounts.length > 0 && prevErrored === 0) {
      const msg = erroredAccounts.length > 1
        ? localized('Several accounts are having sync issues')
        : erroredAccounts[0].syncState === Account.SYNC_STATE_AUTH_FAILED
          ? localized('Cannot authenticate with %@', erroredAccounts[0].emailAddress)
          : localized('Sync error for %@', erroredAccounts[0].emailAddress);
      announce(msg, 'assertive');  // ADD
    }
    this.setState({ accounts: AccountStore.accounts() });
  });
}
```

### 5.7 App Goes Offline / Back Online — `polite`

**File:** `app/src/flux/stores/online-status-store.ts`

```typescript
onSyncProcessStateReceived = ({ accountId, connectionError }) => {
  const prevIsOnline = this.isOnline();
  // ... existing logic ...
  if (prevIsOnline !== this.isOnline()) {
    this.trigger();
    if (!this.isOnline()) {
      announce(localized('One or more accounts are offline. Retrying...'));  // ADD
    } else {
      announce(localized('Back online'));  // ADD
    }
  }
};
```

### 5.8 Search Results Updated — `polite`

**File:** `app/internal_packages/thread-search/lib/search-store.ts`

```typescript
_onSearchCompleted = () => {
  this._isSearching = false;
  this.trigger();
  if (this._searchQuery) {
    announce(localized('Search complete'));  // ADD
  }
};
```

### 5.9 Snooze Set — `polite`

**File:** `app/internal_packages/thread-snooze/lib/snooze-store.ts`, `_onSnoozeThreads`

```typescript
// After Actions.queueTasks(...):
const msg = snoozedUntilMessage(snoozeDate); // already localized
announce(localized('Snoozed: %@', msg));  // ADD
```

### 5.10 Snooze Reminder Fires — `polite`

**File:** `app/internal_packages/thread-snooze/lib/snooze-store.ts`, `_onUnsnoozeThreads`

```typescript
const count = threads.length;
announce(count > 1
  ? localized('%@ snoozed threads have returned to your inbox', count)
  : localized('A snoozed thread has returned to your inbox')
);  // ADD
```

---

## 6. Summary Table

| # | Trigger | Announcement Text | Level |
|---|---|---|---|
| 1 | `DraftStore._onSendDraftSuccess` | `'Message sent'` | polite |
| 2 | `DraftStore._onSendDraftFailed` | `'Message failed to send: {error}'` | assertive |
| 3 | `UndoRedoStore._onQueueBlock` | `block.description` (e.g. "Archived") | polite |
| 4 | `UndoRedoStore.undo()` | `'Undone: {description}'` | polite |
| 5 | `UndoRedoStore.redo()` | `'Redone: {description}'` | polite |
| 6 | `Notifier._notifyOne` | `'New message from {sender}: {subject}'` | polite |
| 7 | `Notifier._notifyAll` | `'{N} new messages'` | polite |
| 8 | `AccountErrorNotification` listener | `'Sync error for {email}'` or `'Cannot authenticate with {email}'` | assertive |
| 9 | `OnlineStatusStore` | `'One or more accounts are offline. Retrying...'` / `'Back online'` | polite |
| 10 | `SearchStore._onSearchCompleted` | `'Search complete'` | polite |
| 11 | `SnoozeStore._onSnoozeThreads` | `'Snoozed: {until message}'` | polite |
| 12 | `SnoozeStore._onUnsnoozeThreads` | `'A snoozed thread has returned to your inbox'` | polite |

---

## 7. The "Clear After Delay" Pattern Explained

The `announce()` implementation uses a two-step DOM mutation:

1. `el.textContent = ''` (synchronous)
2. `el.textContent = message` (inside `requestAnimationFrame`)

Screen readers observe live region mutations. Setting empty then setting again causes two distinct mutation events, guaranteeing re-announcement even when the same string repeats (e.g., user archives multiple threads in sequence — each "Archived" announcement fires).

After 5 seconds, content is cleared via `setTimeout`. Prevents stale text from appearing in AT features like VoiceOver's Item Chooser or NVDA's Browse Mode.

The `clearTimer` is cancelled before each new announcement, so rapid successive announcements don't prematurely clear the latest message.

---

## 8. Testing Strategy

**Manual testing with screen readers:**

1. NVDA + Firefox (Windows) — test all 12 integration points
2. JAWS + Chrome (Windows)
3. VoiceOver + Safari (macOS)
4. Orca + Chrome (Linux)

**Verification per integration point:**
1. Enable screen reader
2. Trigger action
3. Verify announcement without disrupting reading (polite) or interrupting immediately (assertive)
4. Immediately repeat same action — verify re-announcement works (tests clear-then-set pattern)

**Automated tests** (`app/spec/services/a11y-announcer-spec.ts`):

```typescript
describe('a11y-announcer', () => {
  it('inserts two live region elements in document.body', () => {
    initializeLiveRegions();
    expect(document.getElementById('a11y-announcer-polite')).not.toBeNull();
    expect(document.getElementById('a11y-announcer-assertive')).not.toBeNull();
  });

  it('sets textContent on the polite region', done => {
    announce('Test message');
    requestAnimationFrame(() => {
      expect(document.getElementById('a11y-announcer-polite').textContent).toBe('Test message');
      done();
    });
  });

  it('re-announces identical strings by clearing and re-setting', done => {
    announce('Archived');
    requestAnimationFrame(() => {
      announce('Archived');
      // Synchronously empty after second announce()
      expect(document.getElementById('a11y-announcer-polite').textContent).toBe('');
      requestAnimationFrame(() => {
        expect(document.getElementById('a11y-announcer-polite').textContent).toBe('Archived');
        done();
      });
    });
  });
});
```

---

## 9. Implementation Sequence

1. Create `app/src/services/a11y-announcer.ts` — no dependencies, testable in isolation
2. Add `.sr-only` to `app/static/style/utilities.less` — pure CSS, no JS risk
3. Modify `app/src/app-env.ts` `initializeReactRoot()` to call `initializeLiveRegions()` — foundational
4. Add `announce` export to `app/src/global/mailspring-exports.js`
5. Wire `DraftStore._onSendDraftSuccess` and `_onSendDraftFailed` — highest user impact
6. Wire `UndoRedoStore._onQueueBlock`, `undo()`, `redo()` — covers all thread actions in one hook
7. Wire `unread-notifications` `Notifier._notifyOne` / `_notifyAll`
8. Wire `OnlineStatusStore`
9. Wire `SearchStore._onSearchCompleted`
10. Wire `AccountErrorNotification`
11. Wire `SnoozeStore`

---

## Critical Files

- `app/src/app-env.ts` — `initializeReactRoot()` where `initializeLiveRegions()` must be called to permanently mount DOM nodes at startup
- `app/src/flux/stores/undo-redo-store.ts` — Single hook covering all thread actions (archive, trash, star, unread, move) via `_onQueueBlock`, `undo()`, `redo()` — highest leverage integration
- `app/src/flux/stores/draft-store.ts` — Send success/failure; the send flow is the most critical user action for screen reader feedback
- `app/static/style/utilities.less` — Needs `.sr-only` CSS class definition applied globally
- `app/internal_packages/unread-notifications/lib/main.ts` — New-mail announcements; `Notifier` class already performs the same logic the announcer should piggyback on
