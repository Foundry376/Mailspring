import uuid from 'uuid/v4';

export const RECEIVE_CHAT = 'RECEIVE_CHAT';
export const RECEIVE_GROUPCHAT = 'RECEIVE_GROUPCHAT';
export const MESSAGE_SENT = 'MESSAGE_SENT';

export const RECEIVE_PRIVATE_MESSAGE = 'RECEIVE_PRIVATE_MESSAGE';
export const RECEIVE_GROUP_MESSAGE = 'RECEIVE_GROUP_MESSAGE';
export const RECEIPT_SENT = 'RECEIPT_SENT';
export const SUCCESS_SEND_MESSAGE = 'SUCCESS_SEND_MESSAGE';

export const NEW_MESSAGE = 'NEW_MESSAGE';

export const BEGIN_SEND_MESSAGE = 'BEGIN_SEND_MESSAGE';
export const SENDING_MESSAGE = 'SENDING_MESSAGE';

export const SELECT_CONVERSATION = 'SELECT_CONVERSATION';
export const DESELECT_CONVERSATION = 'DESELECT_CONVERSATION';

export const CREATE_PRIVATE_CONVERSATION = 'CREATE_PRIVATE_CONVERSATION';
export const CREATE_GROUP_CONVERSATION = 'CREATE_GROUP_CONVERSATION';

export const SHOW_CONVERSATION_NOTIFICATION = 'SHOW_CONVERSATION_NOTIFICATION';

// Mousetrap shortcut actions
export const GO_PREV_CONVERSATION = 'GO_PREV_CONVERSATION';
export const GO_NEXT_CONVERSATION = 'GO_NEXT_CONVERSATION';

export const receiveChat = message => ({
  type: RECEIVE_CHAT,
  payload: message
});

export const receiveGroupchat = message => ({
  type: RECEIVE_GROUPCHAT,
  payload: message
});

export const messageSent = message => ({
  type: MESSAGE_SENT,
  payload: message
});

export const receiveGroupMessage = message => ({
  type: RECEIVE_GROUP_MESSAGE,
  payload: message
});

export const receivePrivateMessage = message => ({
  type: RECEIVE_PRIVATE_MESSAGE,
  payload: message
});

export const receiptSent = messageId => ({
  type: RECEIPT_SENT,
  payload: messageId
});

export const successfullySentMessage = message => ({
  type: SUCCESS_SEND_MESSAGE,
  payload: message
});

export const newMessage = formattedMessage => ({
  type: NEW_MESSAGE,
  payload: formattedMessage
});

export const beginSendingMessage = (conversation, body, messageId = '') => {
  return {
    type: BEGIN_SEND_MESSAGE,
    payload: {
      conversation,
      body,
      id: messageId || uuid(),
    }
  };
};

export const sendingMessage = message => {
  return ({
    type: SENDING_MESSAGE,
    payload: message
  });
}

export const selectConversation = jid => ({
  type: SELECT_CONVERSATION,
  payload: jid
});

export const deselectConversation = () => ({ type: DESELECT_CONVERSATION });

export const failedSelectingConversation = (error, jid) => ({
  type: SELECT_CONVERSATION,
  payload: { error, jid }
});

export const createPrivateConversation = contact => ({
  type: CREATE_PRIVATE_CONVERSATION,
  payload: contact,
});

export const createGroupConversation = contacts => ({
  type: CREATE_GROUP_CONVERSATION,
  payload: contacts,
});

export const showConversationNotification = (conversationJid, title, body) => ({
  type: SHOW_CONVERSATION_NOTIFICATION,
  payload: { conversationJid, title, body },
});

// Mousetrap action creators

export const goToPreviousConversation = () => ({ type: GO_PREV_CONVERSATION });

export const goToNextConversation = () => ({ type: GO_NEXT_CONVERSATION });
