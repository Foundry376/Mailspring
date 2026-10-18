import { ViewManifest, allViews } from '../view-registry';

/**
 * The Edit buttons that open the panel for a View register their elements here, so the panel
 * can grow out of the button it was opened from and shrink back into it when minimized.
 */
const editButtons = new Map<string, HTMLElement>();

export function registerEditButton(viewId: string, el: HTMLElement | null) {
  if (el) editButtons.set(viewId, el);
  else editButtons.delete(viewId);
}

/** The on-screen rect of the View's Edit button, or null when none is showing. */
export function editButtonRect(viewId: string): DOMRect | null {
  const el = editButtons.get(viewId);
  if (!el || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  return rect.width && rect.height ? rect : null;
}

export function viewById(viewId: string): ViewManifest | null {
  return allViews().find((v) => v.id === viewId) || null;
}
