export const SUBMIT_AUTH = 'SUBMIT_AUTH';
export const SUCCESS_AUTH = 'SUCCESS_AUTH';
export const FAIL_AUTH = 'FAIL_AUTH';

// XMPP specific action types
export const BEGIN_CONNECTION_AUTH = 'BEGIN_CONNECTION_AUTH';
export const SUCCESS_CONNECTION_AUTH = 'SUCCESS_CONNECTION_AUTH';
export const FAIL_CONNECTION_AUTH = 'FAIL_CONNECTION_AUTH';
export const CONNECTION_ESTABLISHED = 'CONNECTION_ESTABLISHED';
export const CONNECTION_BROKEN = 'CONNECTION_BROKEN';

export const BEGIN_ENABLE_CARBONS = 'BEGIN_ENABLE_CARBONS';
export const SUCCESS_ENABLE_CARBONS = 'SUCCESS_ENABLE_CARBONS';
export const FAIL_ENABLE_CARBONS = 'FAIL_ENABLE_CARBONS';

export const BEGIN_JOIN_ROOMS = 'BEGIN_JOIN_ROOMS';
export const SUCCESS_JOIN_ROOMS = 'SUCCESS_JOIN_ROOMS';
export const FAIL_JOIN_ROOMS = 'FAIL_JOIN_ROOMS';

export const submitAuth = (jid, password, email) => ({
  type: SUBMIT_AUTH,
  payload: { jid, password, email }
});

export const successAuth = jid => ({
  type: SUCCESS_AUTH,
  payload: jid
});

export const failAuth = error => ({ type: FAIL_AUTH, payload: error });

// XMPP specific action creators
export const beginConnectionAuth = (jid, password) => ({
  type: BEGIN_CONNECTION_AUTH,
  payload: { jid, password }
});

export const successfulConnectionAuth = jid => {
  return { type: SUCCESS_CONNECTION_AUTH, jid}
};

export const failConnectionAuth = err => ({
  type: FAIL_CONNECTION_AUTH,
  payload: err || 'Failed connecting to XMPP service'
});

export const connectionEstablished = data => ({
  type: CONNECTION_ESTABLISHED,
  payload: data
});

export const connectionBroken = () => ({ type: CONNECTION_BROKEN });

export const beginEnablingCarbons = () => ({ type: BEGIN_ENABLE_CARBONS });

export const successfullyEnabledCarbons = payload => ({ type: SUCCESS_ENABLE_CARBONS, payload });

export const failedEnablingCarbons = payload => ({ type: FAIL_ENABLE_CARBONS, payload });

export const beginJoiningRooms = roomJids => ({
  type: BEGIN_JOIN_ROOMS,
  payload: roomJids
});

export const successfullyJoinedRooms = roomJids => ({
  type: SUCCESS_JOIN_ROOMS,
  payload: roomJids
});

export const failedJoiningRooms = err => ({ type: FAIL_JOIN_ROOMS, payload: err });
