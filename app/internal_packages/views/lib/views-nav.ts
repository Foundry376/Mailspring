import MailspringStore from 'mailspring-store';
import { Actions, FocusedContentStore, WorkspaceStore } from 'mailspring-exports';

/**
 * What the Views sheet shows: the Views home, or one page View. Views are a section of the main
 * window reached from the nav rail, so this is independent of the mailbox perspective; leaving
 * for Mail returns to the mailbox that was showing.
 */
class _ViewsNavStore extends MailspringStore {
  _viewId: string | null = null;
  _showing = false;

  constructor() {
    super();
    this.listenTo(WorkspaceStore, this._onWorkspaceChanged);
  }

  /** The View the Views sheet shows, or null for the home. */
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
    this._show(null);
  }

  showView(viewId: string) {
    this._show(viewId);
  }

  _show(viewId: string | null) {
    const changed = viewId !== this._viewId;
    this._viewId = viewId;
    // A thread a View opened would otherwise reappear over the next View.
    if (FocusedContentStore.focused('thread')) {
      Actions.setFocus({ collection: 'thread', item: null });
    }
    const atRoot =
      this.isShowingViews() && WorkspaceStore.topSheet() === WorkspaceStore.Sheet.Views;
    if (!atRoot) Actions.selectRootSheet(WorkspaceStore.Sheet.Views);
    if (changed) this.trigger();
  }

  _onWorkspaceChanged = () => {
    const showing = this.isShowingViews();
    if (showing !== this._showing) {
      this._showing = showing;
      this.trigger();
    }
  };
}

export const ViewsNavStore = new _ViewsNavStore();
