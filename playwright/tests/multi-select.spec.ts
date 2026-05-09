import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  threads,
  focusThread,
  installTaskCapture,
  clearCapturedTasks,
  waitForCapturedTask,
  clickSidebarFolder,
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

// --- Cmd+Click multi-select in split mode ---

test('Cmd+Click selects multiple threads and bulk archive affects all', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(500);

  // Click first thread to focus it, then Cmd+Click second to add to selection
  await focusThread(mainWindow, 0);
  await threads(mainWindow).nth(1).click({ modifiers: ['Meta'] });

  // Both threads should be selected
  await expect(threads(mainWindow).first()).toHaveClass(/selected/, { timeout: 2_000 });
  await expect(threads(mainWindow).nth(1)).toHaveClass(/selected/, { timeout: 2_000 });

  // Archive — task should contain multiple threadIds
  await clearCapturedTasks(electronApp);
  await mainWindow.keyboard.press('e');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
  expect(task.threadIds.length).toBeGreaterThanOrEqual(2);
});

// --- Shift+Click range selection ---

test('Shift+Click selects a range of threads', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);

  await focusThread(mainWindow, 0);
  await threads(mainWindow).nth(3).click({ modifiers: ['Shift'] });

  await mainWindow.waitForTimeout(500);

  const selectedCount = await mainWindow.locator('.thread-list .list-item.selected').count();
  expect(selectedCount).toBeGreaterThanOrEqual(3);

  // Clean up
  await mainWindow.keyboard.press('*');
  await mainWindow.keyboard.press('n');
  await mainWindow.waitForTimeout(500);
});

// --- * a / * n select all / deselect all ---

test('* a selects all visible threads and * n deselects them', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);

  // Select all
  await mainWindow.keyboard.press('*');
  await mainWindow.keyboard.press('a');
  await mainWindow.waitForTimeout(500);

  const selectedAfterAll = await mainWindow.locator('.thread-list .list-item.selected').count();
  expect(selectedAfterAll).toBeGreaterThan(1);

  // Deselect all
  await mainWindow.keyboard.press('*');
  await mainWindow.keyboard.press('n');
  await mainWindow.waitForTimeout(500);

  const selectedAfterNone = await mainWindow.locator('.thread-list .list-item.selected').count();
  expect(selectedAfterNone).toBe(0);
});

// --- Selection clears on folder switch ---
// Community report #14075: erratic selection state

test('selection clears when switching folders', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);

  // Multi-select some threads
  await focusThread(mainWindow, 0);
  await threads(mainWindow).nth(1).click({ modifiers: ['Meta'] });
  await mainWindow.waitForTimeout(300);

  const selectedBefore = await mainWindow.locator('.thread-list .list-item.selected').count();
  expect(selectedBefore).toBeGreaterThanOrEqual(2);

  // Switch to Sent folder
  await clickSidebarFolder(mainWindow, 'Sent');
  await mainWindow.waitForTimeout(1_000);

  // Selection should be cleared
  const selectedAfter = await mainWindow.locator('.thread-list .list-item.selected').count();
  expect(selectedAfter).toBeLessThanOrEqual(1); // at most one focused item, not multi-selected

  // Return to inbox
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(500);
});
