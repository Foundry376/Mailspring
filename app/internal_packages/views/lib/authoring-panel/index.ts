import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import { AuthoringPanel as AuthoringPanelComponent } from './authoring-panel';
import { panelSource } from './store';
import { ViewsAuthoringPanelDemo } from './demo-store';

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

// Global.Footer renders on every sheet, so the panel stays put while the user navigates —
// including over a pushed Thread sheet. The panel positions itself (fixed) above everything.
export function registerAuthoringPanel() {
  if (!AppEnv.isMainWindow()) return;
  ComponentRegistry.register(AuthoringPanelComponent, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });
  if (AppEnv.inDevMode()) {
    (window as any).$m.ViewsAuthoringPanelDemo = ViewsAuthoringPanelDemo;
  }
}

export function unregisterAuthoringPanel() {
  if (!AppEnv.isMainWindow()) return;
  ComponentRegistry.unregister(AuthoringPanelComponent);
}
