import uuid from 'uuid/v4';

export const MESSAGE_SENT = 'MESSAGE_SENT';

export const RECEIPT_SENT = 'RECEIPT_SENT';
export const SUCCESS_SEND_MESSAGE = 'SUCCESS_SEND_MESSAGE';

export const NEW_MESSAGE = 'NEW_MESSAGE';

export const BEGIN_SEND_MESSAGE = 'BEGIN_SEND_MESSAGE';
export const SENDING_MESSAGE = 'SENDING_MESSAGE';

export const NEW_CONVERSATION = 'NEW_CONVERSATION';
export const CREATE_PRIVATE_CONVERSATION = 'CREATE_PRIVATE_CONVERSATION';
export const CREATE_GROUP_CONVERSATION = 'CREATE_GROUP_CONVERSATION';
export const REMOVE_CONVERSATION = 'REMOVE_CONVERSATION';

export const SHOW_CONVERSATION_NOTIFICATION = 'SHOW_CONVERSATION_NOTIFICATION';
export const SHOW_CONVERSATION_NOTIFICATION_FAIL = 'SHOW_CONVERSATION_NOTIFICATION_FAIL';

export const MEMBERS_CHANGE = 'MEMBERS_CHANGE';

export const membersChange = payload => ({
  type: MEMBERS_CHANGE,
  payload: payload
});

export const messageSent = message => ({
  type: MESSAGE_SENT,
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

export const beginSendingMessage = (conversation, body, messageId = '', isUploading = false, updating = false) => {
  return {
    type: BEGIN_SEND_MESSAGE,
    payload: {
      conversation,
      body,
      id: messageId || uuid(),
      isUploading: isUploading,
      updating
    }
  };
};

export const sendingMessage = message => {
  return ({
    type: SENDING_MESSAGE,
    payload: message
  });
}

export const showConversationNotification = (conversationJid, title, body) => ({
  type: SHOW_CONVERSATION_NOTIFICATION,
  payload: { conversationJid, title, body },
});

export const showConversationNotificationFail = (error) => ({
  type: SHOW_CONVERSATION_NOTIFICATION_FAIL,
  payload: { error },
});
