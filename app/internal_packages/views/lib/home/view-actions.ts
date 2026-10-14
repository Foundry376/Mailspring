import fs from 'fs';
import path from 'path';
import { localized } from 'mailspring-exports';
import { ViewManifest, installDir, notifyViewsChanged } from '../view-registry';
import { discardDraft } from '../authoring/drafts';
import { ViewsNavStore } from '../views-nav';
import { removeThumbnail } from './thumbnails';
import { forgetView } from '../consent';

export function openViewsHome() {
  ViewsNavStore.showHome();
}

/**
 * Deletes the View's installed copy, draft, thumbnail, approvals and credentials after
 * confirming. Its metadata
 * (`view:<id>`) stays on the user's threads and expires under the server's retention policy,
 * so removing a View never rewrites mail. Bundled examples (dev mode) can't be removed.
 */
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

  if (ViewsNavStore.viewId() === view.id) openViewsHome();
  discardDraft(view.id);
  fs.rmSync(path.join(installDir(), view.id), { recursive: true, force: true });
  removeThumbnail(view.id);
  forgetView(view.id);
  notifyViewsChanged([view.id], true);
  return true;
}
