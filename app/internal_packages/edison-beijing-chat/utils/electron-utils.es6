import electron from 'electron';
import { NativeNotifications } from 'mailspring-exports';

const { dialog } = electron.remote;
export const getBrowserWindow = () => electron.remote.getCurrentWindow();

export const postNotification = (title, body) => {
  return NativeNotifications.displayNotification({
    title: title,
    subtitle: body,
    tag: 'chat-message',
    onActivate: () => {
      AppEnv.displayWindow();
    },
  });
};

export const alert = message => {
  dialog.showMessageBox({
    type: 'warning',
    message,
    buttons: ['OK'],
  });
};
