import { any } from 'prop-types';

export {};

declare global {
  const TEST_TIME_ZONE: string;
  const TEST_PLUGIN_ID: string;
  const TEST_ACCOUNT_ID: string;
  const TEST_ACCOUNT_NAME: string;
  const TEST_ACCOUNT_EMAIL: string;
  const TEST_ACCOUNT_CLIENT_ID: string;
  const TEST_ACCOUNT_ALIAS_EMAIL: string;

  const waitsForPromise: (
    a: { shouldReject?: boolean; timeout?: number } | (() => Promise<any>),
    b?: (() => Promise<any>)
  ) => Promise<any>;

  export const advanceClock: (delta?: number) => void;
  export const resetTime: () => void;
  export const enableSpies: () => void;
}
