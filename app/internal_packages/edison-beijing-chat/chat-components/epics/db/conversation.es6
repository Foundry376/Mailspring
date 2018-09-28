import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import {
  SELECT_CONVERSATION,
  CREATE_PRIVATE_CONVERSATION,
  selectConversation,
} from '../../actions/chat';
import {
  BEGIN_STORE_CONVERSATIONS,
  FAIL_STORE_CONVERSATIONS,
  RETRY_STORE_CONVERSATIONS,
  RETRIEVE_ALL_CONVERSATIONS,
  successfullyStoredConversations,
  failedStoringConversations,
  retryStoringConversations,
  failedRetryStoringConversations,
  updateConversations,
  failRetrievingConversations,
  updateSelectedConversation,
  failedSelectingConversation,
} from '../../actions/db/conversation';

const saveConversations = async conversations => {
  const db = await getDb();
  return Promise.all(conversations.map(conv => db.conversations.upsert(conv)));
};

const retriveConversation = async jid => {
  const db = await getDb();
  return db.conversations.findOne(jid).exec();
};

export const beginStoreConversationsEpic = action$ =>
  action$.ofType(BEGIN_STORE_CONVERSATIONS)
    .mergeMap(({ payload: conversations }) =>
      Observable.fromPromise(saveConversations(conversations))
        .map(convs => successfullyStoredConversations(convs))
        .catch(err => Observable.of(failedStoringConversations(err, conversations)))
    );

export const retryStoreConversationsEpic = action$ =>
  action$.ofType(FAIL_STORE_CONVERSATIONS)
    .filter(({ payload: { status } }) => status === 409)
    .map(({ payload: { conversations } }) => retryStoringConversations(conversations));

export const handleRetryStoreConversationsEpic = action$ =>
  action$.ofType(RETRY_STORE_CONVERSATIONS)
    .mergeMap(({ payload }) =>
      Observable.fromPromise(saveConversations(payload))
        .map(convs => successfullyStoredConversations(convs))
        .catch(err => Observable.of(failedRetryStoringConversations(err, payload)))
    );


export const retrieveConversationsEpic = action$ =>
  action$.ofType(RETRIEVE_ALL_CONVERSATIONS)
    .mergeMap(() =>
      Observable.fromPromise(getDb())
        .mergeMap(db =>
          db.conversations
            .find()
            .$
            .takeUntil(action$.ofType(RETRIEVE_ALL_CONVERSATIONS))
            .map(conversations =>
              conversations.filter(conversation =>
                  conversation.lastMessageText && conversation.lastMessageSender &&
                    conversation.lastMessageTime
                )
                .sort((a, b) => b.lastMessageTime - a.lastMessageTime)
            )
            .map(conversations => updateConversations(conversations))
        )
        .catch(err => Observable.of(failRetrievingConversations(err)))
    );

export const selectConversationEpic = action$ =>
  action$.ofType(SELECT_CONVERSATION)
    .mergeMap(({ payload: jid }) =>
      Observable.fromPromise(retriveConversation(jid))
        .map(conversation => updateSelectedConversation(conversation))
        .catch(error => failedSelectingConversation(error, jid))
    );

export const privateConversationCreatedEpic = (action$, { getState }) =>
  action$.ofType(CREATE_PRIVATE_CONVERSATION)
    .mergeMap(({ payload: contact }) =>
      Observable.fromPromise(retriveConversation(contact.jid))
        .map(conv => {
          if (conv) {
            return selectConversation(conv.jid);
          }
          const { auth: { currentUser } } = getState();
          return updateSelectedConversation({
            jid: contact.jid,
            name: contact.name,
            isGroup: false,
            unreadMessages: 0,
            occupants: [
              currentUser.bare,
              contact.jid,
            ],
          });
        })
    );
