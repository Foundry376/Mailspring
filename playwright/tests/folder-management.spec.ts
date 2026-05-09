import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  installTaskCapture,
  clearCapturedTasks,
  waitForCapturedTask,
  installMenuIntercept,
  triggerMenuAction,
} from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
  await installTaskCapture(electronApp);
  await installMenuIntercept(electronApp);
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Locator for the "Folders" section in the sidebar */
function foldersSection(page: Page) {
  return page.locator('.outline-view:has(.heading .text:has-text("Folders"))');
}

/** Locator for a specific folder treeitem by name (only matches when NOT in edit mode) */
function folderItem(page: Page, name: string) {
  return foldersSection(page)
    .locator(`[role="treeitem"]:has(> .item-container .name:has-text("${name}"))`)
    .first();
}

// ─── Folder section visibility ────────────────────────────────────────────

test('sidebar shows Folders section with user folders', async () => {
  const section = foldersSection(mainWindow);
  await expect(section).toBeVisible({ timeout: 5_000 });
  await expect(section.locator('.heading .text')).toHaveText('Folders');

  // Verify user folders are listed
  await expect(folderItem(mainWindow, 'Archived')).toBeVisible();
  await expect(folderItem(mainWindow, 'Travel')).toBeVisible();
});

// ─── Folder hierarchy ─────────────────────────────────────────────────────

test('Travel folder with Spain subfolder is displayed', async () => {
  const travel = folderItem(mainWindow, 'Travel');
  await expect(travel).toBeVisible({ timeout: 5_000 });

  // Expand Travel if collapsed
  const expanded = await travel.getAttribute('aria-expanded');
  if (expanded === 'false') {
    await travel.locator('.disclosure-triangle').click();
    await mainWindow.waitForTimeout(500);
  }

  const spain = travel.locator('[role="treeitem"]:has(.name:has-text("Spain"))');
  await expect(spain).toBeVisible({ timeout: 3_000 });
});

// ─── Create folder via + button ───────────────────────────────────────────

test('clicking + button creates a folder and queues SyncbackCategoryTask', async () => {
  const section = foldersSection(mainWindow);

  // The + button is hidden until hover; hover over heading first
  await section.locator('.heading').hover();
  await mainWindow.waitForTimeout(300);

  const addBtn = section.locator('.add-item-button');
  await addBtn.click({ force: true });

  const input = section.locator('input.item-input');
  await expect(input).toBeVisible({ timeout: 3_000 });
  await expect(input).toBeFocused();

  await clearCapturedTasks(electronApp);
  await input.fill('TestPlaywright');
  await input.press('Enter');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'SyncbackCategoryTask' && !t.existingPath
  );
  expect(task).not.toBeNull();
  expect(task.path).toContain('TestPlaywright');
});

// ─── Rename folder via double-click ───────────────────────────────────────

// Note: 'double-clicking a folder enters edit mode' is covered by the rename test below
// which double-clicks, edits, and verifies the SyncbackCategoryTask.

test('pressing Escape cancels rename', async () => {
  const input = foldersSection(mainWindow).locator('input.item-input');

  // If not already in edit mode, double-click to enter it
  if ((await input.count()) === 0) {
    const archived = folderItem(mainWindow, 'Archived');
    await archived.locator('.item-container .item').first().dblclick();
    await expect(input).toBeVisible({ timeout: 3_000 });
  }

  await input.press('Escape');

  // Input should disappear, name should still be "Archived"
  await expect(input).not.toBeVisible({ timeout: 3_000 });
  await expect(folderItem(mainWindow, 'Archived').locator('.name')).toHaveText('Archived');
});

test('renaming a folder creates a SyncbackCategoryTask with existingPath', async () => {
  const archived = folderItem(mainWindow, 'Archived');
  await archived.locator('.item-container .item').first().dblclick();

  const input = foldersSection(mainWindow).locator('input.item-input');
  await expect(input).toBeVisible({ timeout: 3_000 });

  await clearCapturedTasks(electronApp);
  await input.fill('ArchivedRenamed');
  await input.press('Enter');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'SyncbackCategoryTask' && !!t.existingPath
  );
  expect(task).not.toBeNull();
  expect(task.existingPath).toBeTruthy();
  expect(task.path).toContain('ArchivedRenamed');
});

// ─── Context menu: rename via right-click ─────────────────────────────────

test('rename via context menu enters edit mode', async () => {
  // Ensure no lingering input
  await mainWindow.keyboard.press('Escape');
  await mainWindow.waitForTimeout(300);

  const drafts = folderItem(mainWindow, 'Drafts');
  await expect(drafts).toBeVisible();

  // Set up interceptor to trigger "Rename"
  await triggerMenuAction(electronApp, 'Rename');

  await drafts.locator('.item-container .item').first().click({ button: 'right' });

  const input = foldersSection(mainWindow).locator('input.item-input');
  await expect(input).toBeVisible({ timeout: 3_000 });
  await expect(input).toHaveValue('Drafts');

  // Cancel the rename
  await input.press('Escape');
});

// ─── Context menu: create subfolder ───────────────────────────────────────

test('create subfolder via context menu shows input and queues task', async () => {
  const travel = folderItem(mainWindow, 'Travel');
  await expect(travel).toBeVisible();

  // Expand Travel if collapsed
  const expanded = await travel.getAttribute('aria-expanded');
  if (expanded === 'false') {
    await travel.locator('.disclosure-triangle').click();
    await mainWindow.waitForTimeout(500);
  }

  // Set up interceptor to trigger "New Subfolder"
  await triggerMenuAction(electronApp, 'Subfolder');

  await travel.locator('.item-container .item').first().click({ button: 'right' });

  // The subfolder input should appear inside Travel's children
  const childInput = foldersSection(mainWindow).locator('input.item-input');
  await expect(childInput).toBeVisible({ timeout: 5_000 });

  await clearCapturedTasks(electronApp);
  await childInput.fill('Portugal');
  await childInput.press('Enter');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'SyncbackCategoryTask' && !t.existingPath
  );
  expect(task).not.toBeNull();
  // The task path should contain the parent + separator + child name
  expect(task.path).toContain('Portugal');
});

// ─── Context menu: delete folder ──────────────────────────────────────────

test('delete folder via context menu creates a DestroyCategoryTask', async () => {
  // Use any visible user folder (Archived may have been "renamed")
  const section = foldersSection(mainWindow);
  const target = section
    .locator('[role="treeitem"]:has(> .item-container .name)')
    .first();
  await expect(target).toBeVisible();

  const folderName = await target.locator('.name').first().textContent();

  await clearCapturedTasks(electronApp);

  // Set up interceptor to trigger "Delete"
  // dialog.showMessageBoxSync is already mocked to return 0 (confirm delete)
  await triggerMenuAction(electronApp, 'Delete');

  await target.locator('.item-container .item').first().click({ button: 'right' });

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'DestroyCategoryTask'
  );
  expect(task).not.toBeNull();
  expect(task.path).toBeTruthy();
});
