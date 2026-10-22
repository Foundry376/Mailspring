import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import { AuthoringPanel as AuthoringPanelComponent } from './authoring-panel';
import { panelSource } from './store';
import { viewById } from './launch';

export { EditViewButton } from './edit-view-button';

/**
 * Opens and closes the floating authoring panel. The agent store's active session is the
 * single source of truth for visibility, so these are thin wrappers over `setActive`.
 */
export const AuthoringPanel = {
  open(viewId: string) {
    const source = panelSource();
    return source ? source.actions.setActive(viewId) : Promise.resolve();
  },
  close() {
    const source = panelSource();
    return source ? source.actions.setActive(null) : Promise.resolve();
  },
};

/**
 * Opens the panel to change a View: its conversation if this window already has one, else an
 * empty composer that attaches to the View's server session (replaying its history) if it has
 * one. Neither creates a session.
 */
export async function openPanelForView(viewId: string) {
  const source = panelSource();
  if (!source) return;
  const { store, actions } = source;
  if (store.session(viewId)) {
    await actions.setActive(viewId);
    return;
  }
  const view = viewById(viewId);
  await actions.open(viewId, view ? view.name : viewId);
}

/** Opens the panel for a View with `text` waiting in the composer, unsent. */
export async function openPanelWithMessage(viewId: string, text: string) {
  await openPanelForView(viewId);
  const source = panelSource();
  if (source) await source.actions.prefill(viewId, text);
}

// Global.Footer renders on every sheet, so the panel stays put while the user navigates —
// including over a pushed Thread sheet. The panel positions itself (fixed) above everything.
export function registerAuthoringPanel() {
  if (!AppEnv.isMainWindow()) return;
  ComponentRegistry.register(AuthoringPanelComponent, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });
}

export function unregisterAuthoringPanel() {
  if (!AppEnv.isMainWindow()) return;
  ComponentRegistry.unregister(AuthoringPanelComponent);
}
