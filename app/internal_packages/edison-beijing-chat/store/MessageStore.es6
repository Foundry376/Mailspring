import MailspringStore from 'mailspring-store';
import { ChatActions, RoomStore, ConversationStore } from 'chat-exports';
import { encrypte, decrypte } from '../chat-components/utils/rsa';
import { downloadFile } from '../chat-components/utils/awss3';
import { getMessageContent } from '../chat-components/utils/message';
import { isImageFilePath, isJsonStr } from '../chat-components/utils/stringUtils';
import {
  groupMessages,
  groupMessagesByTime,
  addMessagesSenderNickname,
} from '../chat-components/utils/message';
import ConversationModel from '../model/Conversation';
import MessageModel, { MESSAGE_STATUS_RECEIVED } from '../model/Message';
import getDb from '../chat-components/db';
import chatModel from '../chat-components/store/model';
// TODO 
// getPriKey getDeviceId should get data from sqlite
import { getPriKey, getDeviceId } from '../chat-components/utils/e2ee';

const SEPARATOR = '$';
export const RECEIVE_GROUPCHAT = 'RECEIVE_GROUPCHAT';
export const RECEIVE_PRIVATECHAT = 'RECEIVE_PRIVATECHAT';
export const FILE_TYPE = {
  TEXT: 1,
  IMAGE: 2,
  GIF: 5,
  STICKER: 12,
  OTHER_FILE: 9
}

class MessageStore extends MailspringStore {
  constructor() {
    super();
    this.groupedMessages = [];
    this._registerListeners();
    return;
  }

  _registerListeners() {
  }

  reveivePrivateChat = async (message) => {
    this.receivePrivateMessage(message);
  }

  receivePrivateMessage = async (payload) => {
    this.receiveMessage(payload, RECEIVE_PRIVATECHAT);
    // TODO 要在这里更新conversation
  }

  reveiveGroupChat = async (message) => {
    const { deviceId, priKey } = await getPriKey();
    if (message.payload) {
      let jidLocal = message.curJid.substring(0, message.curJid.indexOf('@'));
      let keys = message.keys;//JSON.parse(msg.body);
      if (keys && keys[jidLocal]
        && keys[jidLocal][deviceId]) {
        let text = keys[jidLocal][deviceId];
        if (text) {
          let aes = decrypte(text, priKey);//window.localStorage.priKey);
          this.downloadAndTagImageFileInMessage(RECEIVE_GROUPCHAT, aes, message);
        }
      }
    } else {
      this.downloadAndTagImageFileInMessage(RECEIVE_GROUPCHAT, null, message);
      if (message.appJid) {
        try {
          let json = JSON.parse(message.body);
          json.appJid = message.appJid;
          json.appName = message.appName;
          json.htmlBody = message.htmlBody;
          json.ctxCmds = message.ctxCmds;
          message.body = JSON.stringify(json);
        } catch (e) { }
      }
    }
    this.receiveGroupMessage(message);
  }

