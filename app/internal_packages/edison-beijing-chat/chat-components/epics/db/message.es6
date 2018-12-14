import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import { getStatusWeight } from '../../db/schemas/message';
import {
  BEGIN_STORE_MESSAGE,
  RETRIEVE_SELECTED_CONVERSATION_MESSAGES,
  beginStoringMessage,
  successfullyStoredMessage,
  failedStoringMessage,
  updateSelectedConversationMessages,
  failedRetrievingSelectedConversationMessages,
} from '../../actions/db/message';
import {
  NEW_MESSAGE,
  SELECT_CONVERSATION,
  DESELECT_CONVERSATION,
} from '../../actions/chat';

import { copyRxdbMessage } from '../../utils/db-utils';

const saveMessages = async messages => {
  const db = await getDb();
  return Promise.all(messages.map(msg => {
    db.messages.findOne(msg.id).exec().then((msg1) => {
      if (msg1) {
        // because sending message in group chat will be overrided by the same RECEIVE_GROUPCHAT message overrided
        // so do below to restore  localFile field
        // and for RXDocouments Object.assign will not copy all fields
        // it is necessary to rebuild the message one field by one field.

        let body = JSON.parse(msg1.body);
        let localFile =  body.localFile;
        body = JSON.parse(msg.body);
        if (localFile && msg.status === 'MESSAGE_STATUS_RECEIVED') {
          body.localFile = localFile;
        }
        body = JSON.stringify(body);
        let msg2 = copyRxdbMessage(msg);
        msg2.body  = body;
        msg2.sentTime  = msg1.sentTime;
        if (msg1.updateTime && msg.status === 'MESSAGE_STATUS_RECEIVED') {
          msg2.updateTime  = msg1.updateTime;
        }
        return db.messages.upsert(msg2);
      } else {
        return db.messages.upsert(msg);
      }
    }).catch((err) => {
      return db.messages.upsert(msg);
    })

  }));
};

const groupMessages = async messages => {
  const groupedMessages = [];
  const createGroup = message => ({
    sender: message.sender,
    messages: [message]
  });
  messages.forEach((message, index) => {
    const lastIndex = groupedMessages.length - 1;
    if (index === 0 || groupedMessages[lastIndex].sender !== message.sender) {
      groupedMessages.push(createGroup(message));
    } else {
      groupedMessages[lastIndex].messages.push(message);
    }
  });

  return groupedMessages;
};

export const triggerStoreMessageEpic = action$ =>
  action$.ofType(NEW_MESSAGE)
    .mergeMap(({ payload: newMessage }) =>
      Observable.fromPromise(getDb())
        .mergeMap(db => db.messages.findOne(newMessage.id).exec())
        .map(dbMessage => ({ dbMessage, newMessage }))
    )
    .filter(({ dbMessage, newMessage }) => {
      // !dbMessage || newMessage.status === 'MESSAGE_STATUS_RECEIVED' || getStatusWeight(newMessage.status) > getStatusWeight(dbMessage.status)
      return true;
    })
    .map(({ newMessage }) => {
      return beginStoringMessage(newMessage);
    });

export const beginStoreMessageEpic = action$ =>
  action$.ofType(BEGIN_STORE_MESSAGE)
    .mergeMap(({ payload: message }) => {
      return Observable.fromPromise(saveMessages([message]))
        .map(result => successfullyStoredMessage(result))
        .catch(err => Observable.of(failedStoringMessage(err, message)))
    });

export const retrieveSelectedConversationMessagesEpic = action$ =>
  action$.ofType(RETRIEVE_SELECTED_CONVERSATION_MESSAGES)
    .mergeMap(({ payload: jid }) =>
      Observable.fromPromise(getDb())
        .mergeMap(db =>
          db.messages
            .find()
            .where('conversationJid')
            .eq(jid)
            .$
            .takeUntil(action$.ofType(SELECT_CONVERSATION, DESELECT_CONVERSATION))
            .map(messages => messages.sort((a, b) => a.sentTime - b.sentTime))
            .mergeMap(messages => groupMessages(messages))
            .map(groupedMessages => {
              return updateSelectedConversationMessages(groupedMessages)
            })
        )
        .catch(error =>
          Observable.of(failedRetrievingSelectedConversationMessages(error, jid))
        )
    );
