export {};

declare global {
  const AppEnv: import('../app-env').default;

  // Extensions to globalThis for main process
  var errorLogger: any;
  var application: any;

  interface Window {
    $m: any;
    AppEnv: import('../app-env').default;
    jasmine: any;
    // requestIdleCallback and cancelIdleCallback are now built-in to TypeScript's DOM lib
  }
}
