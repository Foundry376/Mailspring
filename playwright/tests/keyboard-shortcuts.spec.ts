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

// Preferences is a section of the main window (#2970), so it's left by picking another section.
test('picking Mail on the nav rail leaves preferences', async () => {
  await mainWindow.locator('.nav-rail-item[aria-label="Mail"]').click();
  await expect(mainWindow.locator('.preferences-wrap')).not.toBeVisible({ timeout: 5_000 });
  await expect(mainWindow.locator('.thread-list')).toBeVisible();
});

// Note: '/ focuses the search bar' is tested in search.spec.ts
// Note: ? (Shift+/) is mapped to application:open-help in Gmail template,
// but this command has no handler in the codebase — it's a dead binding.
