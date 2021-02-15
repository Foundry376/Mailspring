export {};
declare global {
  module NodeJS {
    interface Global {
      jasmine: any;
      shellStartTime: number;
      errorLogger: any;
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
