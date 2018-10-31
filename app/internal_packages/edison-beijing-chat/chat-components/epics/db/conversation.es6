import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import {
  SELECT_CONVERSATION,
  CREATE_PRIVATE_CONVERSATION,
  CREATE_GROUP_CONVERSATION,
  REMOVE_CONVERSATION,
  selectConversation,
} from '../../actions/chat';
// import { beginJoiningRooms } from '../../actions/auth';
import {
  BEGIN_STORE_CONVERSATIONS,
  FAIL_STORE_CONVERSATIONS,
  RETRY_STORE_CONVERSATIONS,
  RETRIEVE_ALL_CONVERSATIONS,
  REMOVING_CONVERSATION,
  successfullyStoredConversations,
  failedStoringConversations,
  retryStoringConversations,
  failedRetryStoringConversations,
  updateConversations,
  failRetrievingConversations,
  updateSelectedConversation,
  failedSelectingConversation,
  beginStoringConversations
} from '../../actions/db/conversation';
import xmpp from '../../xmpp/index.es6';

const saveConversations = async conversations => {
  const db = await getDb();
  return Promise.all(conversations.map(async conv => {
    if (conv.unreadMessages === 1) {
      const convInDB = await db.conversations.findOne(conv.jid).exec();
      if (convInDB) {
        conv.unreadMessages = convInDB.unreadMessages + 1;
      }
    }
    return db.conversations.upsert(conv)
  }));
};

const retriveConversation = async jid => {
  const db = await getDb();
  return db.conversations.findOne(jid).exec();
};

const removeConversation = async jid => {
  const db = await getDb();
  return (db.conversations.findOne(jid).exec()).then((conv) => {
    conv.remove();

  });
};

const clearConversationUnreadMessages = async jid => {
  const db = await getDb();
  return db.conversations.findOne(jid).update({
    $set: {
      unreadMessages: 0
    }
  });
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
    .mergeMap(({ payload: jid }) => {
      clearConversationUnreadMessages(jid);
      return Observable.fromPromise(retriveConversation(jid))
        .map(conversation => updateSelectedConversation(conversation))
        .catch(error => failedSelectingConversation(error, jid))
    });

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
            email: contact.email,
            avatar: contact.avatar,
            isGroup: false,
            unreadMessages: 0,
            occupants: [
              currentUser.bare,
              contact.jid,
            ]
          });
        })
    );

export const crateIntiatedPrivateConversationEpic = (action$, { getState }) =>
  action$.ofType(CREATE_PRIVATE_CONVERSATION)
    .mergeMap(({ payload: contact }) =>
      Observable.fromPromise(retriveConversation(contact.jid))
        .map(conv => {
          if (conv || !contact.name) {
            return selectConversation(conv.jid);
          } else {
            const { auth: { currentUser } } = getState();
            conv = {
              jid: contact.jid,
              name: contact.name,
              occupants: [currentUser],
              isGroup: false,
              // below is some filling to show the conversation
              unreadMessages: 0,
              lastMessageSender: contact.jid,
              lastMessageText: ' ',
              lastMessageTime: (new Date()).getTime()
            }
            return conv
          }
        })
        .map(conversation => beginStoringConversations([conversation])))

// TODO quanzs did not complete, name, subject and description is temp
export const groupConversationCreatedEpic = (action$, { getState }) =>
  action$.ofType(CREATE_GROUP_CONVERSATION)
    .mergeMap(({ payload: { contacts, roomId, name } }) => {
      const jidArr = contacts.map(contact => contact.jid).sort();
      const opt = {
        type: 'create',
        name: name,
        subject: 'test subject',
        description: 'teset description',
        members: {
          jid: jidArr
        }
      }
      return Observable.fromPromise(xmpp.createRoom(roomId, opt))
        .map(() => {
          return { payload: { contacts, roomId, name } }
        });
    })
    .mergeMap(({ payload: { contacts, roomId, name } }) => {
      const jidArr = contacts.map(contact => contact.jid).sort();
      const emails = contacts.map(contact => contact.email).sort().join(',');
      return Observable.fromPromise(retriveConversation(roomId))
        .map(conv => {
          if (conv) {
            return selectConversation(conv.jid);
          }
          const { auth: { currentUser } } = getState();
          return updateSelectedConversation({
            jid: roomId,
            name: name,
            email: emails,
            avatar: 'GP', // this is temp
            isGroup: true,
            unreadMessages: 0,
            occupants: [
              currentUser.bare,
              ...jidArr
            ],
          });
        })
    });

// TODO quanzs save group coversation, the jids is temp
export const updateGroupMessageConversationEpic = (action$, { getState }) =>
  action$.ofType(CREATE_GROUP_CONVERSATION)
    .map(({ payload: { contacts, roomId, name } }) => {
      const jidArr = contacts.map(contact => contact.jid).sort();
      const content = 'no message';
      const timeSend = new Date().getTime();
      const { auth: { currentUser } } = getState();
      const conversation = {
        jid: roomId,
        name: name,
        isGroup: true,
        unreadMessages: 0,
        occupants: [
          currentUser.bare,
          ...jidArr
        ],
        lastMessageTime: (new Date(timeSend)).getTime(),
        lastMessageText: content,
        lastMessageSender: currentUser.bare
      };
      return conversation;
    })
    .map(conversation => beginStoringConversations([conversation]));

export const removeConversationEpic = (action$, { getState }) =>
  action$.ofType(REMOVE_CONVERSATION)
    .map(({ payload: jid }) => {
      removeConversation(jid);
      return jid;
    }).map(jid => {
      return { type: REMOVING_CONVERSATION, payload: jid }
    });

