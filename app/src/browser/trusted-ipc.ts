import { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { isMailspringWindowContents } from './mailspring-window';

/**
 * IPC listeners that only Mailspring's own windows can reach. Webview guests (the onboarding
 * sign-in page) and auxiliary windows (print, quick preview, "show original") render untrusted
 * content, and a compromised renderer can send any message on any channel, so a handler that
 * acts on the app, the system or another window must check who is asking.
 */
export function onFromMailspringWindows(
  ipcMain: IpcMain,
  channel: string,
  listener: (event: IpcMainEvent, ...args: any[]) => void
) {
  ipcMain.on(channel, (event, ...args) => {
    if (isMailspringWindowContents(event.sender)) listener(event, ...args);
  });
}

export function handleFromMailspringWindows(
  ipcMain: IpcMain,
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => any
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isMailspringWindowContents(event.sender)) {
      throw new Error(`${channel} is only available to Mailspring windows.`);
    }
    return handler(event, ...args);
  });
}
