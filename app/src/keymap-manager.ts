import fs from 'fs';
import path from 'path';
import mousetrap from 'mousetrap';
import { ipcRenderer } from 'electron';
import { Emitter, Disposable } from 'event-kit';

let suspended = false;
const templateConfigKey = 'core.keymapTemplate';

// Bindings are resolved base → template → package regardless of the order the
// files were loaded in. Base files layer additively. A template (Gmail, Outlook,
// ...) replaces the base bindings of each command it defines, which is what lets
// Outlook free ctrl+q from application:quit on Windows; the cost is that a
// template must restate every base keystroke it wants to keep (up/down
// alongside j/k, enter alongside o, ...), and keymap-templates-spec fails if one
// is dropped without being listed there as intentional. Package keymaps are
// added on top so a template can't strip mod+enter from composer:send-message.
type KeymapLayer = 'base' | 'template' | 'package';
const layerOrder: KeymapLayer[] = ['base', 'template', 'package'];

interface KeymapLoadOptions {
  layer?: KeymapLayer;
}

// Mousetrap understands mod, but keeps mod+u and ctrl+u as separate callbacks.
// Our stopCallback skips the second after the first stops propagation, so merge
// platform aliases before registering callbacks and collecting their commands.
const normalizePlatformKeystrokes = (keystrokes: string) =>
  keystrokes.replace(/\bmod\b/g, process.platform === 'darwin' ? 'command' : 'ctrl');

/*
By default, Mousetrap stops all hotkeys within text inputs. Override this to
more specifically block only hotkeys that have no modifier keys (things like
Gmail's "x", while allowing standard hotkeys.)
*/
mousetrap.prototype.stopCallback = (e: KeyboardEvent, element: HTMLElement, combo: string) => {
  if (suspended) {
    return true;
  }

  // Slate handles undo/redo itself in slate-react's `after` plugin but doesn't stop
  // propagation. Because of this, we need to make sure we do not fire core:undo or core:redo.
  const target = e.target as HTMLElement;
  const withinSlateEditor =
    target.isContentEditable &&
    (target.hasAttribute('data-slate-editor') || target.closest('[data-slate-editor]'));
  if (withinSlateEditor && /(mod|command|ctrl)\+(z|y)/.test(combo)) {
    return true;
  }

  const withinWebview = element.tagName === 'WEBVIEW';
  if (withinWebview) {
    return true;
  }

  if ((e as any).isPropagationStopped()) {
    return true;
  }
  // Also treat anything inside an open composer as text input so that focus
  // landing on composer chrome (footer, attachment area, between recipient
  // chips, etc.) doesn't let plain keys fall through to global shortcuts.
  const withinTextInput =
    element.tagName === 'INPUT' ||
    element.tagName === 'SELECT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable ||
    !!element.closest('.composer-outer-wrap');
  if (withinTextInput) {
    const isPlainKey = !/(mod|command|ctrl)/.test(combo);
    const isReservedTextEditingShortcut = /(mod|command|ctrl)\+(a|x|c|v|left|right)/.test(combo);
    if (isPlainKey || isReservedTextEditingShortcut) {
      return true;
    }
  }

  // Stop mousetrap from firing global commands when focus is within a tree widget
  // (e.g. the mailbox outline view), so the tree's own arrow-key navigation works.
  // withinTextInput runs first so that typing in an inline composer inside the tree
  // is handled correctly before we apply tree-specific logic.
  const withinTree =
    !!element.closest('[role="tree"]') ||
    !!element.closest('[data-usesarrowkeys]:has(:focus-visible)');
  if (withinTree) {
    const isPlainKey = !/(mod|command|ctrl)/.test(combo);
    const isArrowKey = /(left|right|up|down)/.test(combo);
    return isPlainKey && isArrowKey;
  }
  return false;
};

class KeymapFile {
  _bindings = {};
  _disposable = null;
  _path: string;
  _manager: KeymapManager;
  _layer: KeymapLayer;

  constructor(
    manager: KeymapManager,
    filePath: string,
    { layer = 'package' }: KeymapLoadOptions = {}
  ) {
    this._manager = manager;
    this._path = filePath;
    this._layer = layer;
  }

  load = () => {
    let keymaps = null;
    try {
      keymaps = JSON.parse(fs.readFileSync(this._path).toString());
    } catch (e) {
      if (e.code === 'ENOENT') {
        return;
      }
      console.error(e);
      return;
    }

    this._bindings = {};
    Object.keys(keymaps).forEach((command) => {
      let keystrokesArray = keymaps[command];
      if (!(keystrokesArray instanceof Array)) {
        keystrokesArray = [keystrokesArray];
      }
      for (const keystrokes of keystrokesArray) {
        this._manager.ensureKeystrokesRegistered(keystrokes);
        this._bindings[command] = this._bindings[command] || [];
        this._bindings[command].push(keystrokes);
      }
    });
    this._manager.keymapCacheInvalidated();
  };

  watch() {
    try {
      fs.watch(this._path, this.load);
    } catch (err) {
      // usually an ENOSPC error
      console.warn(`Unable to watch your keymap file for changes: ${err.toString()}`);
    }
  }

  bindings() {
    return this._bindings;
  }

  layer() {
    return this._layer;
  }
}

export default class KeymapManager {
  _emitter = new Emitter();
  _registered = {};
  _files = [];
  configDirPath: string;
  resourcePath: string;
  userKeymap?: KeymapFile;
  _unobserveTemplate?: Disposable;
  _removeTemplate?: Disposable;
  _bindingsCache: any;
  _commandsCache: any;
  _altKeyDown = false;
  _altKeyTimer: NodeJS.Timeout = null;

  EVENT_ALT_KEY_STATE_CHANGE = 'alt-key-state-change';

