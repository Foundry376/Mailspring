export const BEGIN_STORE_MESSAGE = 'BEGIN_STORE_MESSAGE';
export const RETRY_STORE_MESSAGE = 'RETRY_STORE_MESSAGE';
export const SUCCESS_STORE_MESSAGE = 'SUCCESS_STORE_MESSAGE';
export const FAIL_STORE_MESSAGE = 'FAIL_STORE_MESSAGE';

export const RETRIEVE_SELECTED_CONVERSATION_MESSAGES = 'RETRIEVE_SELECTED_CONVERSATION_MESSAGES';
export const FAIL_RETRIEVE_SELECTED_CONVERSATION_MESSAGES =
  'FAIL_RETRIEVE_SELECTED_CONVERSATION_MESSAGES';
export const UPDATE_SELECTED_CONVERSATION_MESSAGES = 'UPDATE_SELECTED_CONVERSATION_MESSAGES';

export const beginStoringMessage = message => ({
  type: BEGIN_STORE_MESSAGE,
  payload: message
});

export const successfullyStoredMessage = message => ({
  type: SUCCESS_STORE_MESSAGE,
  payload: message
});

export const failedStoringMessage = (error, message) => ({
  type: FAIL_STORE_MESSAGE,
  payload: { error, message }
});

export const retryStoringPrivateMessage = message => ({
  type: RETRY_STORE_MESSAGE,
  payload: message
});

export const retrieveSelectedConversationMessages = jid => ({
  type: RETRIEVE_SELECTED_CONVERSATION_MESSAGES,
  payload: jid
});

export const failedRetrievingSelectedConversationMessages = (error, jid) => ({
  type: FAIL_RETRIEVE_SELECTED_CONVERSATION_MESSAGES,
  payload: { error, jid }
});

export const updateSelectedConversationMessages = messages => ({
  type: UPDATE_SELECTED_CONVERSATION_MESSAGES,
  payload: messages
});
