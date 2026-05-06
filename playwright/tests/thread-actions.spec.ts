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

// --- Move to folder via popover ---

test('v opens move-to-folder popover', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);

  try {
    await mainWindow.keyboard.press('v');
  } catch (e) {
    // Ignore transient dialog protocol errors from sync-error dialog mocking
    if (!`${e}`.includes('handleJavaScriptDialog')) throw e;
  }

  const popover = mainWindow.locator('.category-picker-popover');
  await expect(popover).toBeVisible({ timeout: 10_000 });

  // Verify folder list is populated
  const folderCount = await popover.locator('.category-item').count();
  expect(folderCount).toBeGreaterThan(0);
});
