# Mailspring Playwright E2E Testing Guide

This guide captures patterns, pitfalls, and debugging strategies for writing Playwright E2E tests against the Mailspring Electron app. It is intended for both human developers and AI agents.

## Testing Philosophy

**Write interaction tests, not visibility tests.** The goal of these tests is to catch regressions when upgrading React, refactoring components, or changing keyboard shortcut handling. A test that only checks whether a button is rendered provides almost no value — if the button renders but doesn't work, the test still passes.

Every test should perform a meaningful interaction (click, keyboard shortcut, type text, drag) and verify the *result* of that interaction. If a test clicks a button and the button opens a composer, verify the composer appeared — you don't need a separate test that just checks the button is visible.

**Good test — tests the interaction end-to-end:**
```typescript
test('c opens new message composer', async () => {
  await mainWindow.keyboard.press('c');
  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
  await expect(composerPage!.locator('.composer-participant-field').first()).toBeVisible();
});
```

**Bad test — only checks visibility:**
```typescript
test('compose button is present in toolbar', async () => {
  await expect(mainWindow.locator('.item-compose')).toBeVisible();
});
```

The bad test passes even if the button's click handler is completely broken. The good test fails if the keyboard shortcut handler, the draft creation flow, or the composer rendering breaks.

**Existing tests to be aware of:** `app-launch.spec.ts` is entirely structural/visibility checks. These tests have value as a basic smoke test that the app launched and rendered, but they should not be used as a pattern for new tests. The two standalone visibility tests in `thread-list.spec.ts` (`thread list shows multiple threads` and `message list shows reply area at bottom`) similarly just check presence without interaction.

When writing new tests, combine the visibility assertion with the interaction:

```typescript
// Instead of two separate tests:
//   test('reply area is visible')        ← visibility only
//   test('clicking reply area opens composer')  ← interaction

// Write one test:
test('clicking footer reply area opens inline composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.locator('.footer-reply-area-wrap').click();
  const composer = mainWindow.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });
  await mainWindow.keyboard.press('Meta+Escape');
});
```

## Running Tests

```bash
# Run all tests
npx playwright test --config playwright/playwright.config.ts

# Run a single test file
npx playwright test --config playwright/playwright.config.ts tests/compose.spec.ts

# Run a single test by name (grep)
npx playwright test --config playwright/playwright.config.ts -g "c opens new message composer"

# Run with verbose output (see console logs from renderer)
npx playwright test --config playwright/playwright.config.ts --reporter=list
```

Tests run serially (`workers: 1`) because Electron enforces a single-instance lock. Each spec file launches its own app instance in `beforeAll` and tears it down in `afterAll`.

**Avoid running the entire test suite** when verifying new tests. It's time-consuming and tests across different spec files are unlikely to break each other. Just run the specific spec file you're working on — if those tests pass, you're good to go:

```bash
# Run only the file you changed — don't run the entire suite
npx playwright test --config playwright/playwright.config.ts tests/my-new-tests.spec.ts
```

## Architecture Overview

```
┌──────────────────┐     Playwright controls     ┌──────────────────────┐
│   Test Process   │ ──────────────────────────── │  Electron App        │
│  (Node + PW)     │                              │                      │
│                  │  electronApp.evaluate()       │  Main Process        │
│                  │ ──────────────────────────── │  (dialog mocks, etc) │
│                  │                              │                      │
│                  │  mainWindow.locator()         │  Renderer (BWindow)  │
│                  │  mainWindow.keyboard.press()  │  (React UI)          │
│                  │ ──────────────────────────── │                      │
│                  │                              │  Popout Windows       │
│                  │  composerPage.locator()       │  (composer, thread)  │
│                  │ ──────────────────────────── │                      │
└──────────────────┘                              └──────────────────────┘
```

Key points:
- The `PLAYWRIGHT=1` env var is set at launch. App code checks `process.env.PLAYWRIGHT` to enable test-specific behavior.
- **Mailsync (the C++ sync engine) is not running.** The app launches with a golden SQLite database snapshot, but no sync process is writing to it. All writes happen via Tasks, which are intercepted at the Flux action layer.
- The test config directory is a temp copy of a fixture directory, isolated per test run, and cleaned up in `afterAll`.

