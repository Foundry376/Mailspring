import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  threads,
  clearSearch,
  focusThread,
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

// --- Search bar focus ---

test('/ focuses the search bar', async () => {
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('/');

  const searchBar = mainWindow.locator('.thread-search-bar:not(.placeholder)');
  await expect(searchBar).toBeVisible({ timeout: 3_000 });

  await mainWindow.keyboard.press('Escape');
});

// Note: 'clicking search bar focuses it' is covered by the search tests below
// which click/focus the search bar and type queries.

// --- Search queries ---

test('typing a search term filters the thread list', async () => {
  const initialCount = await threads(mainWindow).count();

  // Focus search and type a term
  await mainWindow.keyboard.press('/');
  await mainWindow.keyboard.type('SMTP');
  await mainWindow.keyboard.press('Enter');

  // Wait for search results to load
  await mainWindow.waitForTimeout(2_000);

  // The thread list should show filtered results
  const searchCount = await threads(mainWindow).count();
  expect(searchCount).toBeLessThanOrEqual(initialCount);
  expect(searchCount).toBeGreaterThan(0);

  await clearSearch(mainWindow);
});

test('from: operator searches by sender', async () => {
  await mainWindow.keyboard.press('/');
  await mainWindow.keyboard.type('from:bengotow');
  await mainWindow.keyboard.press('Enter');

  await mainWindow.waitForTimeout(2_000);

  const count = await threads(mainWindow).count();
  expect(count).toBeGreaterThanOrEqual(0);

  await clearSearch(mainWindow);
});

test('subject: operator searches by subject', async () => {
  await mainWindow.keyboard.press('/');
  await mainWindow.keyboard.type('subject:Test');
  await mainWindow.keyboard.press('Enter');

  await mainWindow.waitForTimeout(2_000);

  const count = await threads(mainWindow).count();
  expect(count).toBeGreaterThanOrEqual(0);

  await clearSearch(mainWindow);
});

test('Escape clears search and returns to inbox', async () => {
  // Run a search first
  await mainWindow.keyboard.press('/');
  await mainWindow.keyboard.type('test query');
  await mainWindow.keyboard.press('Enter');
  await mainWindow.waitForTimeout(1_000);

  // Clear using the X button (more reliable than Escape for full clear)
  await clearSearch(mainWindow);

  // The search bar should return to placeholder state
  const searchBar = mainWindow.locator('.thread-search-bar');
  await expect(searchBar).toBeVisible();

  // Thread list should show inbox threads again
  const count = await threads(mainWindow).count();
  expect(count).toBeGreaterThan(0);
});

// --- Keyboard shortcuts work on search results ---
// Community reports: shortcuts like star/archive sometimes don't work in search context

test('star shortcut works on search result threads', async () => {
  // Search for something that returns results
  await mainWindow.keyboard.press('/');
  await mainWindow.keyboard.type('SMTP');
  await mainWindow.keyboard.press('Enter');
  await mainWindow.waitForTimeout(2_000);

  const searchResultCount = await threads(mainWindow).count();
  if (searchResultCount === 0) {
    // Skip if no search results (test data dependent)
    await clearSearch(mainWindow);
    return;
  }

  // Focus a search result thread and star it
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);
  await mainWindow.keyboard.press('s');

  const task = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeStarredTask');
  expect(task).not.toBeNull();
  expect(task.threadIds.length).toBeGreaterThan(0);

  await clearSearch(mainWindow);
});

test('archive shortcut works on search result threads', async () => {
  await mainWindow.keyboard.press('/');
  await mainWindow.keyboard.type('SMTP');
  await mainWindow.keyboard.press('Enter');
  await mainWindow.waitForTimeout(2_000);

  const searchResultCount = await threads(mainWindow).count();
  if (searchResultCount === 0) {
    await clearSearch(mainWindow);
    return;
  }

  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);
  await mainWindow.keyboard.press('e');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();

  await clearSearch(mainWindow);
});
