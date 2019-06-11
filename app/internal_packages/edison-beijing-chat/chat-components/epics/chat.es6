import fs from 'fs'
import uuid from 'uuid/v4';
import { Observable } from 'rxjs/Observable';
import xmpp from '../xmpp';
import getDb from '../db';
import chatModel, { saveToLocalStorage } from '../store/model';
import { copyRxdbContact, safeUpdate, saveGroupMessages } from '../utils/db-utils';
const { remote } = require('electron');
const { Actions } = require('mailspring-exports');
import { ChatActions, ContactStore } from 'chat-exports';
import {
  MESSAGE_STATUS_FILE_UPLOADING,
  MESSAGE_STATUS_SENDING,
  MESSAGE_STATUS_DELIVERED,
  MESSAGE_STATUS_RECEIVED,
} from '../db/schemas/message';
import { postNotification } from '../utils/electron';
import {
  BEGIN_SEND_MESSAGE,
  RECEIVE_CHAT,
  RECEIVE_GROUPCHAT,
  MEMBERS_CHANGE,
  MESSAGE_SENT,
  RECEIVE_PRIVATE_MESSAGE,
  RECEIVE_GROUP_MESSAGE,
  SENDING_MESSAGE,
  SUCCESS_SEND_MESSAGE,
  SHOW_CONVERSATION_NOTIFICATION,
  receivePrivateMessage,
  receiveGroupMessage,
  receiptSent,
  successfullySentMessage,
  newMessage,
  sendingMessage,
  showConversationNotification,
  showConversationNotificationFail,
} from '../actions/chat';
import {
  UPDATE_SELECTED_CONVERSATION,
  updateSelectedConversation,
  beginStoringConversations,
} from '../actions/db/conversation';
import {
  beginStoringMessage,
  retrieveSelectedConversationMessages,
} from '../actions/db/message';
import { getLastMessageInfo, parseMessageBody } from '../utils/message';
import { encryptByAES, decryptByAES, generateAESKey } from '../utils/aes';
import { encrypte, decrypte } from '../utils/rsa';
import { getPriKey, getDeviceId } from '../utils/e2ee';
import { downloadFile } from '../utils/awss3';
import { FILE_TYPE } from '../components/chat/messages/messageModel';
const GROUP_CHAT_DOMAIN = '@muc.im.edison.tech';

const addToAvatarMembers = (conv, contact) => {
  if (!contact) {
    return conv;
  }
  if (!conv.isGroup) {
    return conv;
  }
  conv.avatarMembers = conv.avatarMembers || [];
  if (conv.avatarMembers[0]) {
    if (contact.jid !== conv.avatarMembers[0].jid) {
      conv.avatarMembers[1] = conv.avatarMembers[0];
      contact = copyRxdbContact(contact);
      conv.avatarMembers[0] = contact;
      return conv;
    } else {
      return conv;
    }
  } else {
    contact = copyRxdbContact(contact);
    conv.avatarMembers[0] = contact;
    return conv;
  }
}

export const receiptSentEpic = action$ =>
  action$.ofType(MESSAGE_SENT)
    .filter(({ payload }) => payload.receipt && !payload.body)
    .map(({ payload }) => receiptSent(payload.id));

export const membersChangeEpic = action$ =>
  action$.ofType(MEMBERS_CHANGE)
    .mergeMap(({ payload }) => Observable.fromPromise(asyncMembersChangeEpic(payload)));

const asyncMembersChangeEpic = async payload => {
  const notifications = chatModel.chatStorage.notifications || (chatModel.chatStorage.notifications = {});
  const items = notifications[payload.from] || (notifications[payload.from] = []);
  const nicknames = chatModel.chatStorage.nicknames;
  const fromjid = payload.userJid;
  const fromcontact = await ContactStore.findContactByJid(fromjid);
  const byjid = payload.actorJid;
  const bycontact = await ContactStore.findContactByJid(byjid);
  const item = {
    from: {
      jid: fromjid,
      email: payload.userEmail,
      name: fromcontact && fromcontact.name,
      nickname: nicknames[fromjid]
    },
    type: payload.type,
    by: {
      jid: byjid,
      email: bycontact && bycontact.email,
      name: bycontact && bycontact.name,
      nickname: nicknames[byjid]
    }
  }

  let content;
  const fromName = item.from.nickname || item.from.name || item.from.email;
  const byName = item.by.nickname || item.by.name || item.by.email;
  if (payload.type === 'join') {
    content = `${fromName} joined by invitation from ${byName}.`
  } else {
    content = `${fromName} quited by operation from ${byName}.`
  }
  const body = {
    content,
  }
  const msg = {
    id: uuid(),
    conversationJid: payload.from.bare,
    sender: fromjid,
    body: JSON.stringify(body),
    sentTime: (new Date()).getTime(),
    status: MESSAGE_STATUS_RECEIVED,
  };
  return beginStoringMessage(msg);
}

