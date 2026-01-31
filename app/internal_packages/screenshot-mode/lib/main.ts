import fs from 'fs';
import path from 'path';
import { ExtensionRegistry, MessageStore } from 'mailspring-exports';
import ScreenshotModeMessageExtension from './screenshot-mode-message-extension';

let enabled = false;
let originalSetTitle = null;

function getCurrentWindow() {
  return require('@electron/remote').getCurrentWindow();
}

function getCorrectTitle() {
  const thread = MessageStore.thread();
  return 'Mailspring' + (thread ? ' · ' + thread.subject : '');
}

let styleText: string | null = null;
function getStyleText() {
  if (!styleText) {
    styleText = fs
      .readFileSync(path.join(__dirname, '..', 'assets', 'screenshot-mode.css'))
      .toString();
  }
  return styleText;
}

export function applyToDocument(doc: Document) {
  let el = doc.getElementById('screenshot-mode-styles');
  if (enabled) {
    if (!el && doc.head) {
      el = doc.createElement('style');
      el.id = 'screenshot-mode-styles';
      el.innerText = getStyleText();
      doc.head.appendChild(el);
    }
  } else {
    if (el) {
      el.parentElement.removeChild(el);
    }
  }
}

function patchWindowTitle() {
  const win = getCurrentWindow();
  if (!originalSetTitle) {
    originalSetTitle = win.setTitle.bind(win);
    win.setTitle = (title: string) => {
      if (enabled) {
        originalSetTitle('Mailspring');
      } else {
        originalSetTitle(title);
      }
    };
  }

  if (enabled) {
    originalSetTitle('Mailspring');
  } else {
    originalSetTitle(getCorrectTitle());
  }
}

export function activate() {
  ExtensionRegistry.MessageView.register(ScreenshotModeMessageExtension);

  return AppEnv.commands.add(document.body, 'window:toggle-screenshot-mode', () => {
    enabled = !enabled;

    patchWindowTitle();

    // Apply to the main document
    applyToDocument(document);

    // Apply to all existing iframes
    for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
      if (iframe.contentDocument) {
        applyToDocument(iframe.contentDocument);
      }
    }
  });
}

export function deactivate() {
  const win = getCurrentWindow();
  enabled = false;
  applyToDocument(document);
  for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
    if (iframe.contentDocument) {
      applyToDocument(iframe.contentDocument);
    }
  }
  if (originalSetTitle) {
    win.setTitle = originalSetTitle;
    originalSetTitle = null;
  }

  // Restore title
  win.setTitle(getCorrectTitle());

  ExtensionRegistry.MessageView.unregister(ScreenshotModeMessageExtension);
}
