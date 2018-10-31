// Room storage
export const BEGIN_STORE_ROOMS = 'BEGIN_STORE_ROOMS';
export const SUCCESS_STORE_ROOMS = 'SUCCESS_STORE_ROOMS';
export const FAIL_STORE_ROOMS = 'FAIL_STORE_ROOMS';

// Room storage
export const storeRooms = rooms => ({ type: BEGIN_STORE_ROOMS, payload: rooms });

export const successfullyStoredRooms = rooms =>
  ({ type: SUCCESS_STORE_ROOMS, payload: rooms });

export const failedStoringRooms = (error, rooms) =>
  ({ type: FAIL_STORE_ROOMS, payload: { error, rooms } });