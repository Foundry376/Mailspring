import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  threads,
  focusThread,
  openThread,
  findComposer,
  closeComposerWindows,
} from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test.afterEach(async () => {
  await closeComposerWindows(electronApp);
  await mainWindow.waitForTimeout(500);
});

// --- Message expand/collapse ---

test('opening a thread shows last message expanded and earlier messages collapsed', async () => {
  // Find a thread with multiple messages by looking at snippets
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  const allMessages = mainWindow.locator('.message-item-wrap');
  const messageCount = await allMessages.count();

  if (messageCount > 1) {
    // The last message should be expanded (no .collapsed class)
    const lastMessage = allMessages.last();
    await expect(lastMessage).not.toHaveClass(/collapsed/);

    // At least one earlier message should be collapsed
    const collapsedCount = await mainWindow.locator('.message-item-wrap.collapsed').count();
    expect(collapsedCount).toBeGreaterThan(0);

    // Collapsed messages show a snippet
    const snippet = mainWindow.locator('.message-item-wrap.collapsed .collapsed-snippet').first();
    await expect(snippet).toBeVisible();
  }
});

test('clicking a collapsed message expands it', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  const collapsed = mainWindow.locator('.message-item-wrap.collapsed').first();
  const collapsedExists = await collapsed.count();
  if (collapsedExists === 0) {
    // Skip if no collapsed messages (single-message thread)
    return;
  }

  // Click the collapsed message to expand it
  await collapsed.click();
  await mainWindow.waitForTimeout(500);

  // After clicking, the same element should no longer have .collapsed class.
  // Since the DOM re-renders, check that there's one fewer collapsed message.
  const expandedMessages = mainWindow.locator('.message-item-wrap:not(.collapsed)');
  const expandedCount = await expandedMessages.count();
  expect(expandedCount).toBeGreaterThanOrEqual(2);
});

test('clicking an expanded message header collapses it', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  const allMessages = mainWindow.locator('.message-item-wrap');
  const messageCount = await allMessages.count();

  if (messageCount <= 1) return;

  // Expand a collapsed message first
  const collapsedBefore = await mainWindow.locator('.message-item-wrap.collapsed').count();
  if (collapsedBefore > 0) {
    await mainWindow.locator('.message-item-wrap.collapsed').first().click();
    await mainWindow.waitForTimeout(500);
  }

  // Now find a non-last expanded message and click its header to collapse it
  // (The last message cannot be collapsed)
  const expanded = mainWindow.locator('.message-item-wrap:not(.collapsed)');
  const expandedCount = await expanded.count();
  if (expandedCount <= 1) return;

  // Click the header of the first expanded message (which is not the last)
  const firstExpandedHeader = expanded.first().locator('.message-header');
  await firstExpandedHeader.click();
  await mainWindow.waitForTimeout(500);

  // Should now be collapsed
  const newCollapsedCount = await mainWindow.locator('.message-item-wrap.collapsed').count();
  expect(newCollapsedCount).toBeGreaterThan(0);
});

// --- Expand/Collapse All toggle ---

test('clicking expand/collapse all button toggles all messages', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  const allMessages = mainWindow.locator('.message-item-wrap');
  const messageCount = await allMessages.count();
  if (messageCount <= 1) return; // need multiple messages to test toggle

  // There should be collapsed messages initially
  const collapsedBefore = await mainWindow.locator('.message-item-wrap.collapsed').count();
  if (collapsedBefore === 0) return; // need collapsed messages

  // The expand/collapse all button should be visible (canCollapse is true)
  const toggleButton = mainWindow.locator(
    '.message-icons-wrap [aria-label="Expand All"], .message-icons-wrap [aria-label="Collapse All"]'
  );
  await expect(toggleButton.first()).toBeVisible({ timeout: 3_000 });

  // Click to expand all
  const expandButton = mainWindow.locator('.message-icons-wrap [aria-label="Expand All"]');
  if ((await expandButton.count()) > 0) {
    await expandButton.click();
    await mainWindow.waitForTimeout(500);

    // All messages should now be expanded (no .collapsed class)
    const collapsedAfterExpand = await mainWindow.locator('.message-item-wrap.collapsed').count();
    expect(collapsedAfterExpand).toBe(0);

    // Now the button label should say "Collapse All"
    const collapseButton = mainWindow.locator('.message-icons-wrap [aria-label="Collapse All"]');
    await expect(collapseButton).toBeVisible({ timeout: 3_000 });

    // Click again to collapse all
    await collapseButton.click();
    await mainWindow.waitForTimeout(500);

    // Messages should be collapsed again (at least some)
    const collapsedAfterCollapse = await mainWindow.locator('.message-item-wrap.collapsed').count();
    expect(collapsedAfterCollapse).toBeGreaterThan(0);
  }
});

// --- Footer reply area ---

test('clicking footer reply area opens inline composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  const replyArea = mainWindow.locator('.footer-reply-area-wrap');
  await expect(replyArea).toBeVisible({ timeout: 3_000 });
  await replyArea.click();

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });
  await expect(composer.locator('.composer-participant-field').first()).toBeVisible();

  await composerPage!.keyboard.press('Meta+Escape');
});
