/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'underscore';
import { webFrame } from 'electron';
import * as Actions from '../actions';
import MailspringStore from 'mailspring-store';
import { Disposable } from 'event-kit';

let Sheet = {} as SheetSet;
let Location = {};

// Total TypeScript hack - expose sheet constants that we know will exist
// and that the app commonly relies on eg: WorkspaceStore.Sheet.Bla, even
// though this is built dynamically and assembled via plugin injection.
interface SheetSet {
  Thread: SheetDeclaration;
  File: SheetDeclaration;
  Preferences: SheetDeclaration;
  Activity: SheetDeclaration;
  Drafts: SheetDeclaration;
  Main: SheetDeclaration;
  Threads: SheetDeclaration;
  Global: SheetDeclaration;
  [key: string]: SheetDeclaration;
}

interface SheetLocations {
  [locationKey: string]: {
    id: string;
    Toolbar: SheetToolbarDeclaration;
  };
}

interface SheetToolbarDeclaration {
  Left: { id: string };
  Right: { id: string };
}

export interface SheetDeclaration {
  id: string;
  columns: string[];
  supportedModes: string[];

  icon: string;
  name: string;
  root: boolean;
  sidebarComponent: any;

  Toolbar: SheetToolbarDeclaration;
  Header: { id: string };
  Footer: { id: string };
  Center: { id: string };
}

/*
Public: The WorkspaceStore manages Sheets and layout modes in the application.
Observing the WorkspaceStore makes it easy to monitor the sheet stack. To learn
more about sheets and layout in N1, see the {InterfaceConcepts.md}
documentation.

Section: Stores
*/
class WorkspaceStore extends MailspringStore {
  Location: SheetLocations = (Location = {} as SheetLocations);
  Sheet: SheetSet = (Sheet = {} as SheetSet);

  private _preferredLayoutMode: string;
  private _hiddenLocations: {};
  private _sheetStack: SheetDeclaration[];
  private _shortcuts?: Disposable;

  constructor() {
    super();

    this._resetInstanceVars();
    this._preferredLayoutMode = AppEnv.config.get('core.workspace.mode');

    this.listenTo(Actions.selectRootSheet, this._onSelectRootSheet);
    this.listenTo(Actions.setFocus, this._onSetFocus);
    this.listenTo(Actions.toggleWorkspaceLocationHidden, this._onToggleLocationHidden);
    this.listenTo(Actions.popSheet, this.popSheet);
    this.listenTo(Actions.popToRootSheet, this.popToRootSheet);
    this.listenTo(Actions.pushSheet, this.pushSheet);

    const { windowType } = AppEnv.getLoadSettings();

    // Disable double-tap to zoom, pinch to zoom
    webFrame.setVisualZoomLevelLimits(1, 1);

    // Allow the user to override the interface zoom
    this._applyDesiredScale();
    AppEnv.config.observe('core.workspace.interfaceZoom', this._applyDesiredScale);
    if (windowType === 'emptyWindow') {
      AppEnv.onWindowPropsReceived(this._applyDesiredScale);
    }

    if (AppEnv.isMainWindow()) {
      this._rebuildShortcuts();
    }
  }

  triggerDebounced = _.debounce(() => this.trigger(this), 1);

  _resetInstanceVars() {
    this.Location = Location = {};
    this.Sheet = Sheet = {} as SheetSet;

    this._hiddenLocations = AppEnv.config.get('core.workspace.hiddenLocations') || {};
    this._sheetStack = [];

    if (AppEnv.isMainWindow()) {
      this.defineSheet('Global');
      this.defineSheet(
        'Threads',
        { root: true },
        {
          list: ['RootSidebar', 'ThreadList'],
          split: ['RootSidebar', 'ThreadList', 'MessageList', 'MessageListSidebar'],
        }
      );
      this.defineSheet('Thread', {}, { list: ['MessageList', 'MessageListSidebar'] });
    } else {
      this.defineSheet('Global');
    }
  }

  _applyDesiredScale = () => {
    let zoom = AppEnv.config.get('core.workspace.interfaceZoom');
    if (AppEnv.getLoadSettings().windowType === 'onboarding') {
      zoom = 1; // onboarding is a fixed-size modal, zoom causes content clipping
    }
    if (zoom && _.isNumber(zoom)) {
      webFrame.setZoomFactor(zoom);
    }
  };

  /*
  Inbound Events
  */

  _onSelectRootSheet = sheet => {
    if (!sheet) {
      throw new Error(`Actions.selectRootSheet - ${sheet} is not a valid sheet.`);
    }
    if (!sheet.root) {
      throw new Error(`Actions.selectRootSheet - ${sheet} is not registered as a root sheet.`);
    }

    this._sheetStack = [];
    this._sheetStack.push(sheet);
    this.trigger(this);
  };

  _onToggleLocationHidden = location => {
    if (!location.id) {
      throw new Error('Actions.toggleWorkspaceLocationHidden - pass a WorkspaceStore.Location');
    }

    if (this._hiddenLocations[location.id]) {
      delete this._hiddenLocations[location.id];
    } else {
      this._hiddenLocations[location.id] = location;
    }

    AppEnv.config.set('core.workspace.hiddenLocations', this._hiddenLocations);

    this.trigger(this);
  };

