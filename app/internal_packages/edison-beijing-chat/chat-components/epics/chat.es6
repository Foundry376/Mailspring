import { Observable } from 'rxjs/Observable';
import xmpp from '../xmpp';
import { MessageStore, RoomStore, ContactStore, E2eeStore } from 'chat-exports';


import {
  MESSAGE_STATUS_FILE_UPLOADING,
  MESSAGE_STATUS_SENDING,
  MESSAGE_STATUS_DELIVERED,
} from '../../model/Message';
import {
  BEGIN_SEND_MESSAGE,
  MESSAGE_SENT,
  SENDING_MESSAGE,
  SUCCESS_SEND_MESSAGE,
  receiptSent,
  successfullySentMessage,
  newMessage,
  sendingMessage,
} from '../actions/chat';
import {
  retrieveSelectedConversationMessages,
} from '../actions/db/message';
import { getLastMessageInfo, parseMessageBody } from '../utils/message';
import { encryptByAES, decryptByAES, generateAESKey } from '../utils/aes';
import { encrypte, decrypte } from '../utils/rsa';
import { getPriKey, getDeviceId } from '../utils/e2ee';
import { isJsonStr } from '../utils/stringUtils';

export const receiptSentEpic = action$ =>
  action$.ofType(MESSAGE_SENT)
    .filter(({ payload }) => payload.receipt && !payload.body)
    .map(({ payload }) => receiptSent(payload.id));

export const successSendMessageEpic = action$ =>
  action$.ofType(MESSAGE_SENT)
    .filter(({ payload }) => !payload.receipt && payload.body)
    .map(({ payload }) => successfullySentMessage(payload));

export const sendMessageEpic = action$ =>
  action$.ofType(BEGIN_SEND_MESSAGE)
    .mergeMap(({ payload }) => {
      if (payload.conversation.isGroup) {//yazz 区分群聊和非群聊
        const conversation = payload.conversation;
        const occupantsPromise = RoomStore.getConversationOccupants(conversation.jid, conversation.curJid);
        return Observable.fromPromise(occupantsPromise.then(occupants => {
          return Promise.all([E2eeStore.find(occupants), Promise.resolve(occupants)])
        }))
          .map(([e2ees, occupants]) => {
            let devices = [];
            if (e2ees && e2ees.length == occupants.length) {
              e2ees.forEach((e2ee => {
                let device = {};
                if (isJsonStr(e2ee.devices)) {
                  device.dk = JSON.parse(e2ee.devices);
                } else {
                  device.dk = e2ee.devices;
                }
                device.jid = e2ee.jid;
                devices.push(device);
              }));
              console.log(devices)
            }
            payload.devices = devices;//e2ee.devices;
            return { payload };
          });
      } else {
        return Observable.fromPromise(E2eeStore.findOne(payload.conversation.jid))
          .map(e2ee => {
            if (e2ee) {
              payload.devices = e2ee.devices;
            }
            return { payload };
          });
      }
    })
    .mergeMap(({ payload }) => {
      return Observable.fromPromise(E2eeStore.findOne(payload.conversation.curJid))
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
        console.log('xmpp.sendMessage: ', payload);
        xmpp.sendMessage(payload, payload.curJid);
      }
      return action;
    })

export const newTempMessageEpic = (action$, { getState }) =>
  action$.ofType(SENDING_MESSAGE)//yazzz2
    .mergeMap((payload) => {
      return Observable.fromPromise(getPriKey()).map(({ deviceId, prikey }) => {
        return { payload: payload.payload, deviceId, prikey };
      });
    })
    .map(({ payload, deviceId, prikey }) => {
      const curJid = payload.curJid;
      const curJidLocal = curJid ? curJid.split('@')[0] : '';
      if (payload.ediEncrypted) {
        let keys = payload.ediEncrypted.header.key;//JSON.parse(msg.body);
        let text = getAes(keys, curJidLocal, deviceId);
        if (text) {
          let aes = decrypte(text, prikey);//window.localStorage.priKey);
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
        message.updateTime = (new Date()).getTime() + edisonChatServerDiffTime;
      } else {
        message.sentTime = (new Date()).getTime() + edisonChatServerDiffTime;
      }
      return message;
    }).mergeMap(message => {
      delete message.ts;
      delete message.curJid;
      console.log('MessageStore.saveMessagesAndRefresh: ', message);
      return Observable.fromPromise(MessageStore.saveMessagesAndRefresh([message]))
        .map(result => newMessage(message))
    })

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

// export const beginRetrievingMessagesEpic = action$ =>
//   action$.ofType(UPDATE_SELECTED_CONVERSATION)
//     .filter(({ payload }) => !!payload)
//     .map(({ payload: { jid } }) => retrieveSelectedConversationMessages(jid));

const getEncrypted = (jid, body, devices, selfDevices, curJid, deviceId) => {
  let aeskey = generateAESKey();
  let uid = jid.substring(0, jid.indexOf('@'));//new JID(jid).local;//.substring(0,jid.indexOf('@'));
  if (!selfDevices) {
    console.warn('getEncrypted: selfDevices is undefined');
    return false;
  }
  let selfDk = selfDevices;//JSON.parse(selfDevices);
  let dk = [];

  let keys = [];
  keys = addKeys(uid, devices, aeskey, keys);
  if (keys.length > 0) {
    keys = addKeys(curJid, selfDk, aeskey, keys);
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
