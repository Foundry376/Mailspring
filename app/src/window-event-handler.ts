/* eslint global-require: 0 */
import { shell, ipcRenderer } from 'electron';
import url from 'url';
import { localized } from './intl';

let ComponentRegistry = null;

const isIFrame = (node: EventTarget) => {
  return node instanceof HTMLElement && node.tagName === 'IFRAME';
};

const isTextInput = (node: EventTarget) => {
  if (!node) {
    return false;
  }
  if (node instanceof Node && node.nodeName === 'WEBVIEW') {
    return true;
  }
  if (node instanceof Node && node.nodeName === 'TEXTAREA') {
    return true;
  }
  const TextInputTypes = ['text', 'email', 'url', '', 'search', 'password', 'number'];
  if (node instanceof HTMLInputElement && TextInputTypes.includes(node.type)) {
    return true;
  }
  if (node instanceof HTMLElement && node.closest('[contenteditable]')) {
    return true;
  }
  return false;
};

// Handles low-level events related to the window.
export default class WindowEventHandler {
  unloadCallbacks = [];
  unloadCompleteCallbacks = [];

  constructor() {
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

    ipcRenderer.on('browser-window-hide', () => {
      window.dispatchEvent(new Event('browser-window-hide'));
    });

    ipcRenderer.on('browser-window-show', () => {
      window.dispatchEvent(new Event('browser-window-show'));
    });

    ipcRenderer.on('command', (event, command, ...args) => {
      AppEnv.commands.dispatch(command, args[0]);
    });

    window.onbeforeunload = e => {
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
      e.preventDefault();
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
      'core:copy': e => (isIFrame(e.target) ? webContents.copy() : document.execCommand('copy')),
      'core:cut': e => (isIFrame(e.target) ? webContents.cut() : document.execCommand('cut')),
      'core:paste': () => webContents.paste(),
      'core:paste-and-match-style': () => webContents.pasteAndMatchStyle(),
      'core:undo': e => (isTextInput(e.target) ? webContents.undo() : getUndoStore().undo()),
      'core:redo': e => (isTextInput(e.target) ? webContents.redo() : getUndoStore().redo()),
      'core:select-all': e =>
        isIFrame(e.target) || isTextInput(e.target)
          ? webContents.selectAll()
          : AppEnv.commands.dispatch('multiselect-list:select-all'),
    });

    webContents.on('input-event', (e, input) => {
      if (input.type === 'gestureScrollBegin') {
        window.dispatchEvent(new Event('gesture-scroll-begin'));
      }
      if (input.type === 'gestureScrollEnd') {
        window.dispatchEvent(new Event('gesture-scroll-end'));
      }
    });

    // "Pinch to zoom" on the Mac gets translated by the system into a
    // "scroll with ctrl key down". To prevent the page from zooming in,
    // prevent default when the ctrlKey is detected.
    document.addEventListener('mousewheel', (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    });

    document.addEventListener('drop', this.onDrop);

    document.addEventListener('click', (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[href]')) {
        this.openLink(event);
        event.preventDefault();
      }
    });

    // Handle context menu for all editable areas with native spellcheck
    webContents.on('context-menu', (event, params) => {
      // Only handle if we're in an editable area
      if (!params.isEditable) {
        return;
      }

      const { Menu, MenuItem } = require('@electron/remote');
      const menu = new Menu();

      // Add spelling suggestions if there's a misspelled word
      if (params.misspelledWord) {
        if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
          for (const suggestion of params.dictionarySuggestions) {
            menu.append(
              new MenuItem({
                label: suggestion,
                click: () => webContents.replaceMisspelling(suggestion),
              })
            );
          }
        } else {
          menu.append(new MenuItem({ label: localized('No Guesses Found'), enabled: false }));
        }
        menu.append(new MenuItem({ type: 'separator' }));

        menu.append(
          new MenuItem({
            label: localized('Learn Spelling'),
            click: () => {
              webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
            },
          })
        );
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Add standard edit menu items using editFlags from Electron
      menu.append(
        new MenuItem({
          label: localized('Cut'),
          enabled: params.editFlags.canCut,
          click: () => webContents.cut(),
        })
      );
      menu.append(
        new MenuItem({
          label: localized('Copy'),
          enabled: params.editFlags.canCopy,
          click: () => webContents.copy(),
        })
      );
      menu.append(
        new MenuItem({
          label: localized('Paste'),
          enabled: params.editFlags.canPaste,
          click: () => webContents.paste(),
        })
      );
      menu.append(
        new MenuItem({
          label: localized('Paste and Match Style'),
          enabled: params.editFlags.canPaste,
          click: () => webContents.pasteAndMatchStyle(),
        })
      );

      menu.popup({});
    });

    // Prevent form submits from changing the current window's URL
    document.addEventListener('submit', event => {
      if ((event.target as HTMLElement).nodeName === 'FORM') {
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
      if (
        require('@electron/remote')
          .getGlobal('application')
          .isQuitting()
      ) {
        require('@electron/remote').app.quit();
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
  onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  resolveHref(el: EventTarget) {
    if (!el || !(el instanceof HTMLElement)) {
      return null;
    }
    const closestHrefEl = el.closest('[href]');
    return closestHrefEl ? closestHrefEl.getAttribute('href') : null;
  }

  openLink({
    href,
    target,
    currentTarget,
    metaKey,
  }: {
    href?: string;
    target?: EventTarget;
    currentTarget?: EventTarget;
    metaKey?: boolean;
  }) {
    let resolved = href || this.resolveHref(target || currentTarget);
    if (!resolved) {
      return;
    }
    if (target instanceof HTMLElement && target.closest('.no-open-link-events')) {
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
      require('@electron/remote')
        .getGlobal('application')
        .openUrl(sanitized);
    } else if (['http:', 'https:', 'tel:'].includes(protocol)) {
      shell.openExternal(resolved, { activate: !metaKey });
    }
    return;
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
