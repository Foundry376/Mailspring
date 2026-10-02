import { test, expect, ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { launchApp, closeApp, findComposer, closeComposerWindows } from '../helpers';

// Exercises every clipboard code path the app owns, against the real system
// clipboard: the main-process `clipboard` module (Electron 44's promise-based,
// ClipboardItem API), the renderer paste handlers in both composer editors
// (text, HTML, image blobs, and files copied in Finder/Explorer), and the
// `write-image-to-clipboard` IPC + `@electron/remote` writes behind the message
// context menus.
//
// Each test seeds the clipboard from the main process and then performs a real
// Cmd+V in the composer, so a regression anywhere in the chain fails the test.

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;
let fixtureDir: string;

// A 1x1 red PNG.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

/** Replace the system clipboard with the given MIME → text payloads. */
async function writeClipboardText(items: Record<string, string>) {
  await electronApp.evaluate(async ({ clipboard, ClipboardItem }, data) => {
    await clipboard.write([new ClipboardItem(data)]);
  }, items);
}

/**
 * Replace the system clipboard with a screenshot-sized PNG. Noise keeps the PNG
 * above the 512-byte floor `Utils.shouldDisplayAsImage` uses for inlining.
 */
async function writeClipboardImage() {
  await electronApp.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const size = 64;
    const bitmap = Buffer.alloc(size * size * 4);
    for (let i = 0; i < bitmap.length; i++) bitmap[i] = Math.floor(Math.random() * 256);
    const png = nativeImage.createFromBitmap(bitmap, { width: size, height: size }).toPNG();
    await clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) }),
    ]);
  });
}

async function clipboardHas(mimeType: string): Promise<boolean> {
  return electronApp.evaluate(({ clipboard }, type) => clipboard.has(type), mimeType);
}

async function readClipboardText(): Promise<string> {
  return electronApp.evaluate(({ clipboard }) => clipboard.readText());
}

async function openComposer(): Promise<{
  composerPage: Page;
  composer: ReturnType<Page['locator']>;
}> {
  await mainWindow.locator('#sheet-container').click();
  await mainWindow.keyboard.press('c');
  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
  const composer = composerPage!.locator('.composer-inner-wrap').last();
  await expect(composer).toBeVisible({ timeout: 5_000 });
  return { composerPage: composerPage!, composer };
}

async function focusRichBody(composerPage: Page, composer: ReturnType<Page['locator']>) {
  const body = composer.locator('.RichEditor-content [contenteditable="true"]').first();
  await body.click();
  await expect(body).toBeFocused();
  return body;
}

async function setComposingHTML(enabled: boolean) {
  await mainWindow.evaluate((value) => {
    (window as any).AppEnv.config.set('core.composing.html', value);
  }, enabled);
}

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailspring-clipboard-'));
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await closeComposerWindows(electronApp);
  await mainWindow.waitForTimeout(1500);
});

// --- Rich text composer -----------------------------------------------------

test('pasting CRLF plain text into the rich composer keeps every line', async () => {
  await writeClipboardText({ 'text/plain': 'First line\r\n\r\nThird line' });

  const { composerPage, composer } = await openComposer();
  const body = await focusRichBody(composerPage, composer);
  await composerPage.keyboard.press('Meta+v');

  await expect(body).toContainText('First line');
  await expect(body).toContainText('Third line');
  // Each line lands in its own Slate block, with the blank line preserved between
  // them and no stray `\r` (the app normalizes CRLF before Slate splits on `\n`).
  const texts = await body
    .locator('> div[data-key]')
    .evaluateAll((els) => els.map((el) => el.textContent!.replace(/\uFEFF/g, '')));
  expect(texts.slice(0, 3)).toEqual(['First line', '', 'Third line']);
  expect(texts.join('')).not.toContain('\r');
});

