/* eslint global-require: 0 */
import { shell, ipcRenderer, remote } from 'electron';
import url from 'url';

let ComponentRegistry = null;
let Spellchecker = null;

const isTextInput = node => {
  if (!node) {
    return false;
  }
  if (node.nodeName === 'TEXTAREA') {
    return true;
  }
  const TextInputTypes = ['text', 'email', 'url', '', 'search', 'password', 'number'];
  if (node.nodeName === 'INPUT' && TextInputTypes.includes(node.type)) {
    return true;
  }
  if (node.closest('[contenteditable]')) {
    return true;
  }
  return false;
};

const isSelectionPresent = () => {
  if (
    document.activeElement &&
    document.activeElement.closest('[contenteditable]') &&
    document.getSelection().toString().length === 0
  ) {
    return false;
  }
  return true;
};

// Handles low-level events related to the window.
export default class WindowEventHandler {
  constructor() {
    this.unloadCallbacks = [];
    this.unloadCompleteCallbacks = [];

    setTimeout(() => this.showDevModeMessages(), 1);

    ipcRenderer.on('update-available', (event, detail) => AppEnv.updateAvailable(detail));

    ipcRenderer.on('browser-window-focus', () => {
      document.body.classList.remove('is-blurred');
      window.dispatchEvent(new Event('browser-window-focus'));
    });

    ipcRenderer.on('browser-window-blur', () => {
      document.body.classList.add('is-blurred');
      window.dispatchEvent(new Event('browser-window-blur'));
    });

    ipcRenderer.on('command', (event, command, ...args) => {
      AppEnv.commands.dispatch(command, args[0]);
    });

    ipcRenderer.on('scroll-touch-begin', () => {
      window.dispatchEvent(new Event('scroll-touch-begin'));
    });

    ipcRenderer.on('scroll-touch-end', () => {
      window.dispatchEvent(new Event('scroll-touch-end'));
    });

    window.onbeforeunload = () => {
      if (AppEnv.inSpecMode()) {
        return undefined;
      }
      // Don't hide the window here if we don't want the renderer process to be
      // throttled in case more work needs to be done before closing

      // In Electron, returning any value other than undefined cancels the close.
      if (this.runUnloadCallbacks()) {
        // Good to go! Window will be closing...
        AppEnv.storeWindowDimensions();
        AppEnv.saveWindowStateAndUnload();
        return undefined;
      }
      return false;
    };

    AppEnv.commands.add(document.body, 'window:toggle-full-screen', () => {
      AppEnv.toggleFullScreen();
    });

    AppEnv.commands.add(document.body, 'window:close', () => {
      AppEnv.close();
    });

    AppEnv.commands.add(document.body, 'window:reload', () => {
      AppEnv.reload();
    });

    AppEnv.commands.add(document.body, 'window:toggle-dev-tools', () => {
      AppEnv.toggleDevTools();
    });

    AppEnv.commands.add(document.body, 'window:open-mailsync-logs', () => {
      AppEnv.mailsyncBridge.openLogs();
    });

    AppEnv.commands.add(document.body, 'window:sync-mail-now', () => {
      AppEnv.mailsyncBridge.sendSyncMailNow();
    });

    AppEnv.commands.add(document.body, 'window:attach-to-xcode', () => {
      const client = Object.values(AppEnv.mailsyncBridge.clients()).pop();
      if (client) {
        client.attachToXcode();
      }
    });

    AppEnv.commands.add(document.body, 'window:toggle-component-regions', () => {
      ComponentRegistry = ComponentRegistry || require('./registries/component-registry').default;
      ComponentRegistry.toggleComponentRegions();
    });

    AppEnv.commands.add(document.body, 'window:create-package', () => {
      AppEnv.packages.createPackageManually();
    });
    AppEnv.commands.add(document.body, 'window:install-package', () => {
      AppEnv.packages.installPackageManually();
    });

    const webContents = AppEnv.getCurrentWindow().webContents;

    let _UndoStore = null;
    const getUndoStore = () => {
      if (!_UndoStore) _UndoStore = require('./flux/stores/undo-redo-store').default;
      return _UndoStore;
    };

    AppEnv.commands.add(document.body, {
      'core:copy': () => (isSelectionPresent() ? webContents.copy() : null),
      'core:cut': () => (isSelectionPresent() ? webContents.cut() : null),
      'core:paste': () => webContents.paste(),
      'core:paste-and-match-style': () => webContents.pasteAndMatchStyle(),
      'core:undo': e => (isTextInput(e.target) ? webContents.undo() : getUndoStore().undo()),
      'core:redo': e => (isTextInput(e.target) ? webContents.redo() : getUndoStore().redo()),
      'core:select-all': e => (isTextInput(e.target) ? webContents.selectAll() : null),
    });

    // "Pinch to zoom" on the Mac gets translated by the system into a
    // "scroll with ctrl key down". To prevent the page from zooming in,
    // prevent default when the ctrlKey is detected.
    document.addEventListener('mousewheel', event => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    });

