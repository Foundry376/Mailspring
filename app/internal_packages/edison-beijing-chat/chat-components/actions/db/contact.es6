export const BEGIN_STORE_E2EES = 'BEGIN_STORE_E2EES';
export const SUCCESS_STORE_E2EES = 'SUCCESS_STORE_E2EES';
export const FAIL_STORE_E2EES = 'FAIL_STORE_E2EES';


export const storeE2ees = e2ees => ({ type: BEGIN_STORE_E2EES, payload: e2ees });

export const successfullyStoredE2ees = e2ees =>
  ({ type: SUCCESS_STORE_E2EES, payload: e2ees });

export const failedStoringE2ees = (error, e2ees) =>
  ({ type: FAIL_STORE_E2EES, payload: { error, e2ees } });