## Key Concepts

### Pages and Windows

Mailspring is a multi-window Electron app. The main window renders the thread list and message view. Popout windows are opened for new-message composition and thread popouts.

```typescript
// mainWindow is the primary renderer — thread list, message view, sidebar
const mainWindow: Page = ...; // from launchApp()

// Composer windows: use findComposer() which polls all windows
const composerPage = await findComposer(electronApp);
```

**Important:** For inline reply composers, `findComposer()` returns the **main window page** (not a separate window), because the composer renders inside the message list. For popout composers (`c` key, compose button), it returns the popout window's page.

### Keyboard Input Target

Always send keyboard input to the correct page. For inline composers, keyboard input must go to `composerPage` (which happens to be `mainWindow`), but for popout composers it must go to the popout window page:

```typescript
// CORRECT: send keystrokes to the page that has the composer
await composerPage!.keyboard.press('Meta+Escape');

// WRONG: sending to mainWindow when composer is in a popout
await mainWindow.keyboard.press('Meta+Escape'); // won't reach the composer
```

### Task Verification (Without Mailsync)

Since mailsync isn't running, tasks queued via `Actions.queueTask()` are never executed. To verify that UI actions create the correct tasks, use the task capture system:

```typescript
// In beforeAll — install the capture listener
await installTaskCapture(electronApp);

// Before each action — clear previous captures
await clearCapturedTasks(electronApp);

// After the action — wait for the expected task
const task = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeStarredTask');
expect(task).not.toBeNull();
expect(task.threadIds.length).toBeGreaterThan(0);
```

The capture system works by injecting a listener on `Actions.queueTask` in the renderer via `webContents.executeJavaScript()`, storing task data in a hidden DOM element that Playwright can read via locators.

### Executing JavaScript in the Renderer

Mailspring restricts `window.eval()` for security. To run arbitrary JS in the renderer, use the `executeInRenderer` pattern (defined in helpers.ts):

```typescript
await electronApp.evaluate(async ({ BrowserWindow }, js) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.getURL().includes('windowType%22%3A%22default')) {
      return await win.webContents.executeJavaScript(js);
    }
  }
  throw new Error('Main window not found');
}, code);
```

This bypasses the eval restriction by going through the main process's `webContents.executeJavaScript()`.

## Common Pitfalls

### 1. Inline Composers Create Multiple `.composer-inner-wrap` Elements

The message view always renders a "footer reply area" at the bottom, which contains a `.composer-inner-wrap`. When you open an inline reply composer, a second `.composer-inner-wrap` appears. Use `.last()` to target the actual composer:

```typescript
// WRONG: strict mode violation — matches footer AND inline composer
const composer = composerPage!.locator('.composer-inner-wrap');

// CORRECT: the inline composer is the last one
const composer = composerPage!.locator('.composer-inner-wrap').last();
```

Similarly, composer participant fields (To, From) create multiple `.composer-participant-field` elements:

```typescript
// Use .first() when you just want to verify one is visible
await expect(composer.locator('.composer-participant-field').first()).toBeVisible();
```

### 2. Synthetic Draft Lifecycle (PLAYWRIGHT Mode)

Without mailsync, drafts are never persisted to the database and no `DatabaseChangeRecord` deltas are emitted. The app has special PLAYWRIGHT-mode code in `DraftStore` that:

1. **Synthetic persist:** After `_finalizeAndPersistNewMessage`, emits a synthetic `DatabaseChangeRecord` with `type: 'persist'` so `MessageStore` picks up the draft and renders the inline composer.
2. **Synthetic unpersist:** In `_onDestroyDraft`, emits a synthetic `DatabaseChangeRecord` with `type: 'unpersist'` so the draft is removed from items.
3. **Draft ID assignment:** Assigns `draft.id = 'draft-' + headerMessageId` since mailsync normally provides the ID.

Additionally, `DraftFactory.candidateDraftForUpdating()` returns `null` in PLAYWRIGHT mode to always create fresh drafts, avoiding stale-draft reuse from async race conditions.

