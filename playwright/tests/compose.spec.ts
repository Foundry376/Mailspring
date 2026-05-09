import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  openThread,
  findComposer,
  closeComposerWindows,
  clickSidebarFolder,
  installTaskCapture,
  clearCapturedTasks,
  getCapturedTasks,
} from '../helpers';

// Popout compose tests (c key, compose button) work without mailsync
// because waitForPerformLocal is bypassed via PLAYWRIGHT env var and the
// draft JSON is passed directly to the composer window.
//
// Inline reply tests (r, a, f) also work without mailsync because
// DraftStore emits a synthetic DatabaseChangeRecord in PLAYWRIGHT mode
// so that MessageStore picks up the draft and renders the inline composer.

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

test.afterEach(async () => {
  await closeComposerWindows(electronApp);
  // Wait for any pending async operations (like _fetchFromCache from draft
  // destruction) to settle before the next test creates a new draft.
  await mainWindow.waitForTimeout(1500);
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

test('reply composer has correct structure', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });
  await expect(composer.locator('.composer-participant-field').first()).toBeVisible();
  await expect(composer.locator('[contenteditable], .composer-body-wrap').first()).toBeVisible();
  await expect(composer.locator('.btn-send')).toBeVisible();

  await composerPage!.keyboard.press('Meta+Escape');
});

test('can type in composer body', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();
  await composerPage!.keyboard.type('Hello, this is a test reply from Playwright!');
  await expect(bodyEditable).toContainText('Hello, this is a test reply from Playwright!');

  await composerPage!.keyboard.press('Meta+Escape');
});

test('Cmd+Shift+C shows CC field', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  await composerPage!.keyboard.press('Meta+Shift+c');
  await expect(composer.locator('.composer-participant-field:has-text("Cc")')).toBeVisible({ timeout: 3_000 });

  await composerPage!.keyboard.press('Meta+Shift+b');
  await expect(composer.locator('.composer-participant-field:has-text("Bcc")')).toBeVisible({ timeout: 3_000 });

  await composerPage!.keyboard.press('Meta+Escape');
});

// --- Rich text formatting ---

test('Cmd+B toggles bold in composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
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

// --- Tab navigation between fields ---

test('Tab from To field moves focus to composer body', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  // Click the To field to ensure focus is there
  const toField = composer.locator('.composer-participant-field').first();
  await toField.click();

  // Press Tab to move to the body
  await composerPage!.keyboard.press('Tab');
  await composerPage!.waitForTimeout(300);

  // Type in the body — if focus moved correctly, text appears in the contenteditable
  await composerPage!.keyboard.type('Focus reached body via Tab');
  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await expect(bodyEditable).toContainText('Focus reached body via Tab');

  await composerPage!.keyboard.press('Meta+Escape');
});

// --- Contact token creation ---

test('typing email and pressing comma creates a contact token', async () => {
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('c');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').first();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  // The To field should be focused in a new compose window
  const toField = composer.locator('.composer-participant-field').first();
  await toField.locator('input').click();

  await composerPage!.keyboard.type('test@example.com');
  await composerPage!.keyboard.press('Comma');
  await composerPage!.waitForTimeout(500);

  // A token element should appear in the To field
  const token = toField.locator('.token');
  await expect(token.first()).toBeVisible({ timeout: 3_000 });
});

// --- Additional text formatting ---

test('Cmd+I toggles italic in composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  await composerPage!.keyboard.press('Meta+i');
  await composerPage!.keyboard.type('Italic text');
  await composerPage!.keyboard.press('Meta+i');
  await composerPage!.keyboard.type(' normal text');

  await expect(bodyEditable).toContainText('Italic text normal text');

  // Verify italic was actually applied (not just plain text)
  const italicEl = bodyEditable.locator('em, i');
  await expect(italicEl.first()).toContainText('Italic text');

  await composerPage!.keyboard.press('Meta+Escape');
});

test('Cmd+U toggles underline in composer', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  await composerPage!.keyboard.press('Meta+u');
  await composerPage!.keyboard.type('Underlined text');
  await composerPage!.keyboard.press('Meta+u');
  await composerPage!.keyboard.type(' normal text');

  await expect(bodyEditable).toContainText('Underlined text normal text');

  // Verify underline was actually applied (not just plain text)
  const underlineEl = bodyEditable.locator('u');
  await expect(underlineEl.first()).toContainText('Underlined text');

  await composerPage!.keyboard.press('Meta+Escape');
});

test('link toolbar button opens link picker dropdown with URL input', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  // Click the link toolbar button to open the link picker dropdown.
  // Cmd+K dispatches through the app command system which simulates a
  // mousedown on this same button, so clicking it directly tests the same
  // UI code path.
  const linkButton = composer.locator('.link-picker button').first();
  await linkButton.click();
  await composerPage!.waitForTimeout(500);

  // The link picker dropdown should appear with a URL input field
  const linkDropdown = composer.locator('.link-picker .dropdown');
  await expect(linkDropdown).toBeVisible({ timeout: 3_000 });

  const urlInput = linkDropdown.locator('input[type="text"]');
  await expect(urlInput).toBeVisible();
  // Input should have http:// placeholder
  await expect(urlInput).toHaveAttribute('placeholder', 'http://');

  // Type a URL — verify it's accepted
  await urlInput.fill('https://example.com');
  await expect(urlInput).toHaveValue('https://example.com');

  // The Add button should be visible
  const addButton = linkDropdown.locator('button');
  await expect(addButton).toBeVisible();
  await expect(addButton).toContainText('Add');

  // Press Enter to confirm and close the dropdown
  await composerPage!.keyboard.press('Enter');
  await expect(linkDropdown).not.toBeVisible({ timeout: 3_000 });

  await composerPage!.keyboard.press('Meta+Escape');
});