  downloadAndTagImageFileInMessage = (chatType, aes, payload) => {
    console.log('****downloadAndTagImageFileInMessage', chatType, aes, payload);
    let body;
    let convJid;
    if (chatType === RECEIVE_PRIVATECHAT) {
      convJid = payload.from.bare;
    } else {
      convJid = payload.from.local;
    }
    const msgid = payload.id;
    if (aes) {
      body = decryptByAES(aes, payload.payload);
    } else {
      body = payload.body;
    }
    let msgBody;
    try {
      msgBody = JSON.parse(body);
    } catch (e) {
      console.error('****downloadAndTagImageFileInMessage error:', e);
      return;
    }
    if (msgBody.mediaObjectId && msgBody.mediaObjectId.match(/^https?:\/\//)) {
      // a link
      msgBody.path = msgBody.mediaObjectId;
      // } else if (msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF || msgBody.type === FILE_TYPE.OTHER_FILE) {
    } else if (msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF) {
      // file on aws
      let name = msgBody.mediaObjectId;
      name = name.split('/')[1]
      name = name.replace(/\.encrypted$/, '');
      let path = AppEnv.getConfigDirPath();
      let downpath = path + '/download/';
      if (!fs.existsSync(downpath)) {
        fs.mkdirSync(downpath);
      }
      const thumbPath = downpath + name;
      msgBody.path = 'file://' + thumbPath;
      msgBody.downloading = true;
      downloadFile(aes, msgBody.thumbObjectId, thumbPath, () => {
        if (fs.existsSync(thumbPath)) {
          ChatActions.updateDownloadPorgress();
          downloadFile(aes, msgBody.mediaObjectId, thumbPath, () => {
            if (fs.existsSync(thumbPath)) {
              ChatActions.updateDownloadPorgress();
            }
          });
        }
      });
    }
    if (aes) {
      msgBody.aes = aes;
    }
    payload.body = JSON.stringify(msgBody);
    this.retrievingMessages(payload.from.bare);
  }

  retrievingMessages = (jid) => {
    console.log('****retrievingMessages', jid);
    if (chatModel.conversationJid != jid) {
      saveGroupMessages(chatModel.groupedMessages);
    }
    chatModel.conversationJid = jid;
    this.retrieveSelectedConversationMessages(jid);
  }

  retrieveSelectedConversationMessages = async (jid) => {
    console.log('*****retrieveSelectedConversationMessages - 1', jid);
    let messages = await MessageModel.findAll({
      where: {
        conversationJid: jid
      },
      order: [
        ['sentTime', 'DESC']
      ]
    });
    messages = messages.filter(msg => msg.body.indexOf('"deleted":true') === -1);
    console.log('*****retrieveSelectedConversationMessages - 2', messages);
    addMessagesSenderNickname(messages);
    this.groupedMessages = groupMessagesByTime(messages, 'sentTime', 'day');
    this.trigger();
  }

  receiveGroupMessage = async (payload) => {
    this.receiveMessage(payload, RECEIVE_GROUPCHAT);
    console.log('****receiveGroupMessage', payload);
    let beAt = false;
    let name = payload.from.local;
    // get the room name and whether you are '@'
    const rooms = RoomStore.getRooms();
    const body = JSON.parse(payload.body);
    beAt = !body.atJids || body.atJids.indexOf(payload.curJid) === -1 ? false : true;
    if (rooms[payload.from.bare]) {
      name = rooms[payload.from.bare];
    } else {
      let roomsInfo = await xmpp.getRoomList(null, payload.curJid);
      RoomStore.saveRooms(roomsInfo);
      roomsInfo = roomsInfo || {
        curJid: payload.curJid,
        discoItems: { items: [] },
      };
      const { discoItems: { items } } = roomsInfo;
      if (items) {
        for (const item of items) {
          if (payload.from.local === item.jid.local) {
            name = item.name;
            break;
          }
        }
      }
    }
    let at = false;
    const { lastMessageTime, sender, lastMessageText } = await getLastMessageInfo(payload);
    const { timeSend } = JSON.parse(payload.body);
    // if not current conversation, unreadMessages + 1
    let unreadMessages = 0;
    const selectedConversation = ConversationStore.getSelectedConversation();
    if (!selectedConversation || selectedConversation.jid !== payload.from.bare) {
      unreadMessages = 1;
      at = beAt;
    }
    let conv = {
      jid: payload.from.bare,
      curJid: payload.curJid,
      name: name,
      isGroup: true,
      unreadMessages: unreadMessages,
      lastMessageTime,
      lastMessageText,
      lastMessageSender: sender || payload.from.resource + '@im.edison.tech',
      at
    };
    const convInDb = await ConversationStore.getConversationByJid(conv.jid);
    if (convInDb) {
      conv.occupants = convInDb.occupants;
      conv.avatarMembers = convInDb.avatarMembers;
    } else {
      conv.occupants = [];
    }

    let db = await getDb();
    const contact = await db.contacts.findOne().where('jid').eq(conv.lastMessageSender).exec();
    addToAvatarMembers(conv, contact);
    ConversationStore.saveConversations([conv]);
  }

  receiveMessage = (payload, type) => {
    let timeSend;
    if (payload.body && payload.body.trim().indexOf('{') != 0) {
      payload.body = '{"type":1,"content":"' + payload.body + '"}';
    }
    timeSend = parseInt(payload.ts);
    let sender = payload.from.bare;
    // if groupchat, display the sender name
    if (type === RECEIVE_GROUPCHAT) {
      sender = payload.from.resource + '@im.edison.tech';
    }
    let conversationJid;
    if (payload.curJid === payload.from.bare) {
      conversationJid = payload.to.bare
    } else {
      conversationJid = payload.from.bare
    }
    const message = {
      id: payload.id,
      conversationJid,
      sender: sender,
      body: payload.body,
      sentTime: (new Date(timeSend)).getTime(),
      status: MESSAGE_STATUS_RECEIVED,
      ts: payload.ts,
      curJid: payload.curJid
    };
    this.saveMessages([message]);
  }

  saveMessages = async messages => {
    for (const msg of messages) {
      const messageInDb = await MessageModel.findOne({
        where: {
          id: msg.id
        }
      });
      if (messageInDb) {
        // because sending message in group chat will be overrided by the same RECEIVE_GROUPCHAT message overrided
        // so do below to restore  localFile field
        // and for RXDocouments Object.assign will not copy all fields
        // it is necessary to rebuild the message one field by one field.
        let body = JSON.parse(messageInDb.body);
        let localFile = body.localFile;
        body = JSON.parse(msg.body);
        if (localFile && msg.status === MESSAGE_STATUS_RECEIVED) {
          body.localFile = localFile;
        }
        body = JSON.stringify(body);
        messageInDb.body = body;
        if (messageInDb.updateTime && msg.status === MESSAGE_STATUS_RECEIVED) {
          messageInDb.updateTime = messageInDb.updateTime;
        }
        // update message id: uuid + conversationJid
        messageInDb.id = messageInDb.id.split(SEPARATOR)[0] + SEPARATOR + msg.conversationJid;
        messageInDb.save();
      } else {
        // update message id: uuid + conversationJid
        if (msg.id.indexOf(SEPARATOR) === -1) {
          msg.id += SEPARATOR + msg.conversationJid;
        }
        MessageModel.upsert(msg);
      }
    }
  };
}

// TODO
// 这里为什么要加上阅读时间
const saveGroupMessages = async (groupedMessages) => {
  const readTime = new Date().getTime();
  if (groupedMessages) {
    groupedMessages.reverse();
    for (const { messages } of groupedMessages) {
      messages.reverse();
      for (const msg of messages) {
        if (msg.updateTime && (!msg.readTime || msg.readTime < msg.updateTime)) {
          console.log('*****saveGroupMessages', msg);
          ConversationModel.update({ readTime }, {
            where: {
              id: msg.id
            }
          });
        }
      }
    }
  }
}

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
      conv.avatarMembers[0] = contact;
      return conv;
    } else {
      return conv;
    }
  } else {
    conv.avatarMembers[0] = contact;
    return conv;
  }
}