  _onSetFocus = ({ collection, item }) => {
    if (collection === 'thread') {
      if (this.layoutMode() === 'list') {
        if (item && this.topSheet() !== Sheet.Thread) {
          this.pushSheet(Sheet.Thread);
        }
        if (!item && this.topSheet() === Sheet.Thread) {
          this.popSheet();
        }
      }
    }

    if (collection === 'file') {
      if (this.layoutMode() === 'list') {
        if (item && this.topSheet() !== Sheet.File) {
          this.pushSheet(Sheet.File);
        }
        if (!item && this.topSheet() === Sheet.File) {
          this.popSheet();
        }
      }
    }
  };

  _onSelectLayoutMode = mode => {
    if (mode === this._preferredLayoutMode) {
      return;
    }

    // Deselect the current thread - prevents the app from immediately marking a thread as
    // read immediately when turning the reading panel on.
    Actions.setFocus({ collection: 'thread', item: null });
    Actions.setCursorPosition({ collection: 'thread', item: null });

    this._preferredLayoutMode = mode;
    AppEnv.config.set('core.workspace.mode', this._preferredLayoutMode);
    this._rebuildShortcuts();
    this.popToRootSheet();
    this.trigger();
  };

  _rebuildShortcuts() {
    if (this._shortcuts) {
      this._shortcuts.dispose();
    }
    this._shortcuts = AppEnv.commands.add(
      document.body,
      Object.assign(
        {
          'core:pop-sheet': () => this.popSheet(),
        },
        this._preferredLayoutMode === 'list'
          ? { 'navigation:select-split-mode': () => this._onSelectLayoutMode('split') }
          : { 'navigation:select-list-mode': () => this._onSelectLayoutMode('list') }
      )
    );
  }

  /*
  Accessing Data
  */

  // Returns a {String}: The current layout mode. Either `split` or `list`
  //
  layoutMode() {
    const root = this.rootSheet();
    if (!root) {
      return 'list';
    } else if (root.supportedModes.includes(this._preferredLayoutMode)) {
      return this._preferredLayoutMode;
    } else {
      return root.supportedModes[0];
    }
  }

  preferredLayoutMode() {
    return this._preferredLayoutMode;
  }

  // Public: Returns The top {Sheet} in the current stack. Use this method to determine
  // the sheet the user is looking at.
  //
  topSheet() {
    return this._sheetStack[this._sheetStack.length - 1];
  }

  // Public: Returns The {Sheet} at the root of the current stack.
  //
  rootSheet() {
    return this._sheetStack[0];
  }

  // Public: Returns an {Array<Sheet>} The stack of sheets
  //
  sheetStack() {
    return this._sheetStack;
  }

  // Public: Returns an {Array} of locations that have been hidden.
  //
  hiddenLocations() {
    return Object.values(this._hiddenLocations);
  }

  // Public: Returns a {Boolean} indicating whether the location provided is hidden.
  // You should provide one of the WorkspaceStore.Location constant values.
  isLocationHidden(loc) {
    if (!loc) {
      return false;
    }
    return this._hiddenLocations[loc.id] != null;
  }

  /*
  Managing Sheets
  */

  // * `id` {String} The ID of the Sheet being defined.
  // * `options` {Object} If the sheet should be listed in the left sidebar,
  //      pass `{root: true, name: 'Label'}`.
  // *`columns` An {Object} with keys for each layout mode the Sheet
  //      supports. For each key, provide an array of column names.
  //
  defineSheet(id, options: Partial<SheetDeclaration> = {}, columns = {}) {
    // Make sure all the locations have definitions so that packages
    // can register things into these locations and their toolbars.
    for (let layout in columns) {
      const cols = columns[layout];
      for (let idx = 0; idx < cols.length; idx++) {
        const col = cols[idx];
        if (Location[col] == null) {
          Location[col] = { id: `${col}`, Toolbar: { id: `${col}:Toolbar` } };
        }
        cols[idx] = Location[col];
      }
    }

    Sheet[id] = {
      id,
      columns,
      supportedModes: Object.keys(columns),

      icon: options.icon,
      name: options.name,
      root: options.root,
      sidebarComponent: options.sidebarComponent,

      Toolbar: {
        Left: { id: `Sheet:${id}:Toolbar:Left` },
        Right: { id: `Sheet:${id}:Toolbar:Right` },
      },
      Header: { id: `Sheet:${id}:Header` },
      Footer: { id: `Sheet:${id}:Footer` },
    };

    if (options.root && !this.rootSheet() && !(options as any).silent) {
      this._onSelectRootSheet(Sheet[id]);
    }

    this.triggerDebounced();
  }

  undefineSheet(id) {
    delete Sheet[id];
    this.triggerDebounced();
  }

  // Push the sheet on top of the current sheet, with a quick animation.
  // A back button will appear in the top left of the pushed sheet.
  // This method triggers, allowing observers to update.
  //
  // * `sheet` The {Sheet} type to push onto the stack.
  //
  pushSheet = sheet => {
    this._sheetStack.push(sheet);
    this.trigger();
  };

  // Remove the top sheet, with a quick animation. This method triggers,
  // allowing observers to update.
  popSheet = () => {
    const sheet = this.topSheet();

    if (this._sheetStack.length > 1) {
      this._sheetStack.pop();
      this.trigger();
    }

    if (Sheet.Thread && sheet === Sheet.Thread) {
      Actions.setFocus({ collection: 'thread', item: null });
    }
  };

  // Return to the root sheet. This method triggers, allowing observers
  // to update.
  popToRootSheet = () => {
    if (this._sheetStack.length > 1) {
      this._sheetStack.length = 1;
      this.trigger();
    }
  };
}

export default new WorkspaceStore();