**Key implication for tests:** Inline reply composers work without mailsync. Popout composers also work because `waitForPerformLocal` resolves immediately in PLAYWRIGHT mode and the draft JSON is passed to the composer window directly.

### 3. Folder Safety in MessageStore

Synthetic drafts don't have a `folder` property. `MessageStore.items()` filters by folder role, so the filter is null-safe:

```typescript
const inHidden = item.folder
  ? FolderNamesHiddenByDefault.includes(item.folder.role)
  : false;
```

If you add new synthetic models that pass through MessageStore, ensure they handle missing properties gracefully.

### 4. Draft Cleanup Between Tests

After each test that creates an inline composer, you must clean up:

```typescript
test.afterEach(async () => {
  await closeComposerWindows(electronApp); // closes popout windows only
  // Wait for async operations (_fetchFromCache, session teardown) to settle
  await mainWindow.waitForTimeout(1500);
});
```

The 1500ms wait is important. Without it, `_fetchFromCache` from draft destruction can race with the next test's draft creation.

For tests that dismiss the composer inline (via `Meta+Escape`), the `Cmd+Escape` triggers `composer:delete-empty-draft` which destroys pristine drafts. Then `componentWillUnmount` in `InflatesDraftClientId` may call `destroyDraft` a second time. This is handled correctly by the session guard on synthetic unpersist.

### 5. Thread Focus and `_fetchFromCache` Races

`openThread()` clicks a thread, which triggers `_onApplyFocusChange` → `_fetchFromCache()` (async DB query). If the same thread is already focused, `_onApplyFocusChange` returns early with no re-fetch.

This matters because:
- If you call `openThread(mainWindow, 0)` twice in sequence, the second call is a no-op for MessageStore (the thread is already focused).
- `_fetchFromCache` is async. In theory, a stale in-flight query could overwrite `_items` after a synthetic persist adds a draft. In practice, the DB query (better-sqlite3) resolves very quickly, but the 1500ms afterEach wait helps ensure settlement.

### 6. Native Dialogs and DevTools

Mailspring may show native dialogs (keychain errors, sync errors) that block tests. The `launchApp()` helper mocks these:

```typescript
await electronApp.evaluate(({ dialog }) => {
  dialog.showMessageBoxSync = () => 0;
  dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
  dialog.showErrorBox = () => {};
});
mainWindow.on('dialog', dialog => dialog.dismiss().catch(() => {}));
```

In dev mode, `AppEnv.reportError` opens DevTools, which can steal focus and break tests. The dialog mocking prevents the error dialogs that trigger this.

### 7. Split Mode vs List Mode Selection

The app runs in split mode (`workspace: { mode: 'split' }`) by default in tests. Selection behavior differs significantly between modes:

- **Split mode:** The `x` key is a no-op for selection. Use `Cmd+Click` to add/remove individual items, `Shift+Click` for range selection, or `* a` / `* n` for select all / deselect all. A single selected item auto-converts to "focused" — you need at least 2 selected items to maintain selection state.
- **List mode:** The `x` key toggles selection on the keyboard cursor item. Checkmark columns are visible.

The `* a` and `* n` chord shortcuts (Mousetrap sequences) work in both modes. Always clean up selection state between tests with `* n` to avoid interference.

```typescript
// Split mode: Cmd+Click to multi-select
await focusThread(mainWindow, 0);
await threads(mainWindow).nth(1).click({ modifiers: ['Meta'] });
// Both threads now have class "selected"

// Clean up after test
await mainWindow.keyboard.press('*');
await mainWindow.keyboard.press('n');
```

### 8. Context Menus Are Native OS Menus

Electron context menus (via `@electron/remote`) are native OS menus that Playwright cannot interact with. The `installMenuIntercept()` helper intercepts the `contextmenu` DOM event and walks the React fiber tree to find the component instance, then calls its methods directly:

```typescript
await installMenuIntercept(electronApp);
await triggerMenuAction(electronApp, 'Rename'); // set up the intercept
await item.click({ button: 'right' }); // triggers the intercepted handler
```

This is the only way to test context menu actions in Playwright + Electron.

