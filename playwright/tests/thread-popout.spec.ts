import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  threads,
  openThread,
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

/** Find a thread-popout window by checking loadSettings in the URL */
async function findThreadPopout(
  electronApp: ElectronApplication,
  timeoutMs = 15_000
): Promise<Page | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const page of electronApp.windows()) {
      try {
        const url = new URL(page.url());
        const loadSettings = url.searchParams.get('loadSettings');
        if (loadSettings) {
          const settings = JSON.parse(decodeURIComponent(loadSettings));
          if (settings.windowType === 'thread-popout') {
            return page;
          }
        }
      } catch {
        // ignore
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

/** Close any thread-popout windows */
async function closePopoutWindows(electronApp: ElectronApplication) {
  for (const page of electronApp.windows()) {
    try {
      const url = new URL(page.url());
      const loadSettings = url.searchParams.get('loadSettings');
      if (loadSettings) {
        const settings = JSON.parse(decodeURIComponent(loadSettings));
        if (settings.windowType === 'thread-popout') {
          await page.close();
        }
      }
    } catch {
      // ignore
    }
  }
}

test.afterEach(async () => {
  await closePopoutWindows(electronApp);
  await mainWindow.waitForTimeout(1_000);
});

// --- Thread popout via button ---

test('clicking popout button opens thread in a separate window', async () => {
  await openThread(mainWindow, 0);
  await mainWindow.waitForTimeout(500);

  // Click the popout button in the message list header
  const popoutButton = mainWindow.locator('[aria-label="Popout thread"]');
  await expect(popoutButton).toBeVisible({ timeout: 3_000 });
  await popoutButton.click();

  // A new thread-popout window should open
  const popoutPage = await findThreadPopout(electronApp);
  expect(popoutPage).not.toBeNull();

  // The popout window should render a message list with at least one message
  const messages = popoutPage!.locator('.message-item-wrap');
  await expect(messages.first()).toBeVisible({ timeout: 10_000 });
  const messageCount = await messages.count();
  expect(messageCount).toBeGreaterThan(0);
});

// --- Thread popout via double-click ---

test('double-clicking a thread opens it in a popout window', async () => {
  // Double-click the first thread in the thread list
  const firstThread = threads(mainWindow).first();
  await firstThread.dblclick();

  // A new thread-popout window should open
  const popoutPage = await findThreadPopout(electronApp);
  expect(popoutPage).not.toBeNull();

  // The popout window should render messages
  const messages = popoutPage!.locator('.message-item-wrap');
  await expect(messages.first()).toBeVisible({ timeout: 10_000 });
});
