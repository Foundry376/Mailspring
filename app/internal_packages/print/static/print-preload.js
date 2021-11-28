const fs = require('fs');
const win = require('@electron/remote').getCurrentWindow();
const webcontents = require('@electron/remote').getCurrentWebContents();

win.addListener('page-title-updated', event => {
  event.preventDefault();
});

global.printToPDF = async () => {
  const { filePath } = awaitrequire('@electron/remote').dialog.showSaveDialog({
    defaultPath: `${win.getTitle()}.pdf`,
  });

  if (!filePath) {
    return;
  }
  webcontents.printToPDF(
    {
      marginsType: 0,
      pageSize: 'Letter',
      printBackground: true,
      landscape: false,
    },
    (error, data) => {
      if (error) {
        require('@electron/remote').dialog.showErrorBox('An Error Occurred', `${error}`);
        return;
      }

      fs.writeFileSync(filename, data);
    }
  );
};
