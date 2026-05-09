import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, executeInRenderer } from '../helpers';
import fs from 'fs';
import path from 'path';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());

  // Open preferences
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('Meta+,');
  await expect(mainWindow.locator('.preferences-wrap')).toBeVisible({ timeout: 5_000 });
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

/** Read the test config.json and return the parsed '*' block */
function readConfig(): any {
  const configPath = path.join(configDir, 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))['*'];
}

// --- Signatures ---

test('creating a signature persists it to config.json', async () => {
  await mainWindow.locator('.preferences-tabs .item:has-text("Signatures")').click();
  await mainWindow.waitForTimeout(500);

  // Click the + button to add a new signature
  const sigContainer = mainWindow.locator('.preferences-signatures-container');
  await expect(sigContainer).toBeVisible({ timeout: 3_000 });

  const addButton = sigContainer.locator('.signature-list .btn-editable-list').first();
  await addButton.click();
  await mainWindow.waitForTimeout(500);

  // A new "Untitled" signature should appear selected in the list
  const selectedItem = sigContainer.locator('.signature-list .list-item.selected');
  await expect(selectedItem).toBeVisible({ timeout: 3_000 });

  // Edit the signature title
  const titleInput = sigContainer.locator('#signature-title');
  await titleInput.fill('');
  await titleInput.type('Test Signature From Playwright');
  await mainWindow.waitForTimeout(500);

  // Fill in the Name field in the Information section
  const nameField = sigContainer.locator('.section.information #name');
  if (await nameField.count() > 0) {
    await nameField.fill('');
    await nameField.type('Jane Doe');
    await mainWindow.waitForTimeout(500);
  }

  // Verify the signature was persisted to config.json
  const config = readConfig();
  expect(config.signatures).toBeDefined();

  const signatures = config.signatures;
  const sigEntries = Object.values(signatures) as any[];
  const testSig = sigEntries.find(s => s.title === 'Test Signature From Playwright');
  expect(testSig).toBeDefined();
  expect(testSig.body).toBeTruthy();
  if (await nameField.count() > 0) {
    expect(testSig.data.name).toBe('Jane Doe');
  }
});

// --- Templates ---

test('creating a template persists it as an HTML file and renaming updates the file', async () => {
  await mainWindow.locator('.preferences-tabs .item:has-text("Templates")').click();
  await mainWindow.waitForTimeout(500);

  const templatesContainer = mainWindow.locator('.preferences-templates-container');
  await expect(templatesContainer).toBeVisible({ timeout: 3_000 });

  // Click the + button to create a new template
  const addButton = templatesContainer.locator('.template-list .btn-editable-list').first();
  await addButton.click();
  await mainWindow.waitForTimeout(1_000);

  // An "Untitled" template file should be created in the templates directory
  const templatesDir = path.join(configDir, 'templates');
  expect(fs.existsSync(templatesDir)).toBe(true);

  const files = fs.readdirSync(templatesDir);
  const untitledFile = files.find(f => f.toLowerCase().startsWith('untitled'));
  expect(untitledFile).toBeDefined();

  // Read the file and verify it has content
  const filePath = path.join(templatesDir, untitledFile!);
  const contents = fs.readFileSync(filePath, 'utf-8');
  expect(contents.length).toBeGreaterThan(0);

  // Rename the template via Actions.renameTemplate dispatched through the renderer.
  // Directly calling the action is more reliable than triggering onBlur, because
  // clicking elsewhere changes the selected template before blur fires.
  await executeInRenderer(electronApp, `
    (function() {
      var Actions = require('mailspring-exports').Actions;
      Actions.renameTemplate('Untitled', 'My Test Template');
    })()
  `);

  // Wait for the async fs.rename + file watcher re-populate cycle (poll up to 5s)
  const renamedPath = path.join(templatesDir, 'My Test Template.html');
  const deadline = Date.now() + 5_000;
  let found = false;
  while (Date.now() < deadline) {
    if (fs.existsSync(renamedPath)) {
      found = true;
      break;
    }
    await mainWindow.waitForTimeout(300);
  }
  expect(found).toBe(true);

  // Verify the list item was updated in the UI
  const renamedItem = templatesContainer.locator('.template-list .list-item:has-text("My Test Template")');
  await expect(renamedItem).toBeVisible({ timeout: 3_000 });
});

// --- Mail Rules ---

test('creating a mail rule persists it to localStorage', async () => {
  await mainWindow.locator('.preferences-tabs .item:has-text("Mail Rules")').click();
  await mainWindow.waitForTimeout(500);

  const rulesContainer = mainWindow.locator('.container-mail-rules');
  await expect(rulesContainer).toBeVisible({ timeout: 3_000 });

  // Create a new rule — either via the empty state button or the + button
  const emptyButton = rulesContainer.locator('.empty-list .btn:has-text("Create a new Rule")');
  const addButton = rulesContainer.locator('.rule-list .btn-editable-list').first();

  if (await emptyButton.count() > 0) {
    await emptyButton.click();
  } else {
    await addButton.click();
  }
  await mainWindow.waitForTimeout(500);

  // A new "Untitled Rule" should appear and be selected
  const selectedItem = rulesContainer.locator('.rule-list .list-item.selected');
  await expect(selectedItem).toBeVisible({ timeout: 3_000 });

  // The rule detail panel should show condition and action editors
  const ruleDetail = rulesContainer.locator('.rule-detail .inner');
  await expect(ruleDetail).toBeVisible({ timeout: 3_000 });

  // Edit the condition: set the value input to a test email
  const conditionInput = ruleDetail.locator('.well-matchers input[type="text"]').first();
  if (await conditionInput.count() > 0) {
    await conditionInput.fill('test@example.com');
    await mainWindow.waitForTimeout(500);
  }

  // Verify the rule was persisted to localStorage (debounced 1s save)
  await mainWindow.waitForTimeout(1_500);

  const rules = await executeInRenderer(electronApp, `
    (function() {
      var raw = window.localStorage.getItem('MailRules-V2');
      return raw ? JSON.parse(raw) : [];
    })()
  `);

  expect(rules.length).toBeGreaterThan(0);
  const newRule = rules.find((r: any) => r.name === 'Untitled Rule');
  expect(newRule).toBeDefined();
  expect(newRule.conditions).toBeDefined();
  expect(newRule.conditions.length).toBeGreaterThan(0);
  expect(newRule.actions).toBeDefined();
  expect(newRule.actions.length).toBeGreaterThan(0);

  // If we set a condition value, verify it was saved
  if (await conditionInput.count() > 0) {
    const conditionValue = newRule.conditions[0].value;
    expect(conditionValue).toBe('test@example.com');
  }
});
