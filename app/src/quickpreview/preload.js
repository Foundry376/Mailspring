const fs = require('fs');
const path = require('path');

global.PDFJSRoot = path.join(__dirname, 'pdfjs-2.0.943');
global.PrismRoot = path.join(__dirname, 'prism-1.15.0');

global.nodePDFForFile = async filePath => {
  global.pdfjs = require(`${global.PDFJSRoot}/build/pdf.js`);
  global.pdfjs.GlobalWorkerOptions.workerSrc = path.join(
    global.PDFJSRoot,
    'build',
    'pdf.worker.js'
  );

  return await global.pdfjs.getDocument(filePath, {
    cMapUrl: path.join(global.PDFJSRoot, 'web', 'cmaps'),
    cMapPacked: true,
  });
};

global.nodeStringForFile = (filePath, { truncate } = {}) => {
  let raw = fs.readFileSync(filePath).toString();
  if (truncate) raw = raw.substr(0, 1000);
  return raw;
};

global.nodeXLSXForFile = filepath => {
  global.xlsx = require('xlsx');
  return fs.readFileSync(filepath);
};

global.nodeMammothHTMLForFile = async filepath => {
  const mammoth = require('mammoth');
  const result = await mammoth.convertToHtml({ path: filepath });
  return result.value;
};

global.nodeSnarkdownHTMLForFile = async filepath => {
  const md = fs.readFileSync(filepath).toString();
  return require('snarkdown')(md);
};

global.finishWithData = (previewPath, arrayBuffer) => {
  fs.writeFileSync(previewPath, Buffer.from(arrayBuffer));
  document.title = 'Finished';
};

global.finishWithWindowCapture = (previewPath, startedAt = Date.now()) => {
  // Remove scroll bars or they appear in the capture on Windows
  document.body.style.overflow = 'hidden';

  // Wait up to 1 sec for images in the rendered HTML to finish loading
  const waitingForImage = Array.from(document.querySelectorAll('img')).find(
    i => i.complete === false
  );
  if (waitingForImage && Date.now() - startedAt < 1000) {
    setTimeout(() => global.finishWithWindowCapture(previewPath, startedAt), 50);
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const win = require('electron').remote.getCurrentWindow();
        win.capturePage(img => {
          fs.writeFileSync(previewPath, img.toPNG());
          document.title = 'Finished';
        });
      });
    });
  });
};

document.addEventListener('keydown', e => {
  if (e.which === 27) {
    // esc
    window.close();
  }
});
