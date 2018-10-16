import { Observable } from 'rxjs/Observable';
import { replace } from 'react-router-redux';
import xmpp from '../xmpp';
import getDb from '../db';
import {
  MESSAGE_STATUS_SENDING,
  MESSAGE_STATUS_DELIVERED,
  MESSAGE_STATUS_RECEIVED,
} from '../db/schemas/message';
import { postNotification } from '../utils/electron';
import {
  BEGIN_SEND_MESSAGE,
  RECEIVE_CHAT,
  RECEIVE_GROUPCHAT,
  MESSAGE_SENT,
  RECEIVE_PRIVATE_MESSAGE,
  SENDING_MESSAGE,
  SUCCESS_SEND_MESSAGE,
  CREATE_PRIVATE_CONVERSATION,
  CREATE_GROUP_CONVERSATION,
  SHOW_CONVERSATION_NOTIFICATION,
  GO_PREV_CONVERSATION,
  GO_NEXT_CONVERSATION,
  receivePrivateMessage,
  receiveGroupMessage,
  receiptSent,
  successfullySentMessage,
  newMessage,
  sendingMessage,
  selectConversation,
  showConversationNotification
} from '../actions/chat';
import {
  UPDATE_SELECTED_CONVERSATION,
  beginStoringConversations,
} from '../actions/db/conversation';
import {
  retrieveSelectedConversationMessages,
} from '../actions/db/message';

export const receiptSentEpic = action$ =>
  action$.ofType(MESSAGE_SENT)
    .filter(({ payload }) => payload.receipt && !payload.body)
    .map(({ payload }) => receiptSent(payload.id));

export const successSendMessageEpic = action$ =>
  action$.ofType(MESSAGE_SENT)
    .filter(({ payload }) => !payload.receipt && payload.body)
    .map(({ payload }) => successfullySentMessage(payload));

export const sendMessageEpic = action$ =>
  action$.ofType(BEGIN_SEND_MESSAGE)
    .map(({ payload: { conversation, body, id } }) => ({
      id,
      body,
      to: conversation.jid,
      type: conversation.isGroup ? 'groupchat' : 'chat'
    }))
    .map(message => sendingMessage(message))
    .do(({ payload }) => xmpp.sendMessage(payload));

export const newTempMessageEpic = (action$, { getState }) =>
  action$.ofType(SENDING_MESSAGE)
    .map(({ payload }) => {
      const { auth: { currentUser: { bare: currentUser } } } = getState();
      return {
        id: payload.id,
        conversationJid: payload.to,
        sender: currentUser,
        body: payload.body,
        sentTime: (new Date()).getTime(),
        status: MESSAGE_STATUS_SENDING,
      };
    })
    .map(newPayload => newMessage(newPayload));

export const convertSentMessageEpic = action$ =>
  action$.ofType(SUCCESS_SEND_MESSAGE)
    .map(({ payload }) => ({
      id: payload.id,
      conversationJid: payload.to.bare,
      sender: payload.from.bare,
      body: payload.body,
      sentTime: (new Date()).getTime(),
      status: MESSAGE_STATUS_DELIVERED,
    }))
    .delay(500) // need this delay to combat super fast network
    .map(newPayload => newMessage(newPayload));

export const updateSentMessageConversationEpic = (action$, { getState }) =>
  action$.ofType(SUCCESS_SEND_MESSAGE)
    .mergeMap(({ payload: message }) =>
      Observable.fromPromise(getDb())
        .map(db => ({ db, message }))
    )
    .mergeMap(({ db, message }) =>
      Observable.fromPromise(db.conversations.findOne(message.to.bare).exec())
        .map(conversation => {
          let conv = conversation;
          if (!conversation) {
            const { chat: { selectedConversation } } = getState();
            conv = selectedConversation;
          }
          return Object.assign({}, JSON.parse(JSON.stringify(conv)), {
            lastMessageTime: (new Date()).getTime(),
            lastMessageText: message.body,
            lastMessageSender: message.from.bare,
            _rev: undefined
          });
        })
    )
    .map(conversation => beginStoringConversations([conversation]));

export const receivePrivateMessageEpic = action$ =>
  action$.ofType(RECEIVE_CHAT)
    .filter(({ payload }) => {
      return payload.body
    })
    .map(({ payload }) => receivePrivateMessage(payload));

