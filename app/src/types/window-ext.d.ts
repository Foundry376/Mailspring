type RequestIdleCallbackHandle = any;
type RequestIdleCallbackOptions = {
  timeout: number;
};
type RequestIdleCallbackDeadline = {
  readonly didTimeout: boolean;
  timeRemaining: (() => number);
};

export {};

declare global {
  var AppEnv: import('../app-env').default;
  
  interface Window {
    $m: any;
    AppEnv: import('../app-env').default;
    jasmine: any;
    
    requestIdleCallback: ((
      callback: ((deadline: RequestIdleCallbackDeadline) => void),
      opts?: RequestIdleCallbackOptions
    ) => RequestIdleCallbackHandle);

    cancelIdleCallback: ((handle: RequestIdleCallbackHandle) => void);
  }
}
