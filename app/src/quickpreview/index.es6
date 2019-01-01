import { remote } from 'electron';
import { exec } from 'child_process';
import path from 'path';

let quickPreviewWindow = null;
let captureWindow = null;
let captureQueue = [];

const FileSizeLimit = 5 * 1024 * 1024;
const ThumbnailWidth = 320 * (11 / 8.5);
const QuicklookIsAvailable = process.platform === 'darwin';
const PDFJSRoot = path.join(__dirname, 'pdfjs-2.0.943');

// TODO make this list more exhaustive
const QuicklookNonPreviewableExtensions = [
  'jpg',
  'bmp',
  'gif',
  'png',
  'jpeg',
  'zip',
  'tar',
  'gz',
  'bz2',
  'dmg',
  'exe',
  'ics',
];

const CrossplatformPreviewableExtensions = [
  // pdfjs
  'pdf',

  // Mammoth
  'docx',

  // Snarkdown
  'md',

  // XLSX
  'xls',
  'xlsx',
  'csv',
  'eth',
  'ods',
  'fods',
  'uos1',
  'uos2',
  'dbf',
  'txt',
  'prn',
  'xlw',
  'xlsb',
];

export function canPossiblyPreviewExtension(file) {
  if (file.size > FileSizeLimit) {
    return false;
  }
  // On macOS, we try to quicklook basically everything because it supports
  // a large number of formats and plugins (adding support for Sketch files, etc).
  // On other platforms, we only preview a specific set of formats we support.
  if (QuicklookIsAvailable) {
    return !QuicklookNonPreviewableExtensions.includes(file.displayExtension());
  } else {
    return CrossplatformPreviewableExtensions.includes(file.displayExtension());
  }
}

export function displayQuickPreviewWindow(filePath) {
  if (QuicklookIsAvailable) {
    const currentWin = AppEnv.getCurrentWindow();
    currentWin.previewFile(filePath);
    return;
  }

  const isPDF = filePath.endsWith('.pdf');

  if (quickPreviewWindow === null) {
    quickPreviewWindow = new remote.BrowserWindow({
      width: 800,
      height: 600,
      center: true,
      skipTaskbar: true,
      backgroundColor: isPDF ? '#404040' : '#FFF',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: false,
      },
    });
    quickPreviewWindow.once('closed', () => {
      quickPreviewWindow = null;
    });
  } else {
    quickPreviewWindow.show();
  }
  quickPreviewWindow.setTitle(path.basename(filePath));
  if (isPDF) {
    quickPreviewWindow.loadFile(path.join(PDFJSRoot, 'web/viewer.html'), {
      search: `file=${encodeURIComponent(`file://${filePath}`)}`,
    });
  } else {
    quickPreviewWindow.loadFile(path.join(__dirname, 'renderer.html'), {
      search: JSON.stringify({ mode: 'display', filePath }),
    });
  }
}

export async function generatePreview(...args) {
  if (QuicklookIsAvailable) {
    return await _generateQuicklookPreview(...args);
  } else {
    return await _generateCrossplatformPreview(...args);
  }
}

// Private

async function _generateCrossplatformPreview({ file, filePath, previewPath }) {
  if (!CrossplatformPreviewableExtensions.includes(file.displayExtension())) {
    return false;
  }

  return new Promise(resolve => {
    captureQueue.push({ file, filePath, previewPath, resolve });

    if (!captureWindow || captureWindow.isDestroyed()) {
      captureWindow = new remote.BrowserWindow({
        width: ThumbnailWidth,
        height: ThumbnailWidth,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: false,
          contextIsolation: false,
        },
      });
      captureWindow.once('closed', () => {
        captureWindow = null;
      });
      _generateNextCrossplatformPreview();
    }
  });
}

function _generateNextCrossplatformPreview() {
  if (captureQueue.length === 0) {
    captureWindow.destroy();
    captureWindow = null;
    return;
  }

  const { filePath, previewPath, resolve } = captureQueue.pop();

  captureWindow.loadFile(path.join(__dirname, 'renderer.html'), {
    search: JSON.stringify({ mode: 'capture', filePath, previewPath }),
  });

  // Race against a timer to complete the preview. We don't want this to hang
  // forever if for some reason the window encounters an exception
  const timer = setTimeout(() => {
    _generateNextCrossplatformPreview();
    resolve(false);
  }, 3000);

  captureWindow.once('page-title-updated', () => {
    clearTimeout(timer);
    _generateNextCrossplatformPreview();
    resolve(true);
  });
}

async function _generateQuicklookPreview({ filePath }) {
  const dirQuoted = `"${path.dirname(filePath).replace(/"/g, '\\"')}"`;
  const pathQuoted = `"${filePath.replace(/"/g, '\\"')}"`;

  return new Promise(resolve => {
    const cmd = `qlmanage -t -f ${
      window.devicePixelRatio
    } -s ${ThumbnailWidth} -o ${dirQuoted} ${pathQuoted}`;

    exec(cmd, (error, stdout, stderr) => {
      // Note: sometimes qlmanage outputs to stderr but still successfully
      // produces a thumbnail. It complains about bad plugins pretty often.
      if (
        error ||
        stdout.match(/No thumbnail created/i) ||
        (stderr && !stdout.includes('produced one thumbnail'))
      ) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
