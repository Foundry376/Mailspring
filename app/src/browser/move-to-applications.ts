import { app, dialog } from 'electron';
import { localized } from '../intl';

export default function moveToApplications() {
  if (app.isInApplicationsFolder()) {
    return true;
  }

  // prompt the user and ask if they'd like to move the application
  const idx = dialog.showMessageBox({
    type: 'question',
    buttons: [localized('Move to Applications'), localized('Not Now')],
    defaultId: 0,
    cancelId: 1,
    title: localized('Move to Applications?'),
    message: localized(
      'Thanks for downloading Mailspring! Would you like to move it to your Applications folder?'
    ),
  });

  // move ourselves to the applications folder. This throws errors as necessary,
  // and quits / relaunches the app if successful
  if (idx === 0) {
    try {
      app.moveToApplicationsFolder();
    } catch (err) {
      dialog.showMessageBox({
        type: 'warning',
        buttons: [localized('Okay')],
        message: localized(
          `We encountered a problem moving to the Applications folder. Try quitting the application and moving it manually.`
        ),
        detail: err.toString(),
      });
    }
  }
}
