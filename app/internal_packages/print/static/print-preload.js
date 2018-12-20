const fs = require('fs');
const remote = require('electron').remote;
const win = remote.getCurrentWindow();
const webcontents = remote.getCurrentWebContents();

win.addListener('page-title-updated', event => {
  event.preventDefault();
});

global.printToPDF = () => {
  remote.dialog.showSaveDialog(
    {
      defaultPath: `${win.getTitle()}.pdf`,
    },
    filename => {
      if (!filename) {
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
            remote.dialog.showErrorBox('An Error Occurred', `${error}`);
            return;
          }

          fs.writeFileSync(filename, data);
        }
      );
    }
  );
};
