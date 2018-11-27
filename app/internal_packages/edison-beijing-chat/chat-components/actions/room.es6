// Room management
export const BEGIN_FETCH_ROOM = 'BEGIN_FETCH_ROOM';
export const SUCCESS_FETCH_ROOM = 'SUCCESS_FETCH_ROOM';
export const FAIL_FETCH_ROOM = 'FAIL_FETCH_ROOM';

// Room management
export const fetchRoom = (payload) => ({ type: BEGIN_FETCH_ROOM, payload });

export const succesfullyFetchedRoom = result => ({ type: SUCCESS_FETCH_ROOM, payload: result });

export const failedFetchingRoom = error => ({ type: FAIL_FETCH_ROOM, payload: error });
