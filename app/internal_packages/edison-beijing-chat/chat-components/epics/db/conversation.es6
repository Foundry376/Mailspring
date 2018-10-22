import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import {
  SELECT_CONVERSATION,
  CREATE_PRIVATE_CONVERSATION,
  CREATE_GROUP_CONVERSATION,
  selectConversation,
} from '../../actions/chat';
// import { beginJoiningRooms } from '../../actions/auth';
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
  beginStoringConversations
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
            email: contact.email,
            avatar: contact.avatar,
            isGroup: false,
            unreadMessages: 0,
            occupants: [
              currentUser.bare,
              contact.jid,
            ],
          });
        })
    );

// TODO quanzs did not complete, jid is temp
export const groupConversationCreatedEpic = (action$, { getState }) =>
  action$.ofType(CREATE_GROUP_CONVERSATION)
    .mergeMap(({ payload: contacts }) => {
      const jidArr = contacts.map(contact => contact.jid).sort();
      const jids = jidArr.join('|');
      const names = contacts.map(contact => contact.name).sort().join(',');
      const emails = contacts.map(contact => contact.email).sort().join(',');
      const contact = contacts[0];
      return Observable.fromPromise(retriveConversation(jids))
        .map(conv => {
          if (conv) {
            return selectConversation(conv.jid);
          }
          const { auth: { currentUser } } = getState();
          console.log('*******currentUser', [
            currentUser.bare,
            ...(contacts.map(contact => contact.jid).sort())
          ]);
          return updateSelectedConversation({
            jid: jids,
            name: names,
            email: emails,
            avatar: contact.avatar,
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
    .map(({ payload: contacts }) => {
      const jidArr = contacts.map(contact => contact.jid).sort();
      const jids = jidArr.join('|');
      const names = contacts.map(contact => contact.name).sort().join(',');
      const content = 'no message';
      const timeSend = new Date().getTime();
      const { auth: { currentUser } } = getState();
      const conversation = {
        jid: jids,
        name: names,
        isGroup: true,
        unreadMessages: 0,
        occupants: [
          currentUser.bare,
          ...jidArr,
          'testmail' + new Date().getTime() + '@testmail.com'
        ],
        lastMessageTime: (new Date(timeSend)).getTime(),
        lastMessageText: content,
        lastMessageSender: currentUser.bare
      };
      return conversation;
    })
    .map(conversation => beginStoringConversations([conversation]));

// TODO quanzs joinRoom
// export const joinRoomEpic = (action$, { getState }) =>
//   action$.ofType(CREATE_GROUP_CONVERSATION)
//     .map(({ payload: roomId }) => {
//       return beginJoiningRooms([roomId])
//     });
