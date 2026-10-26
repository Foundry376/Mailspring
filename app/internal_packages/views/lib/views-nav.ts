import MailspringStore from 'mailspring-store';
import { Actions, FocusedContentStore, WorkspaceStore } from 'mailspring-exports';

/**
 * Where the user is within Views. The Views root sheet is the Views home; a View is the
 * ViewPage sheet pushed over it, so the toolbar's Back button ("‹ Views") returns home and a
 * thread the View opens is pushed over the View ("‹ <View name>"). Views are a section of the
 * main window reached from the nav rail, independent of the mailbox perspective.
 */
class _ViewsNavStore extends MailspringStore {
  _viewId: string | null = null;
  _showing = false;

  constructor() {
    super();
    this.listenTo(WorkspaceStore, this._onWorkspaceChanged);
  }

  /** The View on screen within Views, or null for the home. */
  viewId() {
    return this._viewId;
  }

  /** Whether the Views sheet is the main window's root sheet. */
  isShowingViews() {
    return WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Views;
  }

  /** The page View on screen, or null when the home or another section is showing. */
  focusedPageViewId() {
    return this.isShowingViews() ? this._viewId : null;
  }

  isShowingHome() {
    return this.isShowingViews() && !this._viewId;
  }

  showHome() {
    clearFocusedThread();
    this._showRoot();
    this._setViewId(null);
  }

  /**
   * With `animate: false` the home and the View go on the stack in one change, so the View
   * appears at once instead of sliding in over a flash of the home. The nav rail opens Views
   * this way.
   */
  showView(viewId: string, { animate = true }: { animate?: boolean } = {}) {
    clearFocusedThread();
    if (animate) {
      this._showRoot();
      Actions.pushSheet(WorkspaceStore.Sheet.ViewPage);
    } else {
      Actions.showSheetStack([WorkspaceStore.Sheet.Views, WorkspaceStore.Sheet.ViewPage]);
    }
    this._setViewId(viewId);
  }

  // Leaves only the Views home on the sheet stack.
  _showRoot() {
    if (!this.isShowingViews()) {
      Actions.selectRootSheet(WorkspaceStore.Sheet.Views);
    } else {
      Actions.popToRootSheet();
    }
  }

  _setViewId(viewId: string | null) {
    if (viewId === this._viewId) return;
    this._viewId = viewId;
    this.trigger();
  }

  _onWorkspaceChanged = () => {
    // Back from a View, or switching sections, pops the ViewPage sheet.
    if (this._viewId && !WorkspaceStore.sheetStack().includes(WorkspaceStore.Sheet.ViewPage)) {
      this._viewId = null;
      this._showing = this.isShowingViews();
      this.trigger();
      return;
    }
    const showing = this.isShowingViews();
    if (showing !== this._showing) {
      this._showing = showing;
      this.trigger();
    }
  };
}

// A thread a View opened would otherwise reappear over the next View or the home.
function clearFocusedThread() {
  if (FocusedContentStore.focused('thread')) {
    Actions.setFocus({ collection: 'thread', item: null });
  }
}

export const ViewsNavStore = new _ViewsNavStore();
