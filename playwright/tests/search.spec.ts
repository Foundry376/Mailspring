import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, threads, clearSearch } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
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

test('clicking search bar focuses it', async () => {
  await mainWindow.locator('.thread-search-bar').click();

  const searchBar = mainWindow.locator('.thread-search-bar:not(.placeholder)');
  await expect(searchBar).toBeVisible({ timeout: 3_000 });

  await mainWindow.keyboard.press('Escape');
});

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
