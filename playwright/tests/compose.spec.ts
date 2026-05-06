import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  openThread,
  findComposer,
  closeComposerWindows,
} from '../helpers';

// Popout compose tests (c key, compose button) work without mailsync
// because waitForPerformLocal is bypassed via PLAYWRIGHT env var and the
// draft JSON is passed directly to the composer window.
//
// Inline reply tests (r, a, f) are still skipped because the draft must
// be persisted to the database by mailsync for the message-list to
// render the inline composer.

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
  // Wait for windows to fully close before the next test
  await mainWindow.waitForTimeout(500);
});

// --- Compose new message (Gmail shortcut: c) ---

test('c opens new message composer', async () => {
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('c');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
  await expect(composerPage!.locator('.composer-participant-field').first()).toBeVisible();
});

// --- Compose via toolbar button ---

test('clicking compose button opens composer', async () => {
  await mainWindow.locator('.item-compose').click();

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
  await expect(composerPage!.locator('.composer-inner-wrap').first()).toBeVisible();
});

// --- Inline reply compose ---

test.skip('reply composer has correct structure', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap');
  await expect(composer).toBeVisible({ timeout: 5_000 });
  await expect(composer.locator('.composer-participant-field').first()).toBeVisible();
  await expect(composer.locator('[contenteditable], .composer-body-wrap').first()).toBeVisible();
  await expect(composer.locator('.btn-send')).toBeVisible();

  await composerPage!.keyboard.press('Meta+Escape');
});

test.skip('can type in composer body', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap');
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();
  await composerPage!.keyboard.type('Hello, this is a test reply from Playwright!');
  await expect(bodyEditable).toContainText('Hello, this is a test reply from Playwright!');

  await composerPage!.keyboard.press('Meta+Escape');
});

test.skip('Cmd+Shift+C shows CC field', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap');
  await expect(composer).toBeVisible({ timeout: 5_000 });

  await composerPage!.keyboard.press('Meta+Shift+c');
  await expect(composer.locator('.composer-participant-field:has-text("Cc")')).toBeVisible({ timeout: 3_000 });

  await composerPage!.keyboard.press('Meta+Shift+b');
  await expect(composer.locator('.composer-participant-field:has-text("Bcc")')).toBeVisible({ timeout: 3_000 });

  await composerPage!.keyboard.press('Meta+Escape');
});

// --- Rich text formatting ---

test.skip('Cmd+B toggles bold in composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap');
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  await composerPage!.keyboard.press('Meta+b');
  await composerPage!.keyboard.type('Bold text');
  await composerPage!.keyboard.press('Meta+b');
  await composerPage!.keyboard.type(' normal text');

  await expect(bodyEditable).toContainText('Bold text normal text');

  await composerPage!.keyboard.press('Meta+Escape');
});

// --- Shortcut isolation: single-key shortcuts should NOT fire in composer ---

test.skip('typing in composer does not trigger Gmail shortcuts', async () => {
  await openThread(mainWindow, 0);

  const subjectLocator = mainWindow.locator('.thread-list .list-item.focused .subject');
  const subjectBefore = await subjectLocator.textContent();

  await mainWindow.keyboard.press('r');
  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap');
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  // Type text with characters that are Gmail shortcuts:
  // 'e' = archive, 's' = star, 'r' = reply, 'f' = forward, 'a' = reply-all
  await composerPage!.keyboard.type('searching for answers');

  await expect(bodyEditable).toContainText('searching for answers');

  const subjectAfter = await subjectLocator.textContent();
  expect(subjectAfter).toBe(subjectBefore);

  await composerPage!.keyboard.press('Meta+Escape');
});