    document.addEventListener('drop', this.onDrop);

    document.addEventListener('dragover', this.onDragOver);

    document.addEventListener('click', event => {
      if (event.target.closest('[href]')) {
        this.openLink(event);
      }
    });

    document.addEventListener('contextmenu', event => {
      if (event.target.nodeName === 'INPUT') {
        this.openContextualMenuForInput(event);
      }
    });

    // Prevent form submits from changing the current window's URL
    document.addEventListener('submit', event => {
      if (event.target.nodeName === 'FORM') {
        event.preventDefault();
      }
    });
  }

  // Called on beforeUnload, callback return value
  // can stop / postpone the window from closing
  addUnloadCallback(callback) {
    this.unloadCallbacks.push(callback);
  }

  // Called when all beforeUnload callbacks have
  // been called and have returned
  addReadyToUnloadCallback(callback) {
    this.unloadCompleteCallbacks.push(callback);
  }

  removeUnloadCallback(callback) {
    this.unloadCallbacks = this.unloadCallbacks.filter(cb => cb !== callback);
  }

  runUnloadCallbacks() {
    let hasReturned = false;

    let unloadCallbacksRunning = 0;
    const unloadCallbackComplete = () => {
      unloadCallbacksRunning -= 1;
      if (unloadCallbacksRunning === 0 && hasReturned) {
        this.runUnloadFinished();
      }
    };

    for (const callback of this.unloadCallbacks) {
      const returnValue = callback(unloadCallbackComplete);
      if (returnValue === false) {
        unloadCallbacksRunning += 1;
      } else if (returnValue !== true) {
        console.warn(
          `You registered an "onBeforeUnload" callback that does not return either exactly true or false. It returned ${returnValue}`,
          callback
        );
      }
    }

    // In Electron, returning false cancels the close.
    hasReturned = true;
    if (unloadCallbacksRunning === 0) {
      for (const callback of this.unloadCompleteCallbacks) {
        callback();
      }
      return true;
    }
    return false;
  }

  runUnloadFinished() {
    for (const callback of this.unloadCompleteCallbacks) {
      callback();
    }
    setTimeout(() => {
      if (remote.getGlobal('application').isQuitting()) {
        remote.app.quit();
      } else if (AppEnv.isReloading) {
        AppEnv.isReloading = false;
        AppEnv.reload();
      } else {
        AppEnv.close();
      }
    }, 0);
  }

  // Important: even though we don't do anything here, we need to catch the
  // drop event to prevent the browser from navigating the to the "url" of the
  // file and completely leaving the app.
  onDrop = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  onDragOver = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  resolveHref(el) {
    if (!el) {
      return null;
    }
    const closestHrefEl = el.closest('[href]');
    return closestHrefEl ? closestHrefEl.getAttribute('href') : null;
  }

  openLink({ href, target, currentTarget, metaKey }) {
    let resolved = href || this.resolveHref(target || currentTarget);
    if (!resolved) {
      return;
    }
    if (target && target.closest('.no-open-link-events')) {
      return;
    }

    let { protocol } = url.parse(resolved);
    if (!protocol) {
      protocol = 'http:';
      resolved = `http://${resolved}`;
    }

    if (['mailto:', 'mailspring:'].includes(protocol)) {
      // We sometimes get mailto URIs that are not escaped properly, or have been only partially escaped.
      // (T1927) Be sure to escape them once, and completely, before we try to open them. This logic
      // *might* apply to http/https as well but it's unclear.
      const sanitized = encodeURI(decodeURI(resolved));
      remote.getGlobal('application').openUrl(sanitized);
    } else if (['http:', 'https:', 'tel:'].includes(protocol)) {
      shell.openExternal(resolved, { activate: !metaKey });
    }
    return;
  }

  openContextualMenuForInput(event) {
    event.preventDefault();

    const textualInputs = ['text', 'password', 'email', 'number', 'range', 'search', 'tel', 'url'];
    if (!textualInputs.includes(event.target.type)) {
      return;
    }
    const hasSelectedText = event.target.selectionStart !== event.target.selectionEnd;
    let wordStart = null;
    let wordEnd = null;

    if (hasSelectedText) {
      wordStart = event.target.selectionStart;
      wordEnd = event.target.selectionEnd;
    } else {
      wordStart = event.target.value.lastIndexOf(' ', event.target.selectionStart);
      if (wordStart === -1) {
        wordStart = 0;
      }
      wordEnd = event.target.value.indexOf(' ', event.target.selectionStart);
      if (wordEnd === -1) {
        wordEnd = event.target.value.length;
      }
    }
    const word = event.target.value.substr(wordStart, wordEnd - wordStart);

    this.openSpellingMenuFor(word, hasSelectedText, {
      onCorrect: correction => {
        const insertionPoint = wordStart + correction.length;
        event.target.value = event.target.value.replace(word, correction);
        event.target.setSelectionRange(insertionPoint, insertionPoint);
      },
    });
  }

  openSpellingMenuFor(word, hasSelectedText, { onCorrect, onRestoreSelection = () => {} }) {
    const { Menu, MenuItem } = remote;
    const menu = new Menu();

    Spellchecker = Spellchecker || require('./spellchecker').default;
    Spellchecker.appendSpellingItemsToMenu({ menu, word, onCorrect });

    menu.append(
      new MenuItem({
        label: 'Cut',
        enabled: hasSelectedText,
        click: () => AppEnv.commands.dispatch('core:cut'),
      })
    );
    menu.append(
      new MenuItem({
        label: 'Copy',
        enabled: hasSelectedText,
        click: () => AppEnv.commands.dispatch('core:copy'),
      })
    );
    menu.append(
      new MenuItem({
        label: 'Paste',
        click: () => {
          onRestoreSelection();
          AppEnv.commands.dispatch('core:paste');
        },
      })
    );
    menu.append(
      new MenuItem({
        label: 'Paste and Match Style',
        click: () => {
          onRestoreSelection();
          AppEnv.commands.dispatch('core:paste-and-match-style');
        },
      })
    );
    menu.popup(remote.getCurrentWindow());
  }

  showDevModeMessages() {
    if (!AppEnv.isMainWindow()) {
      return;
    }

    if (!AppEnv.inDevMode()) {
      console.log(
        "%c Welcome to Mailspring! If you're exploring the source or building a " +
          "plugin, you should enable debug flags. It's slower, but " +
          'gives you better exceptions, the debug version of React, ' +
          'and more. Choose %c Developer > Run with Debug Flags %c ' +
          'from the menu. Also, check out http://Foundry376.github.io/Mailspring/ ' +
          'for documentation and sample code!',
        'background-color: antiquewhite;',
        'background-color: antiquewhite; font-weight:bold;',
        'background-color: antiquewhite; font-weight:normal;'
      );
    }
  }
}
