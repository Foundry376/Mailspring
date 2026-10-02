const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printToPDF', () => {
  ipcRenderer.postMessage('print-to-pdf');
});