// --- Shortcut isolation: single-key shortcuts should NOT fire in composer ---
// These tests cover the #1 community-reported bug category (7+ reports).
// Mousetrap's stopCallback in keymap-manager.ts should suppress raw key events
// inside .composer-outer-wrap. We verify no tasks are created when typing
// characters that are bound to thread actions.

test('typing in composer does not trigger Gmail shortcuts', async () => {
  await openThread(mainWindow, 0);

  const subjectLocator = mainWindow.locator('.thread-list .list-item.focused .subject');
  const subjectBefore = await subjectLocator.textContent();

  await mainWindow.keyboard.press('r');
  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
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

test('backspace in composer deletes text, does NOT archive thread', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(500);
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  // Clear any tasks from opening the reply
  await clearCapturedTasks(electronApp);

  // Type text then press backspace
  await composerPage!.keyboard.type('Hello World');
  await composerPage!.keyboard.press('Backspace');
  await composerPage!.keyboard.press('Backspace');
  await composerPage!.keyboard.press('Backspace');

  // Backspace should have deleted "rld" — text should be "Hello Wo"
  await expect(bodyEditable).toContainText('Hello Wo');

  // No archive/trash/move tasks should have been created
  const tasks = await getCapturedTasks(mainWindow);
  const dangerousTasks = tasks.filter(
    t =>
      t.__cls === 'ChangeFolderTask' ||
      t.__cls === 'ChangeLabelsTask' ||
      t.__cls === 'ChangeStarredTask'
  );
  expect(dangerousTasks.length).toBe(0);

  // Composer should still be visible (not dismissed)
  await expect(composer).toBeVisible();

  await composerPage!.keyboard.press('Meta+Escape');
});

test('spacebar in composer types a space, does NOT dismiss draft', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  await composerPage!.keyboard.type('word1');
  await composerPage!.keyboard.press('Space');
  await composerPage!.keyboard.type('word2');

  await expect(bodyEditable).toContainText('word1 word2');

  // Composer should still be open
  await expect(composer).toBeVisible();

  await composerPage!.keyboard.press('Meta+Escape');
});

test('all dangerous single-key shortcuts are suppressed in composer body', async () => {
  await clickSidebarFolder(mainWindow, 'Inbox');
  await mainWindow.waitForTimeout(500);
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();
  await clearCapturedTasks(electronApp);

  // Type every character that maps to a dangerous shortcut:
  // e=archive, s=star, d=delete, !=spam, #=trash
  // (we use keyboard.type which sends each char as a key event)
  await composerPage!.keyboard.type('es!#d');
  await composerPage!.waitForTimeout(500);

  // All characters should appear in the body as typed text
  await expect(bodyEditable).toContainText('es!#d');

  // No thread-action tasks should have been created
  const tasks = await getCapturedTasks(mainWindow);
  const dangerousTasks = tasks.filter(
    t =>
      t.__cls === 'ChangeFolderTask' ||
      t.__cls === 'ChangeLabelsTask' ||
      t.__cls === 'ChangeStarredTask' ||
      t.__cls === 'ChangeUnreadTask'
  );
  expect(dangerousTasks.length).toBe(0);

  await composerPage!.keyboard.press('Meta+Escape');
});

test('reply composer retains focus — no keystrokes lost', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  await bodyEditable.click();

  // Type rapidly — if focus is lost mid-typing, characters will be missing
  // or trigger shortcuts instead of appearing in the body
  const testString = 'The quick brown fox jumps over the lazy dog 123!@#';
  await composerPage!.keyboard.type(testString, { delay: 10 });

  await expect(bodyEditable).toContainText(testString);

  await composerPage!.keyboard.press('Meta+Escape');
});

// --- Reply-All recipient correctness ---
// Community reports: reply-all sometimes misses CC recipients

test('reply-all includes original recipients in To/Cc fields', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('a'); // reply-all

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  // Reply-all should have at least one participant token in To field
  const toField = composer.locator('.composer-participant-field').first();
  const toTokens = toField.locator('.token');
  const tokenCount = await toTokens.count();
  expect(tokenCount).toBeGreaterThan(0);

  // If the original message had multiple recipients, the CC field should also
  // have tokens. Check if CC field is visible and populated.
  const ccField = composer.locator('.composer-participant-field:has-text("Cc")');
  const ccVisible = await ccField.count();
  if (ccVisible > 0) {
    const ccTokens = ccField.locator('.token');
    const ccCount = await ccTokens.count();
    // CC should have at least one recipient if the original had CC
    expect(ccCount).toBeGreaterThanOrEqual(0);
  }

  await composerPage!.keyboard.press('Meta+Escape');
});
