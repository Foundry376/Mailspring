import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  focusThread,
  openThread,
  executeInRenderer,
  clickSidebarFolder,
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

// ─── Visual regression snapshots ────────────────────────────────────────────
//
// Captures a screenshot for each combination of theme × layout mode.
// Playwright's toHaveScreenshot() stores baselines on first run and
// compares on subsequent runs. To update baselines after intentional
// UI changes, run:
//
//   npx playwright test visual-snapshots --update-snapshots
//

const themes = ['ui-light', 'ui-dark'] as const;
const layouts = ['split', 'list', 'splitVertical'] as const;

async function setThemeAndLayout(theme: string, layout: string) {
  // Theme: setting core.theme triggers ThemeManager's config observer,
  // which recompiles all LESS stylesheets against the new theme.
  // Layout: WorkspaceStore only reads core.workspace.mode at construction,
  // so we must call _onSelectLayoutMode() directly to switch at runtime.
  await executeInRenderer(
    electronApp,
    `(function() {
      AppEnv.config.set('core.theme', '${theme}');
      var WorkspaceStore = require('mailspring-exports').WorkspaceStore;
      WorkspaceStore._onSelectLayoutMode('${layout}');
    })()`
  );

  // Theme change triggers LESS recompilation for all stylesheets — wait for it
  await mainWindow.waitForTimeout(3_000);

  // Verify the theme class was applied to <body>
  const bodyClass = await mainWindow.locator('body').getAttribute('class');
  expect(bodyClass).toContain(`theme-${theme}`);
}

for (const theme of themes) {
  for (const layout of layouts) {
    test(`visual: ${theme} / ${layout}`, async () => {
      await setThemeAndLayout(theme, layout);

      // Start from inbox so we have a consistent thread list
      await clickSidebarFolder(mainWindow, 'Inbox');
      await mainWindow.waitForTimeout(1_000);

      // Open a thread to show maximum UI surface:
      // - split / splitVertical: sidebar + thread list + reading pane
      // - list: navigates into thread detail (full-screen reading pane)
      await openThread(mainWindow, 0);
      await mainWindow.waitForTimeout(500);

      await expect(mainWindow).toHaveScreenshot(`${theme}-${layout}.png`, {
        maxDiffPixelRatio: 0.01,
      });
    });
  }
}