## Debugging Failing Tests

### Capture Renderer Console Output

Add a console listener in `beforeAll` to see errors and logs from the renderer:

```typescript
mainWindow.on('console', msg => {
  const text = msg.text();
  if (msg.type() === 'error' && !text.includes('keychain') && !text.includes('decryptString')) {
    console.log(`[RENDERER error] ${text}`);
  }
  if (msg.type() === 'warning') {
    console.log(`[RENDERER warning] ${text}`);
  }
});
```

Filter out known noise like keychain errors and decryptString warnings.

### Take Screenshots on Failure

The playwright config already enables `screenshot: 'only-on-failure'`. You can also take manual screenshots:

```typescript
await mainWindow.screenshot({ path: 'debug-screenshot.png' });
```

Screenshots are saved to `playwright/test-results/`.

### Increase Timeouts for Debugging

When debugging interactively, increase timeouts to give yourself time:

```typescript
// In the test
await expect(composer).toBeVisible({ timeout: 30_000 });

// Or globally via CLI
npx playwright test --config playwright/playwright.config.ts --timeout=120000
```

### Isolate a Single Test

Run just one test to avoid interference from other tests:

```bash
npx playwright test --config playwright/playwright.config.ts -g "can type in composer body"
```

Note: Tests within a single spec file share a `beforeAll` app instance and run serially. A test may depend on state left by previous tests in the same file (e.g., thread-list.spec.ts expects threads to be visible after earlier navigation tests). When debugging, consider whether the test relies on prior test state.

### Check for Strict Mode Violations

Playwright's strict mode throws when a locator matches multiple elements. This is the most common failure mode. Fixes:

```typescript
locator('.foo').first()  // take first match
locator('.foo').last()   // take last match
locator('.foo').nth(2)   // take specific index
locator('.foo:has-text("specific")')  // narrow with text
```

### Inspect Element State

Use `evaluate` to inspect the DOM or app state:

```typescript
const itemCount = await mainWindow.evaluate(() => {
  return document.querySelectorAll('.list-item').length;
});

// Or inspect Mailspring stores via $m
const threadId = await mainWindow.evaluate(() => {
  return window.$m.FocusedContentStore.focused('thread')?.id;
});
```

Note: Direct `evaluate` calls in the renderer may be blocked by Mailspring's eval restriction. Use the `executeInRenderer` pattern via `electronApp.evaluate` if needed.

## Patterns for Common Test Scenarios

### Testing a Keyboard Shortcut That Creates a Task

```typescript
test('e archives focused thread', async () => {
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('e');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
});
```

### Testing an Inline Reply Composer

```typescript
test('r opens reply and allows typing', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  // Actually interact with it — type text and verify
  const body = composer.locator('[contenteditable="true"]').first();
  await body.click();
  await composerPage!.keyboard.type('test reply');
  await expect(body).toContainText('test reply');

  await composerPage!.keyboard.press('Meta+Escape');
});
```

### Testing a Popout Composer

```typescript
test('c opens new message composer with participant fields', async () => {
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('c');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
  // composerPage is a DIFFERENT window from mainWindow
  await expect(composerPage!.locator('.composer-participant-field').first()).toBeVisible();
});
```

### Testing Sidebar Navigation

```typescript
test('clicking Sent folder shows sent threads', async () => {
  await clickSidebarFolder(mainWindow, 'Sent');
  await mainWindow.waitForTimeout(1_000); // wait for perspective change
  // Verify the perspective actually changed by checking thread content
  await expect(threads(mainWindow).first()).toBeVisible();
  // Return to inbox for subsequent tests
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
});
```

### Testing Context Menu Actions (Folders/Labels)

```typescript
test('rename folder via context menu enters edit mode and accepts input', async () => {
  await installMenuIntercept(electronApp);
  const item = mainWindow.locator('.account-sidebar .item .name:has-text("MyFolder")').first();
  await triggerMenuAction(electronApp, 'Rename');
  await item.click({ button: 'right' });

  // Verify edit mode activated AND submit works
  const input = mainWindow.locator('.account-sidebar input[type="text"]');
  await expect(input).toBeVisible();
  await input.fill('NewName');
  await mainWindow.keyboard.press('Enter');
  // Verify task was created with the new name
});
```

