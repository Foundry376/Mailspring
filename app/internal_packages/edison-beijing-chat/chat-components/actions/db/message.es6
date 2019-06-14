export const BEGIN_STORE_MESSAGE = 'BEGIN_STORE_MESSAGE';
export const RETRY_STORE_MESSAGE = 'RETRY_STORE_MESSAGE';
export const SUCCESS_STORE_MESSAGE = 'SUCCESS_STORE_MESSAGE';
export const FAIL_STORE_MESSAGE = 'FAIL_STORE_MESSAGE';

export const beginStoringMessage = message => ({
  type: BEGIN_STORE_MESSAGE,
  payload: message
});

export const successfullyStoredMessage = message => {
  return {
    type: SUCCESS_STORE_MESSAGE,
    payload: message
  };
}

export const failedStoringMessage = (error, message) => ({
  type: FAIL_STORE_MESSAGE,
  payload: { error, message }
});

export const retryStoringPrivateMessage = message => ({
  type: RETRY_STORE_MESSAGE,
  payload: message
});