export const successSendMessageEpic = action$ =>
  action$.ofType(MESSAGE_SENT)
    .filter(({ payload }) => !payload.receipt && payload.body)
    .map(({ payload }) => successfullySentMessage(payload));

export const sendMessageEpic = action$ =>
  action$.ofType(BEGIN_SEND_MESSAGE)
    .map(
      ({ payload }) => {
        const db = getDb();
          return { db, payload }
      }
    )//yazzzzz
    .mergeMap(({ db, payload }) => {
      if (payload.conversation.isGroup) {//yazz 区分群聊和非群聊
        let occupants = payload.conversation.occupants;
        return Observable.fromPromise(db.e2ees.find({ jid: { $in: occupants } }).exec())
          .map(e2ees => {
            let devices = [];
            if (e2ees && e2ees.length == occupants.length) {
              e2ees.forEach((e2ee => {
                let device = {};
                device.dk = JSON.parse(e2ee.devices);
                device.jid = e2ee.jid;
                devices.push(device);
              }));
              console.log(devices)
            }
            payload.devices = devices;//e2ee.devices;
            return { db, payload };
          });
      } else {
        return Observable.fromPromise(db.e2ees.findOne({where:{jid:payload.conversation.jid}}))
          .map(e2ee => {
            if (e2ee) {
              payload.devices = e2ee.devices;
            }
            return { db, payload };
          });
      }
    })
    .mergeMap(({ db, payload }) => {
      return Observable.fromPromise(db.e2ees.findOne({where:{jid:payload.conversation.curJid}}))
        .map(e2ee => {
          if (e2ee) {
            payload.selfDevices = e2ee.devices;
          }
          return { payload };
        });
    })
    .mergeMap(({ payload }) => {
      return Observable.fromPromise(getDeviceId()).map((deviceId) => {
        return { payload, deviceId };
      });
    })
    .map(({ payload, deviceId }) => {
      const { conversation, body, id, devices, selfDevices, isUploading, updating } = payload;

      let ediEncrypted;
      if (devices) {
        ediEncrypted = getEncrypted(conversation.jid, body, devices, selfDevices, conversation.curJid, deviceId);
      }
      // update conversation last message
      if (body) {
        getLastMessageInfo(payload).then(({ lastMessageTime, sender, lastMessageText }) => {
          safeUpdate(conversation, {
            lastMessageTime,
            lastMessageSender: sender || conversation.curJid,
            lastMessageText
          });
          if (!conversation.isGroup) {
            // if private chat, and it's a new conversation
            const db = getDb();
            db.conversations.findOne({ where: { jid: conversation.jid } }).then(conv =>
              safeUpdate(conv, {
                lastMessageTime,
                lastMessageSender: sender || conversation.curJid,
                lastMessageText
              }))
          }
        });
      }
      if (ediEncrypted) {
        return ({
          id,
          ediEncrypted: ediEncrypted,
          to: conversation.jid,
          type: conversation.isGroup ? 'groupchat' : 'chat',
          isUploading,
          curJid: conversation.curJid,
          updating
        });
      } else {
        return ({
          id,
          body: body,
          to: conversation.jid,
          type: conversation.isGroup ? 'groupchat' : 'chat',
          isUploading,
          curJid: conversation.curJid,
          updating
        });
      }
    })
    .map(message => {
      const action = sendingMessage(message);
      let payload = message;
      if (!payload.isUploading) {
        xmpp.sendMessage(payload, payload.curJid);
      }
      return action;
    })

