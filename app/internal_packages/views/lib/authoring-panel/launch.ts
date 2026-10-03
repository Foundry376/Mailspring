import fs from 'fs';
import path from 'path';
import { FocusedPerspectiveStore } from 'mailspring-exports';
import { ViewManifest, installDir, installedViews } from '../view-registry';
import { ViewMailboxPerspective } from '../view-mailbox-perspective';

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

export function focusedPageViewId(): string | null {
  const perspective = FocusedPerspectiveStore.current();
  return perspective instanceof ViewMailboxPerspective ? perspective.viewId : null;
}

/**
 * A starter the user is trying: a draft copied from a starter that was never installed. The
 * panel shows the preview card for it until it's installed or removed.
 */
export function isTryDraft(view: ViewManifest | null | undefined) {
  if (!view || view.source !== 'draft' || !view.json || !view.json.starter) return false;
  return !fs.existsSync(path.join(installDir(), view.id));
}

export function viewById(viewId: string): ViewManifest | null {
  return installedViews().find((v) => v.id === viewId) || null;
}
