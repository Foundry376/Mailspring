import { app, shell } from 'electron';
import { isMailspringWindowContents } from './mailspring-window';

const ExternalProtocols = ['http:', 'https:', 'mailto:'];

// Electron reports no user gesture for navigations, so a navigation counts as a click
// when it follows real mouse or keyboard input this closely.
const UserInputWindowMs = 1000;
const UserInputTypes = ['mouseDown', 'mouseUp', 'rawKeyDown', 'keyDown'];

function isGuarded(contents: Electron.WebContents) {
  return !isMailspringWindowContents(contents) && contents.getURL().startsWith('file:');
}

function openExternally(url: string) {
  let protocol = null;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return;
  }
  if (ExternalProtocols.includes(protocol)) {
    shell.openExternal(url).catch(() => {});
  }
}

/**
 * Keeps top-level windows showing a local page (print preview, quick preview, "show
 * original", clipped messages) on that page. They render untrusted mail and attachment
 * content, so a clicked link would otherwise load a remote page into the window along
 * with its preload. Links the user clicks open in the default browser instead; a meta
 * refresh or script-initiated navigation is just dropped.
 *
 * These windows are created from renderers over @electron/remote, where a
 * `will-navigate` listener runs asynchronously and can no longer call preventDefault(),
 * so the guard has to be installed here. MailspringWindow installs its own.
 */
export function guardAuxiliaryWindowNavigation() {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'window') return;

    let lastUserInputAt = 0;
    contents.on('input-event', (_e, input) => {
      if (UserInputTypes.includes(input.type)) lastUserInputAt = Date.now();
    });
    const openIfUserInitiated = (url: string) => {
      if (Date.now() - lastUserInputAt < UserInputWindowMs) openExternally(url);
    };

    contents.on('will-navigate', (event, url) => {
      if (!isGuarded(contents)) return;
      event.preventDefault();
      openIfUserInitiated(url);
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (!isGuarded(contents)) return { action: 'allow' };
      openIfUserInitiated(url);
      return { action: 'deny' };
    });
  });
}
