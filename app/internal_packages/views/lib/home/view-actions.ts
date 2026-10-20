import { localized } from 'mailspring-exports';
import { ViewManifest, notifyViewsChanged } from '../view-registry';
import { deleteViewFiles } from '../authoring/revisions';
import { ViewsNavStore } from '../views-nav';
import { removeThumbnail } from './thumbnails';
import { forgetView } from '../consent';
import { setPinned } from '../nav/pins';
import { clearBadge } from '../nav/badges';
import { AgentSessionStore } from '../agent/store';

export function openViewsHome() {
  ViewsNavStore.showHome();
}

/**
 * Deletes everything this computer keeps for a View: its files and checkpoints, thumbnail,
 * pin, badge, approvals, credentials, agent bookkeeping and its webview's own storage. Its
 * metadata (`view:<id>`) stays on the user's threads and expires under the server's retention
 * policy, so removing a View never rewrites mail.
 */
export function purgeView(viewId: string) {
  if (ViewsNavStore.viewId() === viewId) openViewsHome();
  AgentSessionStore.forget(viewId);
  deleteViewFiles(viewId);
  removeThumbnail(viewId);
  setPinned(viewId, false);
  clearBadge(viewId);
  forgetView(viewId);
  const partition = require('@electron/remote').session.fromPartition(`persist:view-${viewId}`);
  Promise.all([partition.clearStorageData(), partition.clearCache()]).catch((err: Error) =>
    console.warn(`Views: clearing ${viewId}'s storage: ${err.message}`)
  );
  notifyViewsChanged([viewId], true);
}

/** Removes a View after confirming. Bundled examples (dev mode) can't be removed. */
export function removeView(view: ViewManifest) {
  const chosen = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'warning',
    buttons: [localized('Remove'), localized('Cancel')],
    defaultId: 1,
    cancelId: 1,
    message: localized('Remove “%@”?', view.name),
    detail: localized('The View is removed from this computer. Your mail is not changed.'),
  });
  if (chosen !== 0) return false;
  purgeView(view.id);
  return true;
}
