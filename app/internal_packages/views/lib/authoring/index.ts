import { Actions, FocusedPerspectiveStore } from 'mailspring-exports';
import { installedViews } from '../view-registry';
import { ViewMailboxPerspective } from '../view-mailbox-perspective';
import { reloadMountedView } from './hosts';
import {
  ViewRevision,
  discardDraft,
  hasDraft,
  promoteDraft,
  revisionOf,
  writeDraft,
} from './drafts';
import { Diagnostic, ViewDiagnostics } from './diagnostics';
import { captureViewPreview } from './preview';

export { ViewRevision, Diagnostic, ViewDiagnostics, revisionOf };

/** Brings a page View on screen. Sidebar Views show whenever a thread is open. */
export function openView(viewId: string) {
  const view = installedViews().find((v) => v.id === viewId);
  if (!view) throw new Error(`No View "${viewId}".`);
  if (view.placement !== 'page') return false;
  const perspective = new ViewMailboxPerspective(
    FocusedPerspectiveStore.sidebarAccountIds(),
    view.id,
    view.name
  );
  Actions.focusMailboxPerspective(perspective);
  return true;
}

/**
 * The authoring loop's host API: preview a revision
 * as a draft, watch its diagnostics, then promote or discard it. A preview replaces the
 * View's code in place: mounted copies reload, the host layout and sheet stack stay put,
 * and the installed copy is untouched until promotion.
 */
export const ViewAuthoring = {
  /**
   * Writes the revision as the View's draft and reloads it (opening it first if it's a page
   * View that isn't on screen and `open` is true). Resolves to the revision hash to match
   * against diagnostics.
   */
  previewView(viewId: string, revision: ViewRevision, { open = true } = {}) {
    const hash = writeDraft(viewId, revision);
    ViewDiagnostics.clear(viewId);
    // Mounted copies reload from the registry change; a View that isn't mounted loads fresh.
    if (open) openView(viewId);
    return { revision: hash };
  },

  /** Previews a revision and resolves once it renders cleanly, fails, or times out. */
  async previewAndWait(viewId: string, revision: ViewRevision, { timeoutMs = 15000 } = {}) {
    const { revision: hash } = this.previewView(viewId, revision);
    const outcome = await ViewDiagnostics.waitForOutcome(viewId, hash, timeoutMs);
    return { revision: hash, ...outcome };
  },

  reloadView(viewId: string) {
    return reloadMountedView(viewId);
  },

  promoteDraft,
  discardDraft,
  hasDraft,
  captureViewPreview,

  getDiagnostics(viewId: string, opts?: { revision?: string }): Diagnostic[] {
    return ViewDiagnostics.get(viewId, opts);
  },

  /** Calls `callback` with each new record (for every View). Returns an unsubscribe. */
  onDiagnostic(callback: (d: Diagnostic) => void) {
    ViewDiagnostics.on('diagnostic', callback);
    return () => ViewDiagnostics.removeListener('diagnostic', callback);
  },

  listViews() {
    return installedViews().map(({ id, name, placement, source, dir }) => ({
      id,
      name,
      placement,
      source,
      dir,
    }));
  },
};