const getLastMessageInfo = async (message) => {
  let body, lastMessageText, sender = null, lastMessageTime = (new Date()).getTime();
  body = message.body;
  if (!body) {
    return { sender, lastMessageTime, lastMessageText };
  }
  if (isJsonStr(body)) {
    body = JSON.parse(body);
  }
  if (body.updating || body.deleted) {
    let conv = message.conversation;
    if (!conv) {
      conv = await ConversationStore.getConversationByJid(message.from.bare);
      if (!conv) {
        lastMessageText = getMessageContent(message);
        return { sender, lastMessageTime, lastMessageText };
      }
    }
    console.log('*****getLastMessageInfo', conv.jid);
    let lastMessage = await MessageModel.findOne({
      where: {
        conversationJid: conv.jid
      },
      order: [
        ['sentTime', 'DESC']
      ]
    });

    if (lastMessage) {
      const id = message.id.split('$')[0];
      const lastid = lastMessage.id.split('$')[0];
      if (id != lastid) {
        sender = lastMessage.sender;
        lastMessageTime = lastMessage.sentTime;
        lastMessageText = getMessageContent(lastMessage);
      } else if (body.deleted) {
        lastMessageTime = lastMessage.sentTime || lastMessageTime;
        lastMessageText = '';
      } else {
        lastMessageText = body.content;
      }
    }
  } else {
    lastMessageText = body.content;
  }
  return { sender, lastMessageTime, lastMessageText };
}

module.exports = new MessageStore();