## Test File Organization

Each spec file covers a logical area of the app:

| File | Area | Notes |
|------|------|-------|
| `app-launch.spec.ts` | Smoke test that app renders | Structural checks only — don't use as a pattern for new tests |
| `compose.spec.ts` | Composer interactions: shortcuts, typing, formatting | afterEach cleans up composers with 1500ms wait |
| `folder-management.spec.ts` | Sidebar folder CRUD via clicks and context menus | Uses `installMenuIntercept` for native menu bypass |
| `keyboard-shortcuts.spec.ts` | Preferences panel, global shortcuts | |
| `search.spec.ts` | Search: type query, verify filtering, clear | |
| `thread-actions.spec.ts` | Per-thread keyboard actions → task creation | Uses task capture to verify task type and data |
| `message-list.spec.ts` | Message expand/collapse, footer reply area | |
| `multi-select.spec.ts` | Cmd+Click, Shift+Click, `* a`/`* n` selection, bulk actions | Uses task capture |
| `find-in-thread.spec.ts` | Find bar: open, search, navigate matches, close | Verify via counter text, not DOM highlights |
| `go-to-shortcuts.spec.ts` | Gmail chord shortcuts: `g i`, `g t`, `g d` | Mousetrap sequences |
| `drag-to-folder.spec.ts` | Drag-and-drop threads to sidebar folders | Tests HTML5 drag from thread list to sidebar |
| `preferences-data.spec.ts` | Signatures, templates, and mail rules data persistence | Verifies data saved to config.json, templates folder, and localStorage |
| `thread-popout.spec.ts` | Thread popout via button click and double-click | Verifies new window opens with message list |
| `thread-list.spec.ts` | Navigation, open/close threads, reply/forward | Some tests depend on prior test state |

All spec files use `test.beforeAll` / `test.afterAll` to launch and close the app once per file. Tests within a file run serially and may depend on shared state.

---

## Coverage Gaps and Proposed Tests

The following interactions are not yet covered by E2E tests. Each proposed test is an interaction test that exercises a real user workflow — not just a visibility check.

### High Priority — Event handling and focus patterns most likely to break during React upgrades

**1. Multi-select interactions** — DONE (`multi-select.spec.ts`)

Tests implemented:
- `Cmd+Click` selects multiple threads, bulk archive creates task with multiple `threadIds`
- `Shift+Click` selects a range of threads (3+ items)
- `* a` selects all visible threads, `* n` deselects all

Key finding: In split mode, `x` is a no-op for selection — use `Cmd+Click` instead. See pitfall #7 above.

**2. Message expand/collapse** — DONE (`message-list.spec.ts`)

Tests implemented:
- Open thread → last message expanded, earlier messages collapsed (`.collapsed` class, `.collapsed-snippet` visible)
- Click collapsed message → expands (`.collapsed` class removed)
- Click expanded message header → collapses (`.collapsed` class added; note: last message cannot be collapsed)
- Click footer reply area → opens inline composer

Key finding: Collapsed messages render as a `<div>` with `.collapsed` class and show `.collapsed-snippet`. Expanded messages render as an `<article>` with `.message-header`. The last message in a thread cannot be toggled to collapsed.

**3. Undo toast after actions** — DONE (added to `thread-actions.spec.ts`)

Tests implemented:
- Archive thread with `e` → undo toast (`.undo-redo-toast`) appears → click Undo button → reverse task created

Key finding: The toast auto-dismisses after 3 seconds. Tests must click the Undo button quickly. The toast uses `CSSTransitionGroup` which will need attention during React upgrades.

**4. Find in thread** (`Cmd+F`) — DONE (`find-in-thread.spec.ts`)

Tests implemented:
- `Cmd+F` opens find bar (`.find-in-thread.enabled`), type a search term → match counter shows "X of Y", `Escape` closes bar
- Next/Previous buttons navigate between matches (index advances and returns)

