import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

// --- Preferences ---

test('Cmd+, opens preferences panel', async () => {
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('Meta+,');
  await expect(mainWindow.locator('.preferences-wrap')).toBeVisible({ timeout: 5_000 });
});

test('preferences shows all expected tabs', async () => {
  const tabs = ['General', 'Accounts', 'Subscription', 'Appearance', 'Shortcuts', 'Mail Rules', 'Folders', 'Signatures', 'Templates'];
  for (const tab of tabs) {
    await expect(mainWindow.locator(`.preferences-tabs .item:has-text("${tab}")`)).toBeVisible();
  }
});

test('clicking Shortcuts tab shows shortcut preferences', async () => {
  await mainWindow.locator('.preferences-tabs .item:has-text("Shortcuts")').click();
  await expect(mainWindow.locator('text=Shortcut set')).toBeVisible({ timeout: 3_000 });
});

test('clicking back arrow closes preferences', async () => {
  const backButton = mainWindow.locator('.sheet-toolbar .btn-back, .sheet-toolbar-container .item-back');
  if (await backButton.count() > 0) {
    await backButton.click();
  } else {
    await mainWindow.keyboard.press('Escape');
  }
  await expect(mainWindow.locator('.preferences-wrap')).not.toBeVisible({ timeout: 5_000 });
});

// --- Gmail single-key shortcuts (focus-sensitive) ---

test('/ focuses the search bar', async () => {
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('/');

  // When focused, the search bar should lose the placeholder class
  const searchBar = mainWindow.locator('.thread-search-bar:not(.placeholder)');
  await expect(searchBar).toBeVisible({ timeout: 3_000 });

  await mainWindow.keyboard.press('Escape');
});

// Note: ? (Shift+/) is mapped to application:open-help in Gmail template,
// but this command has no handler in the codebase — it's a dead binding.
