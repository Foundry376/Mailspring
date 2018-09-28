export const BEGIN_STORE_CONVERSATIONS = 'BEGIN_STORE_CONVERSATIONS';
export const SUCCESS_STORE_CONVERSATIONS = 'SUCCESS_STORE_CONVERSATIONS';
export const FAIL_STORE_CONVERSATIONS = 'FAIL_STORE_CONVERSATIONS';
export const RETRY_STORE_CONVERSATIONS = 'RETRY_STORE_CONVERSATIONS';
export const FAIL_RETRY_STORE_CONVERSATIONS = 'FAIL_RETRY_STORE_CONVERSATIONS';

export const RETRIEVE_ALL_CONVERSATIONS = 'RETRIEVE_ALL_CONVERSATIONS';
export const UPDATE_CONVERSATIONS = 'UPDATE_CONVERSATIONS';
export const FAIL_RETRIEVE_ALL_CONVERSATIONS = 'FAIL_RETRIEVE_ALL_CONVERSATIONS';

export const UPDATE_SELECTED_CONVERSATION = 'UPDATE_SELECTED_CONVERSATION';
export const FAIL_SELECT_CONVERSATION = 'FAIL_SELECT_CONVERSATION';

export const beginStoringConversations = conversations => ({
  type: BEGIN_STORE_CONVERSATIONS,
  payload: conversations
});

export const successfullyStoredConversations = conversations => ({
  type: SUCCESS_STORE_CONVERSATIONS,
  payload: conversations
});

export const failedStoringConversations = (err, conversations) => ({
  type: FAIL_STORE_CONVERSATIONS,
  payload: Object.assign({}, err, { conversations })
});

export const retryStoringConversations = conversations => ({
  type: RETRY_STORE_CONVERSATIONS,
  payload: conversations
});

export const failedRetryStoringConversations = (err, conversations) => ({
  type: FAIL_RETRY_STORE_CONVERSATIONS,
  payload: Object.assign({}, err, { conversations })
});

export const retrieveAllConversations = () => ({
  type: RETRIEVE_ALL_CONVERSATIONS
});

export const updateConversations = conversations => ({
  type: UPDATE_CONVERSATIONS,
  payload: conversations
});

export const failRetrievingConversations = err => ({
  type: FAIL_RETRIEVE_ALL_CONVERSATIONS,
  payload: err
});

export const updateSelectedConversation = conversation => ({
  type: UPDATE_SELECTED_CONVERSATION,
  payload: conversation
});

export const failedSelectingConversation = err => ({
  type: FAIL_SELECT_CONVERSATION,
  payload: err
});
