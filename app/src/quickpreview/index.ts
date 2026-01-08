import { execFile } from 'child_process';
import path from 'path';
import { File } from 'mailspring-exports';
import { ipcRenderer } from 'electron';

// Generate token via IPC to ensure it's stored in the main process
async function generatePreviewToken(previewPath: string): Promise<string> {
  return ipcRenderer.invoke('quickpreview:generateToken', previewPath);
}

// Cleanup token via IPC
function cleanupPreviewToken(token: string): void {
  ipcRenderer.invoke('quickpreview:cleanupToken', token);
}

// Content Security Policy for quickpreview windows
// Restricts script execution while allowing external images
const QuickPreviewCSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for inline script in renderer.html
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:", // Allow external images
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
].join('; ');

let quickPreviewWindow = null;
let captureWindow = null;
const captureQueue = [];

const filesRoot = __dirname.replace('app.asar', 'app.asar.unpacked');

const FileSizeLimit = 5 * 1024 * 1024;
const ThumbnailWidth = 320 * (11 / 8.5);
const QuicklookIsAvailable = process.platform === 'darwin';
const PDFJSRoot = path.join(filesRoot, 'pdfjs-4.3.136');

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
  xlsx: ['xls', 'xlsx', 'csv', 'eth', 'ods', 'fods', 'uos1', 'uos2', 'dbf', 'prn', 'xlw', 'xlsb'],
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
    'yml',
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
        role: 'selectAll',
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
          if (focusedWindow) (focusedWindow as Electron.BrowserWindow).reload();
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
          if (focusedWindow) (focusedWindow as Electron.BrowserWindow).webContents.toggleDevTools();
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
    const { BrowserWindow } = require('@electron/remote');
    quickPreviewWindow = new BrowserWindow({
      width: 800,
      height: 600,
      center: true,
      skipTaskbar: true,
      backgroundColor: isPDF ? '#404040' : '#FFF',
      webPreferences: {
        preload: path.join(filesRoot, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Apply Content Security Policy
    quickPreviewWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [QuickPreviewCSP],
        },
      });
    });

    quickPreviewWindow.once('closed', () => {
      quickPreviewWindow = null;
    });
    quickPreviewWindow.setMenu(
      require('@electron/remote').Menu.buildFromTemplate(PreviewWindowMenuTemplate)
    );
  } else {
    quickPreviewWindow.show();
  }
  quickPreviewWindow.setTitle(path.basename(filePath));

  if (isPDF) {
    quickPreviewWindow.loadFile(path.join(PDFJSRoot, 'web/viewer.html'), {
      search: `file=${encodeURIComponent(`file://${filePath}`)}`,
    });
  } else {
    quickPreviewWindow.loadFile(path.join(filesRoot, 'renderer.html'), {
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
  const { BrowserWindow } = require('@electron/remote');
  const win = new BrowserWindow({
    width: ThumbnailWidth,
    height: ThumbnailWidth,
    show: false,
    webPreferences: {
      preload: path.join(filesRoot, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Apply Content Security Policy
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [QuickPreviewCSP],
      },
    });
  });

  win.webContents.on('render-process-gone', (event, details) => {
    console.warn(`Thumbnail generation webcontents crashed (reason: ${details.reason}).`);
    if (captureWindow === win) captureWindow = null;
    win.destroy();
  });
  win.once('closed', () => {
    if (captureWindow === win) captureWindow = null;
  });
  return win;
}

async function _generateNextCrossplatformPreview() {
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

  // Generate an opaque token for the preview path instead of passing the path directly
  // Token is generated via IPC to ensure it's stored in the main process
  const previewToken = await generatePreviewToken(previewPath);

  // Start the thumbnail generation
  captureWindow.loadFile(path.join(filesRoot, 'renderer.html'), {
    search: JSON.stringify({ strategy, mode: 'capture', filePath, previewToken }),
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
    // Clean up the token if preview failed (on success, IPC handler deletes it)
    if (!success) {
      cleanupPreviewToken(previewToken);
    }
    process.nextTick(_generateNextCrossplatformPreview);
    resolve(success);
  };

  captureWindow.once('page-title-updated', onRendererSuccess);
}

async function _generateQuicklookPreview({ filePath }: { filePath: string }) {
  const dirQuoted = path.dirname(filePath).replace(/"/g, '\\"');
  const pathQuoted = filePath.replace(/"/g, '\\"');

  return new Promise(resolve => {
    const cmd = '/usr/bin/qlmanage';
    const args = [
      '-t',
      '-f',
      `${window.devicePixelRatio}`,
      '-s',
      `${ThumbnailWidth}`,
      '-o',
      dirQuoted,
      pathQuoted,
    ];

    execFile(cmd, args, (error, stdout, stderr) => {
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
