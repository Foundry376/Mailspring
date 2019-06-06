export const BEGIN_FETCH_E2EE = 'BEGIN_FETCH_E2EE';
export const SUCCESS_FETCH_E2EE = 'SUCCESS_FETCH_E2EE';
export const FAIL_FETCH_E2EE = 'FAIL_FETCH_E2EE';

export const fetchE2ee = (payload) => ({ type: BEGIN_FETCH_E2EE, payload });//yazz+
export const succesfullyFetchedE2ee = result => ({ type: SUCCESS_FETCH_E2EE, payload: result });
export const failedFetchingE2ee = error => ({ type: FAIL_FETCH_E2EE, payload: error });

