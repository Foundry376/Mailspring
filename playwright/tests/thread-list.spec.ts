import { test, expect, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import {
  launchApp,
  closeApp,
  threads,
  focusThread,
  openThread,
  threadSubject,
  clickSidebarFolder,
  findComposer,
  closeComposerWindows,
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

// --- Thread list navigation ---

test('thread list shows multiple threads', async () => {
  const count = await threads(mainWindow).count();
  expect(count).toBeGreaterThan(5);
});

test('clicking a thread focuses it', async () => {
  const thread = await focusThread(mainWindow);
  await expect(thread).toHaveClass(/focused/, { timeout: 3_000 });
});

test('j/k navigate between threads (Gmail shortcuts)', async () => {
  const items = threads(mainWindow);
  await focusThread(mainWindow, 0);
  await expect(items.first()).toHaveClass(/focused/);

  await mainWindow.keyboard.press('j');
  await expect(items.nth(1)).toHaveClass(/focused/, { timeout: 2_000 });

  await mainWindow.keyboard.press('k');
  await expect(items.first()).toHaveClass(/focused/, { timeout: 2_000 });
});

test('arrow keys navigate between threads', async () => {
  const items = threads(mainWindow);
  await focusThread(mainWindow, 0);

  await mainWindow.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toHaveClass(/focused/, { timeout: 2_000 });

  await mainWindow.keyboard.press('ArrowUp');
  await expect(items.first()).toHaveClass(/focused/, { timeout: 2_000 });
});

// --- Star / Unstar ---

test('s toggles star and creates a ChangeStarredTask', async () => {
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('s');

  const task = await waitForCapturedTask(mainWindow, t => t.__cls === 'ChangeStarredTask');
  expect(task).not.toBeNull();
  expect(task.threadIds.length).toBeGreaterThan(0);
});

// --- Open thread (split view) ---

test('o / Enter opens thread in message list (split view)', async () => {
  await focusThread(mainWindow, 0);
  await mainWindow.keyboard.press('o');
  await expect(mainWindow.locator('#message-list')).toBeVisible({ timeout: 5_000 });
  await expect(mainWindow.locator('.message-item-wrap')).toBeVisible({ timeout: 5_000 });
});

test('message list shows reply area at bottom', async () => {
  await expect(mainWindow.locator('.footer-reply-area-wrap')).toBeVisible({ timeout: 5_000 });
});

// --- Go back to thread list ---

test('u returns to thread list from message view', async () => {
  await focusThread(mainWindow, 0);
  await mainWindow.keyboard.press('u');
  await expect(mainWindow.locator('.thread-list')).toBeVisible();
});

// --- Archive ---

test('e archives focused thread and creates a task', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await focusThread(mainWindow, 0);
  await clearCapturedTasks(electronApp);

  await mainWindow.keyboard.press('e');

  const task = await waitForCapturedTask(
    mainWindow,
    t => t.__cls === 'ChangeFolderTask' || t.__cls === 'ChangeLabelsTask'
  );
  expect(task).not.toBeNull();
});

// --- Reply / Forward ---
// These use inline reply (not popout), which requires mailsync to persist
// the draft to the database so the message-list can render it.

test.skip('r opens reply composer', async () => {
  await mainWindow.keyboard.press('r');
  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap');
  await expect(composer).toBeVisible({ timeout: 5_000 });
  await expect(composer.locator('.composer-participant-field')).toBeVisible();

  await composerPage!.keyboard.press('Meta+Escape');
  await closeComposerWindows(electronApp);
});

test.skip('a opens reply-all composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('a');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
  await expect(composerPage!.locator('.composer-inner-wrap')).toBeVisible({ timeout: 5_000 });

  await composerPage!.keyboard.press('Meta+Escape');
  await closeComposerWindows(electronApp);
});

test.skip('f opens forward composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('f');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
  await expect(composerPage!.locator('.composer-inner-wrap')).toBeVisible({ timeout: 5_000 });

  await composerPage!.keyboard.press('Meta+Escape');
  await closeComposerWindows(electronApp);
});

// --- Sidebar folder navigation ---

test('clicking sidebar folders switches thread list', async () => {
  await clickSidebarFolder(mainWindow, 'Sent');
  await mainWindow.waitForTimeout(1_000);

  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(1_000);
  await expect(threads(mainWindow).first()).toBeVisible();
});

// --- Screenshots ---

test('capture thread list screenshot', async () => {
  const dir = path.join(__dirname, '..', 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  try {
    await mainWindow.screenshot({
      path: path.join(dir, 'thread-list.png'),
    });
  } catch (e) {
    // Ignore transient Playwright protocol errors from dialog mocking
    if (!`${e}`.includes('handleJavaScriptDialog')) throw e;
  }
});