Key findings:
- Search requires minimum 2 characters (`CHAR_THRESHOLD = 2` in search-constants.ts)
- Match highlights (`.search-match` elements) are rendered inside React virtual DOM components via `SearchableComponentMaker`, not as direct children of the main window. Verify results via the `.selection-progress` counter text ("X of Y") rather than querying for `.search-match` DOM elements.
- When only 1 match exists, clicking Next wraps around and the counter stays "1 of 1" — tests must handle this gracefully.
- Use `input.fill('term')` rather than `keyboard.type()` since the input receives focus automatically when the find bar opens.

**5. Composer field navigation and tokens** — DONE (added to `compose.spec.ts`)

Tests implemented:
- Tab from To field → focus moves to composer body (type text and verify it appears in contenteditable)
- Type email address + comma in To field → contact token (`.token`) appears as a pill
- `Cmd+I` toggles italic formatting (verified via `<em>` or `<i>` tag in contenteditable)

Key findings:
- Tab navigation uses `TabGroupRegion` from mailspring-component-kit. Testing it by typing after Tab and verifying text lands in the body is more reliable than checking `document.activeElement`.
- Contact token creation: type email then press `Comma` (not `Enter` — Enter may submit). The `.token` class element appears inside the `.composer-participant-field`.
- The full send flow (`Cmd+Enter` → `SendDraftTask`) requires real database access that synthetic PLAYWRIGHT drafts can't provide. Testing send would require additional PLAYWRIGHT-mode shims in DraftStore._onSendDraft.

**6. Footer reply area click** — DONE (in `message-list.spec.ts`, test "clicking footer reply area opens inline composer")

### Medium Priority — Keyboard shortcuts with complex or unusual binding patterns

**7. Go-to chord shortcuts** — DONE (`go-to-shortcuts.spec.ts`)

Tests implemented:
- `g` then `i` → sidebar highlights Inbox (`.account-sidebar .item.selected .name:has-text("Inbox")`)
- `g` then `t` → sidebar highlights Sent
- `g` then `d` → sidebar highlights Drafts

Key findings:
- Mousetrap chord sequences work with two separate `keyboard.press()` calls — no special handling needed.
- Verify navigation via the sidebar `.item.selected` class rather than checking thread content (which may take time to load).
- Each test should start from a different folder to ensure the chord actually navigated.

**8. Mark as read** (`Shift+I`) — DONE (added to `thread-actions.spec.ts`)

Tests implemented:
- `Shift+I` creates a `ChangeUnreadTask` with `unread: false`

**9. Additional text formatting shortcuts** — DONE (`compose.spec.ts`)

Tests implemented:
- `Cmd+I` toggles italic (verified via `<em>` or `<i>` tag in contenteditable)
- `Cmd+U` toggles underline (verified via `<u>` tag in contenteditable)
- `Cmd+K` / link toolbar button opens the link picker dropdown (verified via `.link-picker .dropdown` visibility, URL input with `placeholder="http://"`, and Add button; Enter closes the dropdown)

Key findings:
- `Cmd+K` dispatches through the app command system (`contenteditable:insert-link`) which simulates a mousedown on the `.fa.fa-link` toolbar button. Due to command dispatch complexities in Playwright/Electron, the test clicks the button directly.
- The link picker uses `onMouseDown` with `e.preventDefault()` to preserve Slate editor selection, then focuses the URL input via `setTimeout`. After Enter/Add, `onConfirm` applies the link mark to the selection.

**10. Move-to-folder popover interaction** — DONE (added to `thread-actions.spec.ts`)

Tests implemented:
- `v` opens popover → type "Trash" in `input.search` to filter → filtered results shown → `Escape` closes popover
- `v` opens popover → click first folder item → `ChangeFolderTask` or `ChangeLabelsTask` created

Key finding: The popover's search input has class `.search` and placeholder "Move to...". Filtering is immediate — no debounce.

**11. Label picker** (`l`) — NOT TESTABLE with current fixture

The `l` key (`core:change-labels`) only registers when `account.usesLabels()` returns true (Gmail/Google accounts). The test fixture uses a Yahoo account (IMAP/folders), so the label picker command is never bound. Testing this would require a Gmail account fixture.