  constructor({ configDirPath, resourcePath }) {
    this.configDirPath = configDirPath;
    this.resourcePath = resourcePath;

    for (const event of ['keydown', 'keyup', 'click']) {
      window.addEventListener(event, (e: KeyboardEvent) => this.onUpsertModifierState(e.altKey), {
        capture: true,
        passive: true,
      });
    }
  }

  onUpsertModifierState = (altKeyDown: boolean) => {
    if (this._altKeyDown !== altKeyDown) {
      this._altKeyDown = altKeyDown;
      document.dispatchEvent(new CustomEvent(this.EVENT_ALT_KEY_STATE_CHANGE));

      // It's difficult to reliably detect when the user lets go of the alt key if they:
      // - start a drag and drag out of the app
      // - open a native context menu and release the alt key
      // - background the app and release the alt key
      //
      // As a workaround, automatically release the alt key after 3 seconds of inactivity.
      // This should be fine for all practical use as a modifer key and prevents it from
      // being indefinitely "stuck" in the on-state.
      //
      clearTimeout(this._altKeyTimer);
      if (altKeyDown) {
        this._altKeyTimer = setTimeout(() => this.onUpsertModifierState(false), 3 * 1000);
      }
    }
  };

  getIsAltKeyDown() {
    return this._altKeyDown;
  }

  getUserKeymapPath() {
    return path.join(this.configDirPath, 'keymap.json');
  }

  suspendAllKeymaps() {
    AppEnv.menu.sendToBrowserProcess(AppEnv.menu.template, {});
    suspended = true;
  }

  resumeAllKeymaps() {
    AppEnv.menu.update();
    suspended = false;
  }

  loadKeymaps = () => {
    // Load the base keymap and the base.platform keymap
    this.loadKeymap(path.join(this.resourcePath, 'keymaps', 'base.json'), { layer: 'base' });
    this.loadKeymap(path.join(this.resourcePath, 'keymaps', `base-${process.platform}.json`), {
      layer: 'base',
    });

    // Load the template keymap (Gmail, Mail.app, etc.) the user has chosen
    if (this._unobserveTemplate) {
      this._unobserveTemplate.dispose();
    }
    this._unobserveTemplate = AppEnv.config.observe(templateConfigKey, this.loadTemplateKeymap);

    const userKeymapPath = this.getUserKeymapPath();
    if (!fs.existsSync(userKeymapPath)) {
      fs.writeFileSync(userKeymapPath, '{}');
    }
    this.userKeymap = new KeymapFile(this, userKeymapPath);
    this.userKeymap.load();
    this.userKeymap.watch();
  };

  loadTemplateKeymap = () => {
    if (this._removeTemplate) {
      this._removeTemplate.dispose();
    }
    let templateFile = AppEnv.config.get(templateConfigKey);
    if (templateFile) {
      templateFile = templateFile.replace('GoogleInbox', 'Inbox by Gmail');
      const templateKeymapPath = path.join(
        this.resourcePath,
        'keymaps',
        'templates',
        `${templateFile}.json`
      );
      this._removeTemplate = this.loadKeymap(templateKeymapPath, { layer: 'template' });
    }
  };

  loadKeymap(filePath: string, { layer = 'package' }: KeymapLoadOptions = {}) {
    const file = new KeymapFile(this, filePath, { layer });
    this._files.push(file);
    file.load();

    return new Disposable(() => {
      this._files = this._files.filter((f) => f !== file);
      this.keymapCacheInvalidated();
    });
  }

  ensureKeystrokesRegistered(keystrokes: string) {
    const platformKeystrokes = normalizePlatformKeystrokes(keystrokes);
    if (this._registered[platformKeystrokes]) {
      return;
    }
    this._registered[platformKeystrokes] = true;

    mousetrap.bind(platformKeystrokes, () => {
      const commands = this._commandsCache[platformKeystrokes] || [];
      if (commands.length === 0) {
        return;
      }

      for (const command of commands) {
        if (command.startsWith('application:')) {
          ipcRenderer.send('command', command);
        } else {
          AppEnv.commands.dispatch(command);
        }
      }
      return false;
    });
  }

  keymapCacheInvalidated() {
    this._bindingsCache = {};

    const files = layerOrder.flatMap((layer) => this._files.filter((f) => f.layer() === layer));
    for (const file of files) {
      const fileBindings = file.bindings();
      for (const command of Object.keys(fileBindings)) {
        const keystrokesArray = fileBindings[command];
        if (file.layer() === 'template') {
          this._bindingsCache[command] = keystrokesArray.slice();
        } else {
          this._bindingsCache[command] = (this._bindingsCache[command] || []).concat(
            keystrokesArray
          );
        }
      }
    }
    if (this.userKeymap) {
      const userBindings = this.userKeymap.bindings();
      for (const command of Object.keys(userBindings)) {
        this._bindingsCache[command] = userBindings[command];
      }
    }

    this._commandsCache = {};
    for (const command of Object.keys(this._bindingsCache)) {
      for (const keystrokes of this._bindingsCache[command]) {
        const platformKeystrokes = normalizePlatformKeystrokes(keystrokes);
        if (!this._commandsCache[platformKeystrokes]) {
          this._commandsCache[platformKeystrokes] = [];
        }
        if (!this._commandsCache[platformKeystrokes].includes(command)) {
          this._commandsCache[platformKeystrokes].push(command);
        }
      }
    }

    this._emitter.emit('on-did-reload-keymap');
  }

  onDidReloadKeymap = (callback: () => void) => {
    return this._emitter.on('on-did-reload-keymap', callback);
  };

  getBindingsForAllCommands() {
    return this._bindingsCache;
  }

  getBindingsForCommand(command: string) {
    return this._bindingsCache[command] || [];
  }
}
