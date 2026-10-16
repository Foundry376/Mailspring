import { installedViews } from '../view-registry';
import { ViewsNavStore } from '../views-nav';
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
import { waitForConsent } from '../consent';
import { renderMockScreenshot } from '../mock/mock-render';
import { regenerateStarterPosters } from '../home/starter-posters';

// An agent's preview that asks for new access waits this long for the user to answer the
// consent card before the agent is told it is still waiting.
const CONSENT_TIMEOUT_MS = 10 * 60 * 1000;

export { ViewRevision, Diagnostic, ViewDiagnostics, revisionOf };

/** Brings a page View on screen. Sidebar Views show whenever a thread is open. */
export function openView(viewId: string) {
  const view = installedViews().find((v) => v.id === viewId);
  if (!view) throw new Error(`No View "${viewId}".`);
  if (view.placement !== 'page') return false;
  ViewsNavStore.showView(view.id);
  return true;
}

/**
 * The authoring loop's host API: preview a revision
 * as a draft, watch its diagnostics, then promote or discard it. A preview replaces the
 * View's code in place: mounted copies reload, the host layout and sheet stack stay put,
 * and the installed copy is untouched until promotion.
 */
export const ViewAuthoring = {
  /** A screenshot of the View rendered from its mock-data.json (lib/mock/mock-render.tsx). */
  renderMockScreenshot,
  regenerateStarterPosters,

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

  /**
   * Previews a revision and resolves once it renders cleanly, fails, or times out. A revision
   * that asks for access the user hasn't allowed waits for their answer first; declining
   * fails the revision with a record the agent sees.
   */
  async previewAndWait(viewId: string, revision: ViewRevision, { timeoutMs = 15000 } = {}) {
    const { revision: hash } = this.previewView(viewId, revision);
    const consent = await waitForConsent(viewId, CONSENT_TIMEOUT_MS);
    if (consent !== 'approved') {
      ViewDiagnostics.add({
        viewId,
        revision: hash,
        kind: 'consent',
        level: 'error',
        message:
          consent === 'declined'
            ? 'The user did not allow the permissions or network hosts this revision asks for.'
            : 'The user has not yet allowed the permissions or network hosts this revision asks for.',
      });
      return {
        revision: hash,
        status: consent === 'declined' ? ('failed' as const) : ('timeout' as const),
        diagnostics: ViewDiagnostics.get(viewId, { revision: hash }),
      };
    }
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