test('pasting HTML into the rich composer preserves formatting', async () => {
  await writeClipboardText({
    'text/html': '<p>Hello <strong>bold</strong> world</p>',
    'text/plain': 'Hello bold world',
  });

  const { composerPage, composer } = await openComposer();
  const body = await focusRichBody(composerPage, composer);
  await composerPage.keyboard.press('Meta+v');

  await expect(body).toContainText('Hello bold world');
  await expect(body.locator('strong, b').filter({ hasText: 'bold' })).toHaveCount(1);
});

test('pasting an image into the rich composer attaches it inline', async () => {
  await writeClipboardImage();

  const { composerPage, composer } = await openComposer();
  await focusRichBody(composerPage, composer);
  await composerPage.keyboard.press('Meta+v');

  // Image pastes become an inline (cid:) attachment rendered inside the editor,
  // not an entry in the attachments area.
  await expect(composer.locator('.RichEditor-content .image-attachment-item')).toHaveCount(1, {
    timeout: 10_000,
  });
  await expect(composer.locator('.attachments-area .file-upload')).toHaveCount(0);
});

test('pasting a file copied from the OS file manager attaches it by path', async () => {
  const filePath = path.join(fixtureDir, 'Quarterly Report.txt');
  fs.writeFileSync(filePath, 'hello from playwright');

  // Finder / Explorer / GTK put copied files on the pasteboard as the native
  // file-reference format, which Electron reads and writes as `text/uri-list`.
  await writeClipboardText({ 'text/uri-list': pathToFileURL(filePath).href });

  const { composerPage, composer } = await openComposer();
  await focusRichBody(composerPage, composer);
  await composerPage.keyboard.press('Meta+v');

  const attachment = composer.locator('.attachments-area .file-upload');
  await expect(attachment).toHaveCount(1, { timeout: 10_000 });
  await expect(attachment.locator('.file-name')).toHaveText('Quarterly Report.txt');
});

// --- Plain text composer ----------------------------------------------------

test('plaintext composer pastes text and attaches copied files', async () => {
  await setComposingHTML(false);
  try {
    const { composerPage, composer } = await openComposer();
    const textarea = composer.locator('.composer-editor-plaintext textarea');
    await expect(textarea).toBeVisible({ timeout: 5_000 });

    await writeClipboardText({ 'text/plain': 'plain body text' });
    await textarea.click();
    await composerPage.keyboard.press('Meta+v');
    await expect(textarea).toHaveValue(/plain body text/, { timeout: 5_000 });

    const filePath = path.join(fixtureDir, 'notes.md');
    fs.writeFileSync(filePath, '# notes');
    await writeClipboardText({ 'text/uri-list': pathToFileURL(filePath).href });
    await textarea.click();
    await composerPage.keyboard.press('Meta+v');

    const attachment = composer.locator('.attachments-area .file-upload');
    await expect(attachment).toHaveCount(1, { timeout: 10_000 });
    await expect(attachment.locator('.file-name')).toHaveText('notes.md');
    // The file path must not have been pasted as text.
    await expect(textarea).toHaveValue(/^plain body text\s*$/);
  } finally {
    await setComposingHTML(true);
  }
});

// --- Context-menu copy paths (renderer → system clipboard) ------------------

test('renderer copy actions write the system clipboard', async () => {
  // "Copy Image" in message bodies goes through the main process.
  await writeClipboardText({ 'text/plain': 'placeholder' });
  expect(await clipboardHas('image/png')).toBe(false);
  await mainWindow.evaluate((dataURL) => {
    (window as any).require('electron').ipcRenderer.send('write-image-to-clipboard', dataURL);
  }, PNG_DATA_URL);
  await expect.poll(() => clipboardHas('image/png'), { timeout: 5_000 }).toBe(true);

  // "Copy Email Address" / "Copy Link" use the main-process clipboard via @electron/remote.
  await mainWindow.evaluate(() => {
    (window as any).require('@electron/remote').clipboard.writeText('copied@example.com');
  });
  await expect.poll(() => readClipboardText(), { timeout: 5_000 }).toBe('copied@example.com');
});
