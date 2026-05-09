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

// --- Drag-and-drop thread to sidebar folder ---

test('dragging a thread to a sidebar folder creates a ChangeFolderTask', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);

  // Focus the first thread so it's selected
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  // Drag the focused thread to the Trash folder in the sidebar
  const source = threads(mainWindow).nth(0);
  const target = mainWindow.locator('.account-sidebar .item .name:has-text("Trash")').first();

  await source.dragTo(target);
  await mainWindow.waitForTimeout(1_000);

  // A ChangeFolderTask should be created with the target folder
  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
  if (task.folder) {
    expect(task.folder.role).toBe('trash');
  }
});

test('dragging a thread to Archive creates a ChangeFolderTask', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);

  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  const source = threads(mainWindow).nth(0);
  const target = mainWindow.locator('.account-sidebar .item .name:has-text("Archive")').first();

  await source.dragTo(target);
  await mainWindow.waitForTimeout(1_000);

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
});

test('undo toast appears after drag-to-folder', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);

  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  const source = threads(mainWindow).nth(0);
  const target = mainWindow.locator('.account-sidebar .item .name:has-text("Trash")').first();

  await source.dragTo(target);

  // Undo toast should appear since drag-to-folder tasks support undo
  const toast = mainWindow.locator('.undo-redo-toast');
  await expect(toast).toBeVisible({ timeout: 3_000 });
});
