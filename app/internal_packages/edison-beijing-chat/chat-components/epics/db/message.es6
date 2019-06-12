import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import {
  BEGIN_STORE_MESSAGE,
  beginStoringMessage,
  successfullyStoredMessage,
  failedStoringMessage,
} from '../../actions/db/message';
import {
  NEW_MESSAGE
} from '../../actions/chat';
import { MessageStore } from 'chat-exports';

const SEPARATOR = '$';

const saveMessages = async messages => {
  return await MessageStore.saveMessagesAndRefresh(messages);;
};

export const triggerStoreMessageEpic = action$ =>
  action$.ofType(NEW_MESSAGE)
    // .mergeMap(({ payload: newMessage }) => {
    //   const db = getDb();
    //   return Observable.fromPromise(db.messages.findOne({ where: { id: newMessage.id } }))
    //     .map(dbMessage => ({ dbMessage, newMessage }))
    // })
    // .filter(({ dbMessage, newMessage }) => {
    //   // !dbMessage || newMessage.status === 'MESSAGE_STATUS_RECEIVED' || getStatusWeight(newMessage.status) > getStatusWeight(dbMessage.status)
    //   return true;
    // })
    .map(({ payload: newMessage }) => {
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
