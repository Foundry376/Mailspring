// Roster management
export const BEGIN_FETCH_ROSTER = 'BEGIN_FETCH_ROSTER';
export const SUCCESS_FETCH_ROSTER = 'SUCCESS_FETCH_ROSTER';
export const FAIL_FETCH_ROSTER = 'FAIL_FETCH_ROSTER';

// User status from roster
export const USER_AVAILABLE = 'USER_AVAILABLE';
export const USER_UNAVAILABLE = 'USER_UNAVAILABLE';

export const BEGIN_FETCH_E2EE = 'BEGIN_FETCH_E2EE';
export const SUCCESS_FETCH_E2EE = 'SUCCESS_FETCH_E2EE';
// Roster management
export const fetchRoster = (payload) => ({ type: BEGIN_FETCH_ROSTER, payload });

export const fetchE2ee = (payload) => ({ type: BEGIN_FETCH_E2EE, payload });//yazz+
export const succesfullyFetchedE2ee = result => ({ type: SUCCESS_FETCH_E2EE, payload: result });

export const succesfullyFetchedRoster = result => ({ type: SUCCESS_FETCH_ROSTER, payload: result });

export const failedFetchingRoster = error => ({ type: FAIL_FETCH_ROSTER, payload: error });

// User status from roster
export const userAvailable = data => ({ type: USER_AVAILABLE, payload: data });

export const userUnvailable = data => ({ type: USER_UNAVAILABLE, payload: data });
