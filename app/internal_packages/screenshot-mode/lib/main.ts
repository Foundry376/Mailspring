import fs from 'fs';
import path from 'path';
import { ExtensionRegistry } from 'mailspring-exports';
import ScreenshotModeMessageExtension from './screenshot-mode-message-extension';

let enabled = false;

function getStyleText() {
  return fs.readFileSync(path.join(__dirname, '..', 'assets', 'screenshot-mode.css')).toString();
}

export function applyToDocument(doc: Document) {
  let el = doc.getElementById('screenshot-mode-styles');
  if (enabled) {
    if (!el) {
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

export function activate() {
  ExtensionRegistry.MessageView.register(ScreenshotModeMessageExtension);

  return AppEnv.commands.add(document.body, 'window:toggle-screenshot-mode', () => {
    enabled = !enabled;

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
  enabled = false;
  applyToDocument(document);
  for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
    if (iframe.contentDocument) {
      applyToDocument(iframe.contentDocument);
    }
  }
  ExtensionRegistry.MessageView.unregister(ScreenshotModeMessageExtension);
}
