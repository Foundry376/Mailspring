import electron from 'electron';

export const getBrowserWindow = () => electron.remote.getCurrentWindow();

export const postNotification = (title, body) => {
  const browserWindow = getBrowserWindow();
  if (browserWindow.isFocused()) {
    return null;
  }

  const notification = new Notification(title, { body });
  return notification;
};
