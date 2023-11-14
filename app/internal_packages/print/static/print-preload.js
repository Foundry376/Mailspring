const ipc = require('electron').ipcRenderer;

global.printToPDF = async () => {
  ipc.postMessage('print-to-pdf');
};
