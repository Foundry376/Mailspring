import { IpcMain, IpcMainInvokeEvent } from 'electron/main';

const fs = require('fs');
const path = require('path');

const checkPathIsWithinFiles = (filePath: string) => {
  if (!filePath.startsWith(path.join(global.application.configDirPath, 'files'))) {
    throw new Error(`Quick preview cannot access this directory: ${filePath}`);
  }
  return filePath;
};

const getFilePath = (url: string) => {
  const { filePath } = JSON.parse(decodeURIComponent(new URL(url).search.slice(1)));
  return checkPathIsWithinFiles(filePath);
};

const previewFileAsString = (event: IpcMainInvokeEvent, { truncate } = { truncate: false }) => {
  const filepath = getFilePath(event.sender.getURL());
  let raw = fs.readFileSync(filepath).toString();
  if (truncate) raw = raw.substr(0, 1000);
  return raw;
};

const previewFileAsBuffer = (event: IpcMainInvokeEvent) => {
  const filepath = getFilePath(event.sender.getURL());
  return fs.readFileSync(filepath);
};

const previewFileAsMammothHTML = async (event: IpcMainInvokeEvent) => {
  const filepath = getFilePath(event.sender.getURL());
  const mammoth = require('mammoth');
  const result = await mammoth.convertToHtml({ path: filepath });
  return result.value;
};

const previewFileAsSnarkdownHTML = async (event: IpcMainInvokeEvent) => {
  const filepath = getFilePath(event.sender.getURL());
  const md = fs.readFileSync(filepath).toString();
  return require('snarkdown')(md);
};

const finishWithData = (_: IpcMainInvokeEvent, previewPath: string, arrayBuffer) => {
  checkPathIsWithinFiles(previewPath);
  fs.writeFileSync(previewPath, Buffer.from(arrayBuffer));
};

const finishCapture = async (event: IpcMainInvokeEvent, previewPath: string) => {
  checkPathIsWithinFiles(previewPath);
  const img = await event.sender.capturePage();
  fs.writeFileSync(previewPath, img.toPNG());
};

export function registerQuickpreviewIPCHandlers(ipcMain: IpcMain) {
  ipcMain.handle('quickpreview:previewFileAsString', previewFileAsString);
  ipcMain.handle('quickpreview:previewFileAsBuffer', previewFileAsBuffer);
  ipcMain.handle('quickpreview:previewFileAsMammothHTML', previewFileAsMammothHTML);
  ipcMain.handle('quickpreview:previewFileAsSnarkdownHTML', previewFileAsSnarkdownHTML);
  ipcMain.handle('quickpreview:finishWithData', finishWithData);
  ipcMain.handle('quickpreview:finishCapture', finishCapture);
}
