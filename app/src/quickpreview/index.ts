import { remote } from 'electron';
import { exec } from 'child_process';
import path from 'path';
import { File } from 'mailspring-exports';

let quickPreviewWindow = null;
let captureWindow = null;
let captureQueue = [];

const FileSizeLimit = 5 * 1024 * 1024;
const ThumbnailWidth = 320 * (11 / 8.5);
const QuicklookIsAvailable = process.platform === 'darwin';
const PDFJSRoot = path.join(__dirname, 'pdfjs-2.0.943');

const QuicklookBlacklist = [
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

const CrossplatformStrategies = {
  pdfjs: ['pdf'],
  mammoth: ['docx'],
  snarkdown: ['md'],
  xlsx: [
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
  ],
  prism: [
    'html',
    'svg',
    'xml',
    'css',
    'c',
    'cc',
    'cpp',
    'js',
    'jsx',
    'tsx',
    'ts',
    'go',
    'cs',
    'patch',
    'swift',
    'java',
    'json',
    'jsonp',
    'tex',
    'mm',
    'm',
    'h',
    'py',
    'rb',
    'rs',
    'sql',
    'yaml',
    'txt',
    'log',
  ],
};

const CrossplatformStrategiesBetterThanQuicklook = ['snarkdown', 'prism'];

function strategyForPreviewing(ext) {
  if (ext.startsWith('.')) ext = ext.substr(1);

  const strategy = Object.keys(CrossplatformStrategies).find(strategy =>
    CrossplatformStrategies[strategy].includes(ext)
  );

  if (QuicklookIsAvailable && !QuicklookBlacklist.includes(ext)) {
    if (!strategy || !CrossplatformStrategiesBetterThanQuicklook.includes(strategy)) {
      return 'quicklook';
    }
  }

  return strategy;
}

const PreviewWindowMenuTemplate: Electron.MenuItemConstructorOptions[] = [
  {
    label: 'File',
    role: 'window',
    submenu: [
      {
        label: 'Minimize Window',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize',
      },
      {
        label: 'Close Window',
        accelerator: 'CmdOrCtrl+W',
        role: 'close',
      },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        role: 'undo',
      },
      {
        label: 'Redo',
        accelerator: 'Shift+CmdOrCtrl+Z',
        role: 'redo',
      },
      {
        type: 'separator',
      },
      {
        label: 'Cut',
        accelerator: 'CmdOrCtrl+X',
        role: 'cut',
      },
      {
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        role: 'copy',
      },
      {
        label: 'Paste',
        accelerator: 'CmdOrCtrl+V',
        role: 'paste',
      },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        role: 'selectall',
      },
    ],
  },
  {
    label: 'View',
    submenu: [
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: function(item, focusedWindow) {
          if (focusedWindow) focusedWindow.reload();
        },
      },
      {
        label: 'Toggle Full Screen',
        accelerator: (function() {
          if (process.platform === 'darwin') return 'Ctrl+Command+F';
          else return 'F11';
        })(),
        click: function(item, focusedWindow) {
          if (focusedWindow) focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
        },
      },
      {
        label: 'Toggle Developer Tools',
        accelerator: (function() {
          if (process.platform === 'darwin') return 'Alt+Command+I';
          else return 'Ctrl+Shift+I';
        })(),
        click: function(item, focusedWindow) {
          if (focusedWindow) focusedWindow.webContents.toggleDevTools();
        },
      },
    ],
  },
];

export function canPossiblyPreviewExtension(file) {
  if (file.size > FileSizeLimit) {
    return false;
  }
  return !!strategyForPreviewing(file.displayExtension());
}

export function displayQuickPreviewWindow(filePath) {
  const isPDF = filePath.endsWith('.pdf');
  const strategy = strategyForPreviewing(path.extname(filePath));

  if (strategy === 'quicklook') {
    const currentWin = AppEnv.getCurrentWindow();
    currentWin.previewFile(filePath);
    return;
  }

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
    quickPreviewWindow.setMenu(remote.Menu.buildFromTemplate(PreviewWindowMenuTemplate));
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
      search: JSON.stringify({ mode: 'display', filePath, strategy }),
    });
  }
}

export async function generatePreview({
  file,
  filePath,
  previewPath,
}: {
  file: File;
  filePath: string;
  previewPath: string;
}) {
  const strategy = strategyForPreviewing(file.displayExtension());

  if (strategy === 'quicklook') {
    return await _generateQuicklookPreview({ filePath });
  } else if (strategy) {
    return await _generateCrossplatformPreview({ file, filePath, previewPath, strategy });
  } else {
    return false;
  }
}

// Private

async function _generateCrossplatformPreview({ file, filePath, previewPath, strategy }) {
  return new Promise(resolve => {
    captureQueue.push({ file, filePath, previewPath, strategy, resolve });

    if (!captureWindow || captureWindow.isDestroyed()) {
      captureWindow = _createCaptureWindow();
      _generateNextCrossplatformPreview();
    }
  });
}

function _createCaptureWindow() {
  const win = new remote.BrowserWindow({
    width: ThumbnailWidth,
    height: ThumbnailWidth,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: false,
    },
  });
  win.webContents.on('crashed', () => {
    console.warn(`Thumbnail generation webcontents crashed.`);
    if (captureWindow === win) captureWindow = null;
    win.destroy();
  });
  win.once('closed', () => {
    if (captureWindow === win) captureWindow = null;
  });
  return win;
}

function _generateNextCrossplatformPreview() {
  if (captureQueue.length === 0) {
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.destroy();
    } else {
      console.warn(`Thumbnail generation finished but window is already destroyed.`);
    }
    captureWindow = null;
    return;
  }

  const { strategy, filePath, previewPath, resolve } = captureQueue.pop();

  // Start the thumbnail generation
  captureWindow.loadFile(path.join(__dirname, 'renderer.html'), {
    search: JSON.stringify({ strategy, mode: 'capture', filePath, previewPath }),
  });

  // Race against a timer to complete the preview. We don't want this to hang
  // forever if for some reason the window encounters an exception
  let onFinalize = null;

  const timer = setTimeout(() => {
    console.warn(`Thumbnail generation timed out for ${filePath}`);
    onFinalize(false);
  }, 5000);

  const onRendererSuccess = () => {
    onFinalize(true);
  };

  onFinalize = success => {
    clearTimeout(timer);
    if (captureWindow) {
      captureWindow.removeListener('page-title-updated', onRendererSuccess);
    }
    process.nextTick(_generateNextCrossplatformPreview);
    resolve(success);
  };

  captureWindow.once('page-title-updated', onRendererSuccess);
}

async function _generateQuicklookPreview({ filePath }: { filePath: string }) {
  const dirQuoted = `"${path.dirname(filePath).replace(/"/g, '\\"')}"`;
  const pathQuoted = `"${filePath.replace(/"/g, '\\"')}"`;

  return new Promise(resolve => {
    const cmd = `qlmanage -t -f ${window.devicePixelRatio} -s ${ThumbnailWidth} -o ${dirQuoted} ${pathQuoted}`;

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
