import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import {
  groupMessages,
  groupMessagesByTime,
  addMessagesSenderNickname,
} from '../../utils/message';
import { copyRxdbMessage } from '../../utils/db-utils';
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

const SEPARATOR = '$';

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
        let localFile = body.localFile;
        body = JSON.parse(msg.body);
        if (localFile && msg.status === 'MESSAGE_STATUS_RECEIVED') {
          body.localFile = localFile;
        }
        body = JSON.stringify(body);
        let msg2 = copyRxdbMessage(msg);
        msg2.body = body;
        msg2.sentTime = msg1.sentTime;
        if (msg1.updateTime && msg.status === 'MESSAGE_STATUS_RECEIVED') {
          msg2.updateTime = msg1.updateTime;
        }
        // update message id: uuid + conversationJid
        msg2.id = msg2.id.split(SEPARATOR)[0] + SEPARATOR + msg.conversationJid;
        return db.messages.upsert(msg2);
      } else {
        // update message id: uuid + conversationJid
        if (msg.id.indexOf(SEPARATOR) === -1) {
          msg.id += SEPARATOR + msg.conversationJid;
        }
        return db.messages.upsert(msg);
      }
    }).catch((err) => {
      return db.messages.upsert(msg);
    })

  }));
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
      delete newMessage.ts;
      delete newMessage.curJid;
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
            .map(messages => {
              return messages
                .filter(msg => msg.body.indexOf('"deleted":true') === -1)
                .sort((a, b) => a.sentTime - b.sentTime);
            })
            .mergeMap(messages => {
              addMessagesSenderNickname(messages);
              return groupMessagesByTime(messages, 'sentTime', 'day');
            })
            .map(groupedMessages => {
              return updateSelectedConversationMessages(groupedMessages)
            })
        )
        .catch(error =>
          Observable.of(failedRetrievingSelectedConversationMessages(error, jid))
        )
    );
