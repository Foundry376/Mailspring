import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import {
  SELECT_CONVERSATION,
  NEW_CONVERSATION,
  CREATE_PRIVATE_CONVERSATION,
  CREATE_GROUP_CONVERSATION,
  REMOVE_CONVERSATION,
  selectConversation,
} from '../../actions/chat';
// import { beginJoiningRooms } from '../../actions/auth';
import {
  BEGIN_STORE_CONVERSATIONS,
  BEGIN_STORE_OCCUPANTS,
  FAIL_STORE_CONVERSATIONS,
  RETRY_STORE_CONVERSATIONS,
  RETRIEVE_ALL_CONVERSATIONS,
  REMOVING_CONVERSATION,
  STORE_CONVERSATION_NAME,
  successfullyStoredConversations,
  failedStoringConversations,
  retryStoringConversations,
  failedRetryStoringConversations,
  updateConversations,
  failRetrievingConversations,
  updateSelectedConversation,
  failedSelectingConversation,
  beginStoringConversations,
  successfullyStoredOccupants,
  failedStoringOccupants,
  successfullyStoredConversationName
} from '../../actions/db/conversation';
import xmpp from '../../xmpp/index';
import { ipcRenderer } from 'electron';
import chatModel from '../../store/model';
import keyMannager from '../../../../../src/key-manager';
import { queryProfile } from '../../utils/restjs';
import { copyRxdbContact } from '../../utils/db-utils';

const saveOccupants = async payload => {
  if (!payload.mucAdmin) {
    return null;
  }
  const jid = payload.from.bare;
  const occupants = payload.mucAdmin.items.map(item => item.jid.bare);
  const db = await getDb();
  const convInDB = await db.conversations.findOne(jid).exec();
  if (convInDB) {
    convInDB.update({
      $set: {
        occupants
      }
    })
    return occupants;
  }
  return null;
};

const getProfile = async (jid) => {
  const chatAccounts = AppEnv.config.get('chatAccounts') || {};
  if (jid && Object.keys(chatAccounts).length > 0) {
    const accessToken = await keyMannager.getAccessTokenByEmail(Object.keys(chatAccounts)[0]);
    const userId = jid.split('@')[0];
    return await new Promise((resolve, reject) => {
      queryProfile({ accessToken, userId }, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      })
    });
  }
  return null;
}

const saveConversations = async conversations => {
  const db = await getDb();
  return Promise.all(conversations.map(async conv => {
     const convInDB = await db.conversations.findOne(conv.jid).exec();
    if (conv.unreadMessages === 1) {
      if (convInDB) {
        conv.unreadMessages = convInDB.unreadMessages + 1;
      }
    }
    // when private chat, update avatar
    if (!conv.isGroup) {
      const contact = await db.contacts.findOne(conv.jid).exec();
      if (contact && contact.avatar) {
        conv.avatar = contact.avatar;
      }
      if (convInDB) {
        return convInDB.update({
          $set: {
            ...conv
          }
        })
      }
    }
    // when group chat, if exists in db, do not update occupants
    else {
      const profile = await getProfile(conv.lastMessageSender);
      if (profile && profile.resultCode === 1) {
        conv.lastMessageSenderName = profile.data.name;
      }
      if (!conv.avatarMembers){
        conv.avatarMembers = []
        let contact = await db.contacts.findOne().where('jid').eq(conv.lastMessageSender).exec();
        if (contact) {
          contact = copyRxdbContact(contact);
          conv.avatarMembers.push(contact);
        }
      }
      if (conv.avatarMembers.length < 2){
        let contact = await db.contacts.findOne().where('jid').eq(conv.curJid).exec();
        if (contact) {
          contact = copyRxdbContact(contact);
          conv.avatarMembers.push(contact);
        }
      }
      if (convInDB) {
         await convInDB.update({
          $set: {
            at: conv.at,
            unreadMessages: conv.unreadMessages,
            lastMessageTime: conv.lastMessageTime,
            lastMessageText: conv.lastMessageText,
            lastMessageSender: conv.lastMessageSender,
            lastMessageSenderName: conv.lastMessageSenderName,
            avatarMembers: conv.avatarMembers
          }
        });
         chatModel.updateAvatars(conv.jid);
         return;
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
      unreadMessages: 0,
      at: false
    }
  });
};

const saveConversationName = async payload => {
  const db = await getDb();
  const conv = await db.conversations.findOne(payload.from.bare).exec();
  if (conv) {
    return conv.update({
      $set: {
        name: payload.edimucevent.edimucconfig.name
      }
    })
  }
  return null
};

export const storeConversationNameEpic = action$ =>
  action$.ofType(STORE_CONVERSATION_NAME)
    .mergeMap(({ payload }) =>
      Observable.fromPromise((saveConversationName(payload)))
        .map((conv) => successfullyStoredConversationName(conv))
        .catch(err => console.log(err))
    );

export const beginStoreOccupantsEpic = action$ =>
  action$.ofType(BEGIN_STORE_OCCUPANTS)
    .mergeMap(({ payload }) =>
      Observable.fromPromise(saveOccupants(payload))
        .map(conv => successfullyStoredOccupants(conv))
        .catch(err => Observable.of(failedStoringOccupants(err, payload)))
    );

export const beginStoreConversationsEpic = action$ =>
  action$.ofType(BEGIN_STORE_CONVERSATIONS)
    .mergeMap(({ payload: conversations }) =>
      Observable.fromPromise(saveConversations(conversations))
        .map(convs => successfullyStoredConversations(convs))
        .catch(err => {
          return Observable.of(failedStoringConversations(err, conversations))
        })
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
                conversation.lastMessageSender &&
                conversation.lastMessageTime
              )
                .sort((a, b) => b.lastMessageTime - a.lastMessageTime)
            )
            .map(conversations => {
              // update system tray's unread count
              setTimeout(() => {
                if (conversations) {
                  let totalUnread = 0;
                  conversations.map(item => {
                    totalUnread += item.unreadMessages;
                  })
                  ipcRenderer.send('update-system-tray-chat-unread-count', totalUnread);
                }
              }, 100);
              return updateConversations(conversations)
            })
        )
        .catch(err => Observable.of(failRetrievingConversations(err)))
    );

