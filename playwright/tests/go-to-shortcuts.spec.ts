import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, clickSidebarFolder } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

// --- Go-to chord shortcuts (Gmail keymap: g + letter) ---
// These are Mousetrap "sequence" bindings: press 'g', then press the letter.

test('g i navigates to Inbox', async () => {
  // Start from a different folder to verify navigation
  await clickSidebarFolder(mainWindow, 'Sent');
  await mainWindow.waitForTimeout(1_000);

  // Press g then i (chord sequence)
  await mainWindow.keyboard.press('g');
  await mainWindow.keyboard.press('i');
  await mainWindow.waitForTimeout(1_000);

  // Verify the Inbox sidebar item is selected
  const inboxItem = mainWindow.locator('.account-sidebar .item.selected .name:has-text("Inbox")');
  await expect(inboxItem).toBeVisible({ timeout: 3_000 });
});

test('g t navigates to Sent', async () => {
  // Start from Inbox
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);

  await mainWindow.keyboard.press('g');
  await mainWindow.keyboard.press('t');
  await mainWindow.waitForTimeout(1_000);

  const sentItem = mainWindow.locator('.account-sidebar .item.selected .name:has-text("Sent")');
  await expect(sentItem).toBeVisible({ timeout: 3_000 });
});

test('g d navigates to Drafts', async () => {
  // Start from Inbox
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);

  await mainWindow.keyboard.press('g');
  await mainWindow.keyboard.press('d');
  await mainWindow.waitForTimeout(1_000);

  const draftsItem = mainWindow.locator('.account-sidebar .item.selected .name:has-text("Drafts")');
  await expect(draftsItem).toBeVisible({ timeout: 3_000 });

  // Return to inbox for next tests
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(500);
});
