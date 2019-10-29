import { app, dialog } from 'electron';

export default function moveToApplications() {
  if (app.isInApplicationsFolder()) {
    return true;
  }

  // prompt the user and ask if they'd like to move the application
  return dialog.showMessageBox({
    type: 'question',
    buttons: ['Move to Applications', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
    title: 'Move to Applications?',
    message:
      'Thanks for downloading EdisonMail! Would you like to move it to your Applications folder?',
  }).then(({ response }) => {
    // move ourselves to the applications folder. This throws errors as necessary,
    // and quits / relaunches the app if successful
    if (response === 0) {
      try {
        app.moveToApplicationsFolder();
      } catch (err) {
        dialog.showMessageBox({
          type: 'warning',
          buttons: ['Okay'],
          message: `We encountered a problem moving to the Applications folder. Try quitting the application and moving it manually.`,
          detail: err.toString(),
        });
      }
    }
    return new Promise.resolve();
  });

}