export const selectConversationEpic = action$ =>
  action$.ofType(SELECT_CONVERSATION)
    .mergeMap(({ payload: jid }) => {
      clearConversationUnreadMessages(jid);
      return Observable.fromPromise(retriveConversation(jid))
        .map(conversation => { 
          return updateSelectedConversation(conversation)
        })
        .catch(error => failedSelectingConversation(error, jid))
    });

export const newConversationEpic = action$ =>
  action$.ofType(NEW_CONVERSATION)
    .map(({ payload: jid }) => {
      return updateSelectedConversation({
        jid: jid,
        curJid: null,
        name: ' ',
        email: null,
        avatar: null,
        isGroup: false,
        unreadMessages: 0,
        occupants: []
      });
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
            curJid: contact.curJid,
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

export const createInitiatedPrivateConversationEpic = (action$) =>
  action$.ofType(CREATE_PRIVATE_CONVERSATION)
    .mergeMap(({ payload: contact }) =>
      Observable.fromPromise(retriveConversation(contact.jid))
        .map(conv => {
          if (conv || !contact.name) {
            return selectConversation(conv.jid);
          } else {
            const content = '';
            conv = {
              jid: contact.jid,
              curJid: contact.curJid,
              name: contact.name,
              occupants: [contact.jid, contact.curJid],
              isGroup: false,
              // below is some filling to show the conversation
              unreadMessages: 0,
              lastMessageSender: contact.curJid,
              lastMessageText: content,
              lastMessageTime: (new Date()).getTime()
            }
            return { conversation: conv }
          }
        }))
    .filter(({ conversation }) => {
      return !!conversation;
    })
    .map(({ conversation }) => {
      return beginStoringConversations([conversation]);
    });

export const groupConversationCreatedEpic = (action$) =>
  action$.ofType(CREATE_GROUP_CONVERSATION)
    .mergeMap(({ payload: { contacts, roomId, name } }) => {
      const jidArr = contacts.map(contact => contact.jid).sort();
      const opt = {
        type: 'create',
        name: name,
        subject: 'test subject',
        description: 'test description',
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
          return updateSelectedConversation({
            jid: roomId,
            curJid: contacts[0].curJid,
            name: name,
            email: emails,
            avatar: 'GP', // this is temp
            isGroup: true,
            unreadMessages: 0,
            occupants: [
              contacts[0].curJid,
              ...jidArr
            ],
          });
        })
    });

export const createGroupMessageConversationEpic = (action$) =>
  action$.ofType(CREATE_GROUP_CONVERSATION)
    .map(({ payload: { contacts, roomId, name } }) => {
      const jidArr = contacts.map(contact => contact.jid).sort();
      const content = '';
      const timeSend = new Date().getTime();
      const conversation = {
        jid: roomId,
        curJid: contacts[0].curJid,
        name: name,
        isGroup: true,
        unreadMessages: 0,
        occupants: [
          chatModel.currentUser.jid,
          ...jidArr
        ],
        lastMessageTime: (new Date(timeSend)).getTime(),
        lastMessageText: content,
        lastMessageSender: contacts[0].curJid
      };
      return conversation;
    })
    .mergeMap(conv => {
      return Observable.fromPromise(getDb())
        .mergeMap(db => {
          return Observable.fromPromise(Promise.all(conv.occupants.map(occupant => db.contacts.findOne().where('jid').eq(occupant).exec())
          )).map(contacts => {
            contacts = contacts.filter(contact => contact);
            contacts = [contacts.find(contact => contact.jid === conv.curJid), contacts.find(contact => contact.jid !== conv.curJid)];
            contacts = [copyRxdbContact(contacts[0]), copyRxdbContact(contacts[1])];
            conv.avatarMembers = contacts;
            return conv;
          });
        })
    })
    .map(conversation => {
      return beginStoringConversations([conversation]);
    });

export const removeConversationEpic = (action$) =>
  action$.ofType(REMOVE_CONVERSATION)
    .map(({ payload: jid }) => {
      removeConversation(jid);
      return jid;
    }).map(jid => {
      return { type: REMOVING_CONVERSATION, payload: jid }
    });