export const receiveGroupMessageEpic = action$ =>
  action$.ofType(RECEIVE_GROUPCHAT)
    .filter(({ payload }) => payload.body)
    .map(({ payload }) => receiveGroupMessage(payload));

export const convertReceivedPrivateMessageEpic = action$ =>
  action$.ofType(RECEIVE_PRIVATE_MESSAGE)
    .map(({ payload }) => {
      const { content, timeSend } = JSON.parse(payload.body);
      return {
        id: payload.id,
        conversationJid: payload.from.bare,
        sender: payload.from.bare,
        body: content,
        sentTime: (new Date(timeSend)).getTime(),
        status: MESSAGE_STATUS_RECEIVED,
      };
    })
    .map(newPayload => newMessage(newPayload));

export const updatePrivateMessageConversationEpic = action$ =>
  action$.ofType(RECEIVE_PRIVATE_MESSAGE)
    .map(({ payload }) => {
      const { content, timeSend } = JSON.parse(payload.body);
      return {
        jid: payload.from.bare,
        name: payload.from.local,
        isGroup: false,
        unreadMessages: 0,
        occupants: [
          payload.from.bare,
          payload.to.bare
        ],
        lastMessageTime: (new Date(timeSend)).getTime(),
        lastMessageText: content,
        lastMessageSender: payload.from.bare
      };
    })
    .map(conversation => beginStoringConversations([conversation]));

export const beginRetrievingMessagesEpic = action$ =>
  action$.ofType(UPDATE_SELECTED_CONVERSATION)
    .map(({ payload: { jid } }) => retrieveSelectedConversationMessages(jid));

export const conversationCreatedEpic = action$ =>
  action$.ofType(CREATE_PRIVATE_CONVERSATION, CREATE_GROUP_CONVERSATION)
    .map(() => replace('/chat'));

// TODO: Handle group conversations
export const triggerPrivateNotificationEpic = action$ =>
  action$.ofType(RECEIVE_PRIVATE_MESSAGE)
    .map(({ payload: { from: { bare: conversationJid, local: title }, body } }) => {
      const { content } = JSON.parse(body);
      return showConversationNotification(conversationJid, title, content);
    });

export const showConversationNotificationEpic = (action$, { getState }) =>
  action$.ofType(SHOW_CONVERSATION_NOTIFICATION)
    .map(({ payload: { conversationJid, title, body } }) => ({
      jid: conversationJid,
      notification: postNotification(title, body),
    }))
    .filter(({ notification }) => notification !== null)
    .mergeMap(({ jid, notification }) =>
      Observable.fromEvent(notification, 'click')
        .take(1)
        .filter(() => {
          const { chat: { selectedConversation } } = getState();
          return !selectedConversation || selectedConversation.jid !== jid;
        })
        .map(() => selectConversation(jid))
    );

export const goPrevConversationEpic = (action$, { getState }) =>
  action$.ofType(GO_PREV_CONVERSATION)
    .filter(() => !!getState().auth.currentUser)
    .map(() => {
      const { chat: { selectedConversation, conversations } } = getState();
      const jid = selectedConversation ? selectedConversation.jid : null;
      const jids = conversations.map(conv => conv.jid);
      const selectedIndex = jids.indexOf(jid);
      return { jids, selectedIndex };
    })
    .filter(({ jids, selectedIndex }) => jids.length > 1 && selectedIndex > 0)
    .map(({ jids, selectedIndex }) => selectConversation(jids[selectedIndex - 1]));

export const goNextConversationEpic = (action$, { getState }) =>
  action$.ofType(GO_NEXT_CONVERSATION)
    .filter(() => !!getState().auth.currentUser)
    .map(() => {
      const { chat: { selectedConversation, conversations } } = getState();
      const jid = selectedConversation ? selectedConversation.jid : null;
      const jids = conversations.map(conv => conv.jid);
      const selectedIndex = jids.indexOf(jid);
      return { jids, selectedIndex };
    })
    .filter(({ jids }) => jids.length > 0)
    .filter(({ jids, selectedIndex }) => selectedIndex === -1 || selectedIndex < jids.length - 1)
    .map(({ jids, selectedIndex }) => selectConversation(jids[selectedIndex + 1]));
