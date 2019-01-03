const fs = require('fs');
const path = require('path');

const PDFJSRoot = path.join(__dirname, 'pdfjs-2.0.943');

global.nodePDFForFile = async filePath => {
  global.pdfjs = require(`${PDFJSRoot}/build/pdf.js`);
  global.pdfjs.GlobalWorkerOptions.workerSrc = path.join(PDFJSRoot, 'build', 'pdf.worker.js');

  return await global.pdfjs.getDocument(filePath, {
    cMapUrl: path.join(PDFJSRoot, 'web', 'cmaps'),
    cMapPacked: true,
  });
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

  const win = require('electron').remote.getCurrentWindow();
  win.capturePage(img => {
    fs.writeFileSync(previewPath, img.toPNG());
    document.title = 'Finished';
  });
};

document.addEventListener('keydown', e => {
  if (e.which === 27) {
    // esc
    window.close();
  }
});
