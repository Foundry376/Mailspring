export {};

declare global {
  const AppEnv: import('../app-env').default;

  // Extensions to globalThis for main process
  // eslint-disable-next-line no-var
  var errorLogger: any;
  // eslint-disable-next-line no-var
  var application: any;

  interface Window {
    $m: any;
    AppEnv: import('../app-env').default;
    jasmine: any;
    // requestIdleCallback and cancelIdleCallback are now built-in to TypeScript's DOM lib
  }
}
