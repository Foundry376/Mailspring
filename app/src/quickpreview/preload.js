const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
  previewFileAsString: (...args) => ipcRenderer.invoke('quickpreview:previewFileAsString', ...args),
  previewFileAsBuffer: (...args) => ipcRenderer.invoke('quickpreview:previewFileAsBuffer', ...args),
  previewFileAsMammothHTML: (...args) =>
    ipcRenderer.invoke('quickpreview:previewFileAsMammothHTML', ...args),
  previewFileAsSnarkdownHTML: (...args) =>
    ipcRenderer.invoke('quickpreview:previewFileAsSnarkdownHTML', ...args),
  finishWithData: (...args) => ipcRenderer.invoke('quickpreview:finishWithData', ...args),
  finishCapture: (...args) => ipcRenderer.invoke('quickpreview:finishCapture', ...args),
});

document.addEventListener('keydown', e => {
  if (e.which === 27) {
    // esc
    window.close();
  }
});
