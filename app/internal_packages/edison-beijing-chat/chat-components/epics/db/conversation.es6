import { Observable } from 'rxjs/Observable';
import getDb from '../../db';
import { ContactStore } from 'chat-exports';
import {
  BEGIN_STORE_CONVERSATIONS,
  BEGIN_STORE_OCCUPANTS,
  FAIL_STORE_CONVERSATIONS,
  RETRY_STORE_CONVERSATIONS,
  RETRIEVE_ALL_CONVERSATIONS,
  successfullyStoredConversations,
  failedStoringConversations,
  retryStoringConversations,
  failedRetryStoringConversations,
  updateConversations,
  failRetrievingConversations,
  successfullyStoredOccupants,
  failedStoringOccupants,
} from '../../actions/db/conversation';
import { ipcRenderer } from 'electron';
import chatModel from '../../store/model';
import keyMannager from '../../../../../src/key-manager';
import { queryProfile } from '../../utils/restjs';
import { safeUpdate, safeUpsert } from '../../utils/db-utils';
const Sequelize = require('sequelize');
const Op = Sequelize.Op

const saveOccupants = async payload => {
  if (!payload.mucAdmin) {
    return null;
  }
  const jid = payload.from.bare;
  const occupants = payload.mucAdmin.items.map(item => item.jid.bare);
  const db = await getDb();
  const convInDB = await db.conversations.findOne(jid).exec();
  if (convInDB) {
    safeUpdate(convInDB, { occupants });
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
  const convs = [];
  for (const conv of conversations) {
    const c = await saveConversation(db, conv);
    convs.push(c);
  }
  return convs;
};
const saveConversation = async (db, conv) => {
  const convInDB = await db.conversations.findOne(conv.jid).exec();
  if (conv.unreadMessages === 1) {
    if (convInDB) {
      conv.unreadMessages = convInDB.unreadMessages + 1;
    }
  }
  // when private chat, update avatar
  if (!conv.isGroup) {
    const contact = await ContactStore.findContactByJid(conv.jid);
    if (contact && contact.avatar) {
      conv.avatar = contact.avatar;
    }
    if (convInDB) {
      if (!conv.name) {
        conv.name = convInDB.name;
      }
      safeUpdate(convInDB, { ...conv });
    }
  }
  // when group chat, if exists in db, do not update occupants
  else {
    const profile = await getProfile(conv.lastMessageSender);
    if (profile && profile.resultCode === 1) {
      conv.lastMessageSenderName = profile.data.name;
    }
    if (!conv.avatarMembers) {
      conv.avatarMembers = []
      let contact = await ContactStore.findContactByJid(conv.lastMessageSender);
      if (contact) {
        conv.avatarMembers.push(contact);
      }
    }
    if (!conv.avatarMembers.length) {
      let contact = await ContactStore.findContactByJid(conv.curJid);
      if (contact) {
        conv.avatarMembers.push(contact);
      }
    }
    if (conv.avatarMembers.length < 2) {
      let contact = await ContactStore.findOneByCondition({
        jid: {
          [Op.ne]: conv.curJid
        }
      });
      if (contact) {
        conv.avatarMembers.push(contact);
      }
    }
    if (convInDB) {
      await safeUpdate(convInDB, {
        at: conv.at,
        unreadMessages: conv.unreadMessages,
        lastMessageTime: conv.lastMessageTime,
        lastMessageText: conv.lastMessageText,
        lastMessageSender: conv.lastMessageSender,
        lastMessageSenderName: conv.lastMessageSenderName,
        avatarMembers: conv.avatarMembers
      });
      // chatModel.updateAvatars(conv.jid);
      return convInDB;
    }
  }
  return safeUpsert(db.conversations, conv);
}

let prevConvJid;
let prevConvName;

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
          // console.log('failedStoringConversations', err);
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
            .filter(() => {
              const time = new Date().getTime();
              const keep = time - chatModel.lastUpdateConversationTime > 500;
              if (keep) {
                chatModel.lastUpdateConversationTime = time;
              }
              return keep;
            })
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

