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
  interface Window {
    $m: any;

    requestIdleCallback: ((
      callback: ((deadline: RequestIdleCallbackDeadline) => void),
      opts?: RequestIdleCallbackOptions
    ) => RequestIdleCallbackHandle);

    cancelIdleCallback: ((handle: RequestIdleCallbackHandle) => void);
  }
}
