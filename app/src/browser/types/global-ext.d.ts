
export {};
declare global {
  module NodeJS {
    interface Global {
      shellStartTime: number;
      errorLogger: import('../../error-logger');
      application: import('../application').default;
    }
  }

  module Electron {
    interface BrowserWindow {
      loadSettings: object;
      loadSettingsChangedSinceGetURL: boolean;
      updateLoadSettings: boolean;
    }
    interface TouchBarButton {
      command: string;
      group: string;
    }
    interface TouchBarSpacer {
      command: string;
      group: string;
    }
  }
}