### Community-Reported Gaps — Tests sourced from real bug reports and regressions

**P0: Composer focus & keyboard isolation** — DONE (added to `compose.spec.ts`)

7+ community bug reports (#14410, #14415, #14400, #14416, #14423, #14226, #14098). This is the #1 reported bug category.

Tests implemented:
- Backspace in reply composer deletes text, does NOT archive the thread (verified via task capture: no `ChangeFolderTask`/`ChangeLabelsTask`/`ChangeStarredTask` created)
- Spacebar in composer types a space, does NOT dismiss the draft (composer remains visible)
- All dangerous single-key shortcuts (`e`, `s`, `#`, `!`, `d`) are suppressed while typing in composer body (all chars appear as text, zero thread-action tasks created)
- Reply composer retains focus — rapid typing at 10ms delay, verify full string lands in body
- (Pre-existing) Typing `searching for answers` (contains e, s, r, f, a shortcuts) doesn't trigger any shortcuts

Key findings:
- Mousetrap's `stopCallback` in `keymap-manager.ts` correctly suppresses raw key events inside `.composer-outer-wrap` by checking `element.closest('.composer-outer-wrap')`.
- The suppression checks for plain keys (no modifier) and reserved text-editing shortcuts (`Cmd+a/x/c/v`).
- Task capture (`installTaskCapture` + `getCapturedTasks`) is essential for verifying that no background tasks were created. Checking that the thread subject didn't change is insufficient — a task could be created without immediately changing the UI.

**P1: Undo/redo operations** — DONE (added to `thread-actions.spec.ts`)

5 reports (#14206, #14209, #2318, #14283, #8449).

Tests implemented:
- `Cmd+Z` after trash (`#`) creates a reverse `ChangeFolderTask` (verified via task capture)
- Undo toast appears after move-to-folder (popover → click folder → toast visible)
- (Pre-existing) Undo toast after archive → click Undo button → reverse task created

Key findings:
- `core:undo` in `window-event-handler.ts` checks `isTextInput(e.target)`. If true, calls `webContents.undo()` (browser undo). If false, calls `UndoRedoStore.undo()`. Tests must click a non-text-input element before pressing `Cmd+Z`.
- `ChangeFolderTask.canBeUndone` is only true when threads come from a single folder. Starting from Inbox ensures this.

**P1: Search result interactions** — DONE (added to `search.spec.ts`)

7 reports (#915, #8395, #863, #14185, #1152, #9321, #14407).

Tests implemented:
- Star shortcut (`s`) works on search result threads → `ChangeStarredTask` created
- Archive shortcut (`e`) works on search result threads → `ChangeFolderTask`/`ChangeLabelsTask` created
- (Pre-existing) Escape/X clears search and returns to inbox

Key finding: Search results are regular thread list items that respond to the same keyboard shortcuts. The tests search for "SMTP" (present in test fixture data), focus a result, and verify the shortcut creates the expected task.

**P2: Multi-select edge cases** — DONE (added to `multi-select.spec.ts`)

Report #14075.

Tests implemented:
- Selection clears when switching folders (multi-select in Inbox → switch to Sent → selection count drops to ≤1)

**P2: Reply/forward correctness** — DONE (added to `compose.spec.ts`)

Reports #275, #9120, #9603, #8922, #9727.

Tests implemented:
- Reply-All (`a`) includes original recipients as `.token` elements in To field

**P2: Dark mode / theme rendering** — NOT TESTABLE in PLAYWRIGHT environment

Reports #14065, #682, #9027, #448, #225, #13963.

The ThemeManager's `updateThemePackageAndRecomputeLESS()` (which recompiles all LESS stylesheets at runtime) doesn't work reliably in the PLAYWRIGHT test environment. Calling `AppEnv.themes.setActiveTheme('ui-dark')` or `AppEnv.config.set('core.theme', 'ui-dark')` doesn't trigger the expected body class changes, likely due to LESS compilation path issues in dev mode. Testing dark mode would require either fixing the theme pipeline in PLAYWRIGHT mode or using screenshot comparison.

**Not testable in PLAYWRIGHT mode** (no mailsync, no network, no OS integration):
- Attachment drag-and-drop (file system interaction)
- Send undo (requires real send flow through DraftStore)
- Remote image loading (requires network access)
- Link opens in external browser (OS-level integration)
- Unread count badge changes (requires mailsync writing to DB)
- Label picker (requires Gmail account fixture; test account is Yahoo/IMAP)

### Lower Priority — Less common interaction paths

**12. Quick reply from footer area** — DONE (in `message-list.spec.ts`)

**13. Thread popout** — DONE (`thread-popout.spec.ts`)

Tests implemented:
- Click popout button (`.message-icons-wrap [aria-label="Popout thread"]`) → new window with `windowType: 'thread-popout'` opens → message list renders with messages
- Double-click thread in thread list → popout window opens with messages

Key findings:
- Thread popout windows can be identified by checking `windowType === 'thread-popout'` in the URL's loadSettings parameter.
- The popout window loads the thread from the database via `DatabaseStore.find()`, which works with the golden test database.
- Messages render in the popout window because `message-list/main.tsx` detects non-main windows and registers MessageList at `WorkspaceStore.Location.Center`.

**14. Mute thread** (`m`) — NOT TESTABLE

The `core:mute-conversation` command has a keybinding in the Gmail keymap (`m`) but no handler is implemented in the codebase. Pressing `m` is a no-op.

**15. Snooze** (`h`) — DONE (added to `thread-actions.spec.ts`)

Tests implemented:
- `h` opens snooze popover (`.snooze-popover`) → contains 6 `.snooze-item` date options (Later Today, Tonight, Tomorrow, This Weekend, Next Week, Next Month) → `Escape` closes popover

Key findings:
- The snooze popover is rendered via `Actions.openPopover()` when the toolbar `SnoozeButton` is clicked. The `core:snooze-item` keybinding (mapped to `h` in Gmail keymap) triggers `this._btn.onClick()` on the `ToolbarSnooze` component via `BindGlobalCommands`.
- The `ToolbarSnooze` component only renders when `FocusedPerspectiveStore.current().isInbox()` returns true, so the test must start from the Inbox folder.
- Clicking a snooze item would trigger `SnoozeActions.snoozeThreads()` (a Reflux action, not `Actions.queueTask`), so it cannot be verified via the standard task capture system.

**16. Expand/Collapse All messages toggle** — DONE (added to `message-list.spec.ts`)

Tests implemented:
- Click "Expand All" button → all messages expanded (zero `.collapsed` elements) → button label changes to "Collapse All" → click again → messages collapsed

Key findings:
- The toggle button uses `aria-label` ("Expand All" / "Collapse All") which changes based on `hasCollapsedItems` state.
- `Actions.toggleAllMessagesExpanded()` is called by the button click, which is handled by `MessageStore._onToggleAllMessagesExpanded`.
- The button only renders when `canCollapse` is true (thread has multiple messages).

**17. Drag-and-drop threads to folders** — DONE (`drag-to-folder.spec.ts`)

Tests implemented:
- Drag thread to Trash folder → `ChangeFolderTask` created with `folder.role === 'trash'`
- Drag thread to Archive folder → `ChangeFolderTask` or `ChangeLabelsTask` created
- Undo toast appears after drag-to-folder

Key findings:
- The `draggable` attribute is on `.list-rows` (the parent container), not individual `.list-item` elements. `MultiselectList._onDragStart` uses `itemsForMouseEvent(event)` which calls `document.elementFromPoint()` to find the item under the cursor, then checks `[data-item-id]`.
- The sidebar drop targets use `DropZone` components wrapped around `OutlineViewItem`. The `shouldAcceptDrop` handler validates that the dragged data contains `'mailspring-threads-data'` and account IDs match.
- On drop, `SidebarItem.onDrop()` calls `perspective.receiveThreadIds()` which creates `ChangeFolderTask` via `TaskFactory.tasksForThreadsByAccountId()` with `source: 'Dragged into list'`.
- Playwright's `dragTo` works correctly with Electron's HTML5 drag events — no special workarounds needed.

**18. Split-view panel resize** — Drag the divider between thread list and message view → layout updates
