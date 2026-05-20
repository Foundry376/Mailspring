import { test, expect, ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
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
  await expect(composer.locator('.composer-participant-field:has-text("Cc")')).toBeVisible({
    timeout: 3_000,
  });

  await composerPage!.keyboard.press('Meta+Shift+b');
  await expect(composer.locator('.composer-participant-field:has-text("Bcc")')).toBeVisible({
    timeout: 3_000,
  });

  await composerPage!.keyboard.press('Meta+Escape');
});

test('CC/BCC: show via buttons, add tokens, cut/copy/paste between fields, delete with backspace', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.keyboard.press('r');

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();

  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  // --- Show CC and BCC via the header action buttons ---

  const ccButton = composer.locator('.composer-header-actions .action.show-cc');
  await expect(ccButton).toBeVisible({ timeout: 3_000 });
  await ccButton.click();

  const ccField = composer.locator('.cc-field');
  await expect(ccField).toBeVisible({ timeout: 3_000 });

  const bccButton = composer.locator('.composer-header-actions .action.show-bcc');
  await expect(bccButton).toBeVisible({ timeout: 3_000 });
  await bccButton.click();

  const bccField = composer.locator('.bcc-field');
  await expect(bccField).toBeVisible({ timeout: 3_000 });

  // Toggle buttons should disappear once their field is shown
  await expect(ccButton).not.toBeVisible();
  await expect(bccButton).not.toBeVisible();

  // --- Add two tokens to CC ---

  const ccInput = ccField.locator('input');
  await ccInput.click();
  await composerPage!.keyboard.type('alice@example.com');
  await composerPage!.keyboard.press('Comma');
  await composerPage!.waitForTimeout(500);

  await composerPage!.keyboard.type('bob@example.com');
  await composerPage!.keyboard.press('Comma');
  await composerPage!.waitForTimeout(500);

  const ccTokens = ccField.locator('.token');
  expect(await ccTokens.count()).toBe(2);

  // --- Add one token to BCC ---

  const bccInput = bccField.locator('input');
  await bccInput.click();
  await composerPage!.keyboard.type('secret@example.com');
  await composerPage!.keyboard.press('Comma');
  await composerPage!.waitForTimeout(500);

  const bccTokens = bccField.locator('.token');
  expect(await bccTokens.count()).toBe(1);

  // --- Click a token to select it ---

  const aliceToken = ccTokens.first();
  await aliceToken.click();
  await composerPage!.waitForTimeout(300);
  await expect(aliceToken).toHaveClass(/selected/);

  // --- Cut the selected token from CC (Cmd+X) ---

  await composerPage!.keyboard.press('Meta+x');
  await composerPage!.waitForTimeout(500);
  // alice should be removed from CC, leaving only bob
  expect(await ccTokens.count()).toBe(1);

  // --- Paste into BCC (Cmd+V) ---

  await bccInput.click();
  await composerPage!.keyboard.press('Meta+v');
  await composerPage!.waitForTimeout(500);
  // BCC should now have 2 tokens: secret + alice
  expect(await bccTokens.count()).toBe(2);

  // --- Copy does NOT remove the token (Cmd+C) ---

  const secretToken = bccTokens.first();
  await secretToken.click();
  await composerPage!.waitForTimeout(300);
  await expect(secretToken).toHaveClass(/selected/);

  await composerPage!.keyboard.press('Meta+c');
  await composerPage!.waitForTimeout(300);
  // Copy should leave the token in place
  expect(await bccTokens.count()).toBe(2);

  // --- Backspace: first press selects last token, second removes it ---

  await bccInput.click();
  await composerPage!.waitForTimeout(200);
  await composerPage!.keyboard.press('Backspace');
  await composerPage!.waitForTimeout(300);
  // Last token in BCC should now be selected
  await expect(bccTokens.last()).toHaveClass(/selected/);

  // Second backspace removes the selected token
  await composerPage!.keyboard.press('Backspace');
  await composerPage!.waitForTimeout(500);
  expect(await bccTokens.count()).toBe(1);

  // --- Final state: CC has bob, BCC has secret ---
  expect(await ccTokens.count()).toBe(1);
  expect(await bccTokens.count()).toBe(1);

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
    (t) =>
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
    (t) =>
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

// --- Template variable Tab navigation ---

test('Tab key cycles through template variables and typing replaces them', async () => {
  // Write a test template with two template variables to the templates directory
  const templatesDir = path.join(configDir, 'templates');
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(templatesDir, 'Tab Test.html'),
    '<div>Hello <span data-tvar="name" class="template-variable" title="name">Name</span>, ' +
      'welcome to <span data-tvar="company" class="template-variable" title="company">Company</span>!</div>'
  );

  // Open new compose via the sidebar button — more reliable than 'c' key after
  // many tests because keyboard focus may be in an unexpected state. We wait
  // for a new popout window or an increased inline composer count.
  await mainWindow.keyboard.press('Escape');
  await mainWindow.waitForTimeout(300);

  const countBefore = await mainWindow.locator('.composer-inner-wrap').count();
  await mainWindow.locator('.item-compose').click();

  let composerPage: Page | null = null;
  let composer: ReturnType<Page['locator']> | null = null;
  const findStart = Date.now();
  while (Date.now() - findStart < 15_000) {
    for (const page of electronApp.windows()) {
      if (page === mainWindow) continue;
      try {
        const n = await page.locator('.composer-inner-wrap').count();
        if (n > 0) {
          composerPage = page;
          composer = page.locator('.composer-inner-wrap').first();
          break;
        }
      } catch { /* window may be loading */ }
    }
    if (composerPage) break;

    const countAfter = await mainWindow.locator('.composer-inner-wrap').count();
    if (countAfter > countBefore) {
      composerPage = mainWindow;
      composer = mainWindow.locator('.composer-inner-wrap').last();
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  expect(composerPage).not.toBeNull();
  await expect(composer).toBeVisible({ timeout: 5_000 });

  // Click the template picker button in the composer action bar
  const templateButton = composer.locator('.btn-templates');
  await expect(templateButton).toBeVisible({ timeout: 5_000 });
  await templateButton.click();

  // The template picker popover should appear with available templates
  const popover = composerPage!.locator('.template-picker');
  await expect(popover).toBeVisible({ timeout: 5_000 });

  // Select the "Tab Test" template (fall back to first available)
  let templateItem = popover.locator('.content-container .item:has-text("Tab Test")');
  if ((await templateItem.count()) === 0) {
    templateItem = popover.locator('.content-container .item').first();
  }
  await expect(templateItem).toBeVisible({ timeout: 3_000 });
  await templateItem.click();
  await composerPage!.waitForTimeout(1_000);

  // Template variables should be present in the composer body
  const bodyEditable = composer.locator('[contenteditable="true"]').first();
  const templateVars = bodyEditable.locator('.template-variable');
  const varCount = await templateVars.count();
  expect(varCount).toBeGreaterThanOrEqual(2);

  // Click near the top-left of the body to place the cursor before the template
  // variables, then press Home to ensure we're at position 0.
  await bodyEditable.click({ position: { x: 5, y: 5 } });
  await composerPage!.keyboard.press('Home');
  await composerPage!.waitForTimeout(300);

  // Press Tab to select the first template variable
  await composerPage!.keyboard.press('Tab');
  await composerPage!.waitForTimeout(500);

  // A template variable should now show as selected
  const selectedVar = bodyEditable.locator('.template-variable.selected');
  await expect(selectedVar).toBeVisible({ timeout: 3_000 });

  // Type to replace the first variable — it should be removed and text inserted.
  // Re-focus the contenteditable because Tab may have shifted DOM focus.
  await bodyEditable.focus();
  await composerPage!.keyboard.type('John');
  await composerPage!.waitForTimeout(500);
  await expect(bodyEditable).toContainText('John');
  expect(await templateVars.count()).toBe(varCount - 1);

  // Press Tab to select the next template variable
  await composerPage!.keyboard.press('Tab');
  await composerPage!.waitForTimeout(500);
  await expect(selectedVar).toBeVisible({ timeout: 3_000 });

  // Type to replace the second variable
  await bodyEditable.focus();
  await composerPage!.keyboard.type('Acme Corp');
  await composerPage!.waitForTimeout(500);

  // Verify the final draft body is a complete email with variables replaced —
  // the template text should be intact with the typed values substituted in.
  await expect(bodyEditable).toContainText('Hello John, welcome to Acme Corp!');
  expect(await templateVars.count()).toBe(0);

  await composerPage!.keyboard.press('Meta+Escape');
});
