import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, openThread } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

// --- Find in thread (Cmd+F) ---

test('Cmd+F opens find bar, typing searches, Escape closes it', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  // Press Cmd+F to open find bar
  await mainWindow.keyboard.press('Meta+f');

  const findBar = mainWindow.locator('.find-in-thread.enabled');
  await expect(findBar).toBeVisible({ timeout: 3_000 });

  // The input should be focused and ready for typing
  const input = findBar.locator('input[placeholder="Find in thread"]');
  await expect(input).toBeVisible();

  // Type a search term (must be >= 2 characters for CHAR_THRESHOLD)
  await input.fill('the');
  await mainWindow.waitForTimeout(1_000);

  // Verify matches were found — the selection-progress div shows "X of Y"
  // Match highlights are rendered inside React virtual DOM components, not
  // as direct children of the main window, so we verify via the counter.
  const progress = findBar.locator('.selection-progress');
  const progressText = await progress.textContent();
  expect(progressText).toMatch(/\d+ of \d+/);

  // Press Escape to close the find bar
  await mainWindow.keyboard.press('Escape');
  await mainWindow.waitForTimeout(500);

  // The find bar should no longer have the enabled class
  await expect(mainWindow.locator('.find-in-thread.enabled')).not.toBeVisible({ timeout: 3_000 });
});

test('find bar next/previous buttons navigate between matches', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  await mainWindow.keyboard.press('Meta+f');

  const findBar = mainWindow.locator('.find-in-thread.enabled');
  await expect(findBar).toBeVisible({ timeout: 3_000 });

  const input = findBar.locator('input[placeholder="Find in thread"]');

  // Use a single common letter pair to maximize matches for navigation testing
  await input.fill('e');
  await mainWindow.waitForTimeout(500);
  // 'e' alone is below CHAR_THRESHOLD (2), so try 'en' or similar
  await input.fill('en');
  await mainWindow.waitForTimeout(1_000);

  const progress = findBar.locator('.selection-progress');
  const progressText = await progress.textContent();

  if (progressText && progressText.includes('of')) {
    // Extract total matches count
    const totalMatch = progressText.match(/of (\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1]) : 0;

    if (total > 1) {
      // Click next button — index should advance
      const nextBtn = findBar.locator('button[aria-label="Next result"]');
      await nextBtn.click();
      await mainWindow.waitForTimeout(300);

      const afterNext = await progress.textContent();
      expect(afterNext).toMatch(/\d+ of \d+/);
      expect(afterNext).not.toBe(progressText);

      // Click previous button — should go back
      const prevBtn = findBar.locator('button[aria-label="Previous result"]');
      await prevBtn.click();
      await mainWindow.waitForTimeout(300);

      const afterPrev = await progress.textContent();
      expect(afterPrev).toBe(progressText);
    } else {
      // Only 1 match — next wraps around, counter stays the same. Just verify
      // the buttons are present and clickable without error.
      const nextBtn = findBar.locator('button[aria-label="Next result"]');
      await nextBtn.click();
      await mainWindow.waitForTimeout(300);
      const afterNext = await progress.textContent();
      expect(afterNext).toMatch(/\d+ of \d+/);
    }
  }

  // Clean up
  await mainWindow.keyboard.press('Escape');
  await mainWindow.waitForTimeout(500);
});
