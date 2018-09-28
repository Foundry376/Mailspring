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

const saveMessages = async messages => {
  const db = await getDb();
  return Promise.all(messages.map(msg => db.messages.upsert(msg)));
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
    .filter(({ dbMessage, newMessage }) =>
      !dbMessage || getStatusWeight(newMessage.status) > getStatusWeight(dbMessage.status)
    )
    .map(({ newMessage }) => beginStoringMessage(newMessage));

export const beginStoreMessageEpic = action$ =>
  action$.ofType(BEGIN_STORE_MESSAGE)
    .mergeMap(({ payload: message }) =>
      Observable.fromPromise(saveMessages([message]))
        .map(result => successfullyStoredMessage(result))
        .catch(err => Observable.of(failedStoringMessage(err, message)))
    );

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
            .map(groupedMessages => updateSelectedConversationMessages(groupedMessages))
        )
        .catch(error =>
          Observable.of(failedRetrievingSelectedConversationMessages(error, jid))
        )
    );
