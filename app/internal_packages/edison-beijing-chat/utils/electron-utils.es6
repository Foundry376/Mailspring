import electron from 'electron';

const { dialog } = electron.remote;

export const getBrowserWindow = () => electron.remote.getCurrentWindow();

export const postNotification = (title, body) => {
  const browserWindow = getBrowserWindow();
  // if (browserWindow.isFocused()) {
  //   return null;
  // }

  const notification = new Notification(title, { body });
  return notification;
};

export const alert = message => {
  dialog.showMessageBox({
    type: 'warning',
    message,
    buttons: ['OK'],
  });
}
