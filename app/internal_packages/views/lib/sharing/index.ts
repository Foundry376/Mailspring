import { ipcRenderer } from 'electron';
import { localized } from 'mailspring-exports';
import { shareIdFromInstallURL } from './share-link';
import { openInstallSheet } from './install-sheet';

export { ShareViewButton, canShare } from './share-view-button';
export { openShareSheet } from './share-sheet';

/** `mailspring://install-view?share=<id>`, routed here by Application.openUrl. */
function onInstallViewURL(event: Electron.IpcRendererEvent, url: string) {
  const shareId = shareIdFromInstallURL(url);
  if (!shareId) {
    AppEnv.showErrorDialog({
      title: localized('Views'),
      message: localized('This link to a shared View isn’t valid.'),
    });
    return;
  }
  openInstallSheet(shareId);
}

export function registerInstallLinks() {
  if (AppEnv.isMainWindow()) ipcRenderer.on('install-view', onInstallViewURL);
}

export function unregisterInstallLinks() {
  ipcRenderer.removeListener('install-view', onInstallViewURL);
}