export const newTempMessageEpic = (action$, { getState }) =>
  action$.ofType(SENDING_MESSAGE)//yazzz2
    .mergeMap((payload) => {
      return Observable.fromPromise(getPriKey()).map(({ deviceId, priKey }) => {
        return { payload: payload.payload, deviceId, priKey };
      });
    })
    .map(({ payload, deviceId, priKey }) => {
      const curJid = payload.curJid;
      const curJidLocal = curJid ? curJid.split('@')[0] : '';
      if (payload.ediEncrypted) {
        let keys = payload.ediEncrypted.header.key;//JSON.parse(msg.body);
        let text = getAes(keys, curJidLocal, deviceId);
        if (text) {
          let aes = decrypte(text, priKey);//window.localStorage.priKey);
          payload.body = decryptByAES(aes, payload.ediEncrypted.payload);
        }
      }
      const message = {
        id: payload.id,
        conversationJid: payload.to,
        curJid,
        sender: curJid,
        body: payload.body,// || payload.ediEncrypted,//yazzz3
        sentTime: (new Date()).getTime(),
        status: payload.isUploading ? MESSAGE_STATUS_FILE_UPLOADING : MESSAGE_STATUS_SENDING,
      };
      let body = parseMessageBody(payload.body);
      if (body && body.updating) {
        message.updateTime = (new Date()).getTime() + chatModel.diffTime;
      } else {
        message.sentTime = (new Date()).getTime() + chatModel.diffTime;
      }
      return message;
    }).map(newPayload => newMessage(newPayload));

const getAes = (keys, curJid, deviceId) => {
  if (keys) {
    let text;
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i];
      if (key.uid == curJid
        && key.rid == deviceId) {
        text = key.text;
        break;
      }
    }
    ;
    return text;
  }
};
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
        .map(db => ({ db, message })),
    )
    .mergeMap(({ db, message }) =>
      Observable.fromPromise(db.conversations.findOne(message.to.bare).exec())
        .mergeMap(conversation => {
          let conv = conversation;
          if (!conversation) {
            const { chat: { selectedConversation } } = getState();
            conv = selectedConversation;
          }
          return Observable.fromPromise(getLastMessageInfo(message))
            .map(({ lastMessageTime, sender, lastMessageText }) => {
              return Object.assign({}, JSON.parse(JSON.stringify(conv)), {
                lastMessageTime,
                lastMessageText,
                lastMessageSender: sender || message.from.bare,
                _rev: undefined,
              });
            });
        }),
    )
    .mergeMap(conv => {
      return Observable.fromPromise(getDb())
        .mergeMap(db => {
          return Observable.fromPromise(db.conversations.findOne().where('jid').eq(conv.jid).exec())
            .map(convInDb => {
              if (conv.isGroup) {
                conv.occupants = convInDb.occupants;
                conv.avatarMembers = convInDb.avatarMembers;
                return conv;
              } else {
                return conv;
              }
            })
            .mergeMap(conv => {
              return Observable.fromPromise(ContactStore.findContactByJid(conv.lastMessageSender))
                .map(contact => {
                  addToAvatarMembers(conv, contact);
                  return conv;
                })
            })
        })
    })
    .map(conversation => {
      beginStoringConversations([conversation])
    });

export const beginRetrievingMessagesEpic = action$ =>
  action$.ofType(UPDATE_SELECTED_CONVERSATION)
    .filter(({ payload }) => !!payload)
    .map(({ payload: { jid } }) => {
      if (chatModel.conversationJid != jid) {
        saveGroupMessages(chatModel.groupedMessages);
      }
      chatModel.conversationJid = jid;
      return retrieveSelectedConversationMessages(jid);

    });

const getEncrypted = (jid, body, devices, selfDevices, curJid, deviceId) => {
  let aeskey = generateAESKey();
  let uid = jid.substring(0, jid.indexOf('@'));//new JID(jid).local;//.substring(0,jid.indexOf('@'));
  if (!selfDevices) {
    console.warn('getEncrypted: selfDevices is undefined');
    return false;
  }
  let selfDk = JSON.parse(selfDevices);
  let dk = [];

  let keys = [];
  if (typeof devices == "string") {
    dk = JSON.parse(devices);
    keys = addKeys(uid, dk, aeskey, keys);
    if (keys.length > 0) {
      keys = addKeys(curJid, selfDk, aeskey, keys);
    }
  } else {
    devices.forEach(device => {
      keys = addKeys(device.jid, device.dk, aeskey, keys);
    });
  }

  //对称加密body
  if (keys.length > 0) {
    //keys = addKeys(window.localStorage.jidLocal, selfDk, aeskey, keys);
    let ediEncrypted = {
      header: {
        sid: deviceId,
        key: keys,
      },
      payload: encryptByAES(aeskey, body),
    };
    return ediEncrypted;

  }
  return false;
};
const addKeys = (jid, dk, aeskey, keys) => {
  for (let i in dk) {
    let did = dk[i];
    if (!did.key || did.key.length < 10) {
      continue;
    }
    let uid = jid;
    if (jid.indexOf('@') > 0) {
      uid = jid.substring(0, jid.indexOf('@'));
    }
    let key = {
      uid: uid,
      rid: did.id,
      text: encrypte(did.key, aeskey),
    };
    keys.push(key);
  }
  return keys;
};
