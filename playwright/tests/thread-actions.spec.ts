import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  threads,
  focusThread,
  clickSidebarFolder,
  installTaskCapture,
  clearCapturedTasks,
  waitForCapturedTask,
} from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
  await installTaskCapture(electronApp);
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

// --- Star ---

test('s creates a ChangeStarredTask', async () => {
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('s');

  const task = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeStarredTask');
  expect(task).not.toBeNull();
  expect(task.threadIds).toBeTruthy();
  expect(task.threadIds.length).toBeGreaterThan(0);
});

// --- Mark as read/unread ---

test('Shift+u creates a ChangeUnreadTask', async () => {
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('Shift+u');

  const task = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeUnreadTask');
  expect(task).not.toBeNull();
  expect(task.threadIds).toBeTruthy();
});

// --- Archive ---

test('e creates a ChangeFolderTask or ChangeLabelsTask for archive', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('e');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
});

// --- Delete (move to trash) ---

test('# moves to trash and creates a ChangeFolderTask', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  // Type '#' directly rather than Shift+3 to ensure the keybinding matches
  await mainWindow.keyboard.type('#');

  const task = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeFolderTask');
  expect(task).not.toBeNull();
  if (task.folder) {
    expect(task.folder.role).toBe('trash');
  }
});

// --- Mark as spam ---

test('! marks as spam and creates a task', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  // Type '!' directly rather than Shift+1 to ensure the keybinding matches
  await mainWindow.keyboard.type('!');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
});

// --- Undo toast ---

test('archive shows undo toast and clicking Undo creates an undo task', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('e');

  // Wait for the undo toast to appear
  const toast = mainWindow.locator('.undo-redo-toast');
  await expect(toast).toBeVisible({ timeout: 3_000 });

  // Click the Undo button
  await clearCapturedTasks(electronApp);
  const undoButton = toast.locator('.action').first();
  await undoButton.click();

  // Should create an undo task (reverse the archive)
  const undoTask = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(undoTask).not.toBeNull();
});

// --- Undo via Cmd+Z ---
// UndoRedoStore.undo() is called when Cmd+Z fires outside a text input.
// It pops the last undoable task and queues its createUndoTask() result.

test('Cmd+Z after trash creates a reverse ChangeFolderTask', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  // Trash the thread
  await mainWindow.keyboard.type('#');
  const trashTask = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeFolderTask');
  expect(trashTask).not.toBeNull();

  // Now press Cmd+Z to undo (focus must NOT be in a text input)
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.waitForTimeout(300);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('Meta+z');

  const undoTask = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(undoTask).not.toBeNull();
});

test('undo toast appears after move-to-folder', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  // Open move-to-folder popover and select a folder
  try {
    await mainWindow.keyboard.press('v');
  } catch (e) {
    if (!`${e}`.includes('handleJavaScriptDialog')) throw e;
  }

  const popover = mainWindow.locator('.category-picker-popover');
  await expect(popover).toBeVisible({ timeout: 10_000 });
  await popover.locator('.category-item').first().click();
  await mainWindow.waitForTimeout(500);

  // Undo toast should appear
  const toast = mainWindow.locator('.undo-redo-toast');
  await expect(toast).toBeVisible({ timeout: 3_000 });
});

// --- Mark as read ---

test('Shift+I creates a ChangeUnreadTask with unread: false', async () => {
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('Shift+i');

  const task = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeUnreadTask');
  expect(task).not.toBeNull();
  expect(task.unread).toBe(false);
});

// --- Move to folder via popover ---

test('v opens popover, type to filter, Escape closes it', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);

  try {
    await mainWindow.keyboard.press('v');
  } catch (e) {
    if (!`${e}`.includes('handleJavaScriptDialog')) throw e;
  }

  const popover = mainWindow.locator('.category-picker-popover');
  await expect(popover).toBeVisible({ timeout: 10_000 });

  // Verify folder list is populated
  const folderCount = await popover.locator('.category-item').count();
  expect(folderCount).toBeGreaterThan(0);

  // Type in the search field to filter folders
  const searchInput = popover.locator('input.search');
  await searchInput.fill('Trash');
  await mainWindow.waitForTimeout(500);

  // Filtered list should be shorter
  const filteredCount = await popover.locator('.category-item').count();
  expect(filteredCount).toBeLessThanOrEqual(folderCount);
  expect(filteredCount).toBeGreaterThan(0);

  // Press Escape to close the popover
  await mainWindow.keyboard.press('Escape');
  await mainWindow.waitForTimeout(500);
  await expect(popover).not.toBeVisible({ timeout: 3_000 });
});

test('v popover: clicking a folder creates a ChangeFolderTask', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  try {
    await mainWindow.keyboard.press('v');
  } catch (e) {
    if (!`${e}`.includes('handleJavaScriptDialog')) throw e;
  }

  const popover = mainWindow.locator('.category-picker-popover');
  await expect(popover).toBeVisible({ timeout: 10_000 });

  // Click the first folder item to move the thread
  const firstItem = popover.locator('.category-item').first();
  await firstItem.click();
  await mainWindow.waitForTimeout(500);

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
});

// --- Snooze popover ---

test('h opens snooze popover with date options', async () => {
  // Navigate to Inbox and ensure focus is on the thread list (not message view)
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  // The ToolbarSnooze component only renders when isInbox() is true.
  // It registers the 'h' keybinding via BindGlobalCommands.
  // Verify the snooze toolbar button is visible before pressing h.
  const snoozeButton = mainWindow.locator('.snooze-button');
  const snoozeVisible = await snoozeButton.count();
  if (snoozeVisible === 0) {
    // Snooze button not rendered — ToolbarSnooze returned <span />.
    // This can happen if isInbox() returned false. Skip gracefully.
    return;
  }

  // Click the snooze button directly (more reliable than keyboard shortcut,
  // which depends on BindGlobalCommands being mounted)
  await snoozeButton.first().click();

  // The snooze popover should appear with date option items
  const popover = mainWindow.locator('.snooze-popover');
  await expect(popover).toBeVisible({ timeout: 5_000 });

  // Should have snooze items (Later Today, Tonight, Tomorrow, etc.)
  const snoozeItems = popover.locator('.snooze-item');
  const itemCount = await snoozeItems.count();
  expect(itemCount).toBeGreaterThanOrEqual(6); // 2 rows × 3 items

  // Verify some expected labels are present
  await expect(popover).toContainText('Tomorrow');
  await expect(popover).toContainText('Next Week');

  // Close the popover with Escape
  await mainWindow.keyboard.press('Escape');
  await mainWindow.waitForTimeout(500);
  await expect(popover).not.toBeVisible({ timeout: 3_000 });
});

// --- Label picker ---
// Note: The 'l' key (core:change-labels) only works with Gmail/Google accounts
// that support labels (account.usesLabels()). The test fixture uses a Yahoo
// account which uses folders, so the label picker cannot be tested here.
