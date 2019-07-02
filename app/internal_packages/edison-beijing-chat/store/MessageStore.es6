import MailspringStore from 'mailspring-store';
import { Actions, WorkspaceStore } from 'mailspring-exports';
import { ChatActions, RoomStore, ConversationStore, ContactStore } from 'chat-exports';
import { decrypte } from '../utils/rsa';
import { decryptByAES } from '../utils/aes';
import { downloadFile } from '../utils/awss3';
import { isJsonStr } from '../utils/stringUtils';
import {
  groupMessagesByTime,
  addMessagesSenderNickname, parseMessageBody,
} from '../utils/message';
import ConversationModel from '../model/Conversation';
import MessageModel, { MESSAGE_STATUS_RECEIVED } from '../model/Message';
import fs from 'fs';
import _ from 'underscore';
// TODO
// getPriKey getDeviceId should get data from sqlite
import { getPriKey, getDeviceId } from '../utils/e2ee';
const { remote } = require('electron');
import { postNotification } from '../utils/electron';

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
    this.conversationJid;
    this._registerListeners();
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
  }

  _registerListeners() {
  }
  getMessageById = async (id) => {
    return await MessageModel.findOne({
      where: {
        id
      }
    });
  }


  getGroupedMessages = () => {
    return this.groupedMessages;
  }

  reveivePrivateChat = async (message) => {
    let jidLocal = message.curJid.split('@')[0];
    message = await this.decrypteBody(message, jidLocal);
    if (!message || await this._isExistInDb(message)) {
      return;
    }

    await this.processPrivateMessage(message);
    const conv = await this.storePrivateConversation(message);
    // if current selection, refresh messages
    if (conv.jid === this.conversationJid) {
      this.retrieveSelectedConversationMessages(conv.jid);
    }
    this.showNotification(message);
  }

  removeMessagesByConversationJid = async (jid) => {
    await MessageModel.destroy({
      where: {
        conversationJid: jid
      }
    });
    if (this.conversationJid === jid) {
      this.groupedMessages = [];
      this._triggerDebounced();
    }
  }

  removeMessageById = async (id, convJid) => {
    const $index = id.lastIndexOf('$');
    if ($index > 0) {
      convJid = id.substr($index + 1);
    } else {
      if (!convJid) {
        convJid = this.conversationJid;
      }
      id += '$' + convJid;
    }
    await MessageModel.destroy({ where: { id } });
    if (convJid === this.conversationJid) {
      await this.retrieveSelectedConversationMessages(convJid);
    }
  }

  processPrivateMessage = async (payload) => {
    await this.prepareForSaveMessage(payload, RECEIVE_PRIVATECHAT);
  }

  storePrivateConversation = async (payload) => {
    let name;
    let timeSend = new Date().getTime();
    if (payload.from.bare === payload.curJid) {
      name = null;
    } else {
      name = payload.from.local;
    }
    const { lastMessageTime, sender, lastMessageText } = await getLastMessageInfo(payload);
    if (payload.body) {
      timeSend = JSON.parse(payload.body).timeSend;
    }
    // if not current conversation, unreadMessages + 1
    let unreadMessages = 0;
    const selectedConversation = await ConversationStore.getSelectedConversation();
    if (!selectedConversation || selectedConversation.jid !== payload.from.bare) {
      unreadMessages = 1;
    }
    let jid;
    console.log(payload.from.bare, payload.curJid);
    if (payload.from.bare === payload.curJid) {
      jid = payload.to.bare;
    } else {
      jid = payload.from.bare;
    }
    const contact = await ContactStore.findContactByJid(jid);
    const coversation = {
      jid,
      curJid: payload.curJid,
      name: contact ? contact.name : name,
      isGroup: false,
      unreadMessages: unreadMessages,
      lastMessageTime,
      lastMessageText,
      lastMessageSender: sender || payload.from.bare,
      at: false
    };
    const convInDb = await ConversationStore.getConversationByJid(jid);
    if (convInDb) {
      if (unreadMessages) {
        coversation.unreadMessages = convInDb.unreadMessages + 1;
      }
    }

    await ConversationStore.saveConversations([coversation]);
    return coversation;
  }

  decrypteBody = async (message, jidLocal) => {
    const { deviceId, prikey } = await getPriKey();
    if (message.payload) {
      let keys = message.keys;//JSON.parse(msg.body);
      if (keys && keys[jidLocal]
        && keys[jidLocal][deviceId]) {
        let text = keys[jidLocal][deviceId];
        if (text) {
          let aes = decrypte(text, prikey);//window.localStorage.priKey);
          const result = this.downloadAndTagImageFileInMessage(RECEIVE_GROUPCHAT, aes, message);
          if (!result) {
            return null;
          }
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
    return message;
  }

  _isExistInDb = async (message) => {
    const messageInDb = await this.getMessageById(message.id);
    if (messageInDb) {
      // if already exist in db, skip it
      if (messageInDb.body === message.body) {
        return true;
      }
    }
    return false;
  }

  reveiveGroupChat = async (message) => {
    let jidLocal = message.curJid.split('@')[0];
    message = await this.decrypteBody(message, jidLocal);
    if (!message || await this._isExistInDb(message)) {
      return;
    }

    const conv = await this.processGroupMessage(message);
    if (!conv) {
      return;
    }
    if (conv.jid === this.conversationJid) {
      this.retrieveSelectedConversationMessages(conv.jid);
    }
    this.showNotification(message);
  }

  downloadAndTagImageFileInMessage = (chatType, aes, payload) => {
    let body;
    let convJid = payload.from.bare;
    if (aes) {
      body = decryptByAES(aes, payload.payload);
      if (!body) {
        return false;
      }
    } else {
      body = payload.body;
    }
    let msgBody;
    try {
      msgBody = JSON.parse(body);
    } catch (e) {
      console.error('downloadAndTagImageFileInMessage error:', e, body);
      payload.body = '';
      return;
    }

    if (msgBody.mediaObjectId && msgBody.mediaObjectId.match(/^https?:\/\//)) {
      // a link
      msgBody.path = msgBody.mediaObjectId;
      // } else if (msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF) {
    } else if (msgBody.mediaObjectId && (msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF || msgBody.type === FILE_TYPE.OTHER_FILE)) {
      // file on aws
      let name = msgBody.mediaObjectId || '';
      if (name && name.indexOf('/') !== -1) {
        name = name.substr(name.lastIndexOf('/') + 1);
      }
      name = name && name.replace(/\.encrypted$/, '') || '';
      let path = AppEnv.getConfigDirPath();
      let downpath = path + '/download/';
      if (!fs.existsSync(downpath)) {
        fs.mkdirSync(downpath);
      }
      const thumbPath = downpath + name;
      msgBody.path = 'file://' + thumbPath;
      msgBody.downloading = true;
      if (msgBody.thumbObjectId) {
        downloadFile(aes, msgBody.thumbObjectId, thumbPath, (err) => {
          if (err) {
            msgBody.downloading = false;
            msgBody.content = `the file ${name} failed to be downloaded`;
            body = JSON.stringify(msgBody);
            const msg = {
              id: payload.id + '$' + convJid,
              conversationJid: convJid,
              body,
              status: 'MESSAGE_STATUS_TRANSFER_FAILED'
            }
            this.saveMessagesAndRefresh([msg]);
            ChatActions.updateDownload(msgBody.mediaObjectId);
            return;
          } else if (fs.existsSync(thumbPath)) {
            ChatActions.updateDownload(msgBody.thumbObjectId);
            downloadFile(aes, msgBody.mediaObjectId, thumbPath, (err) => {
              if (err) {
                msgBody.content = `the file ${name} failed to be downloaded`;
                msgBody.downloading = false;
                body = JSON.stringify(msgBody);
                const msg = {
                  id: payload.id + '$' + convJid,
                  conversationJid: convJid,
                  body,
                  status: 'MESSAGE_STATUS_TRANSFER_FAILED'
                }
                this.saveMessagesAndRefresh([msg]);
                ChatActions.updateDownload(msgBody.mediaObjectId);
                return;
              } else if (fs.existsSync(thumbPath)) {
                msgBody.downloading = false;
                body = JSON.stringify(msgBody);
                const msg = {
                  id: payload.id + '$' + convJid,
                  conversationJid: convJid,
                  body,
                  status: 'MESSAGE_STATUS_RECEIVED'
                }
                this.saveMessagesAndRefresh([msg]);
                ChatActions.updateDownload(msgBody.mediaObjectId);
              }
            });
          }
        });
      } else {
        downloadFile(aes, msgBody.mediaObjectId, thumbPath, (err) => {
          if (err) {
            msgBody.content = `the file ${name} failed to be downloaded`;
            msgBody.downloading = false;
            body = JSON.stringify(msgBody);
            const msg = {
              id: payload.id + '$' + convJid,
              conversationJid: convJid,
              body,
              status: 'MESSAGE_STATUS_TRANSFER_FAILED'
            }
            this.saveMessagesAndRefresh([msg]);
            ChatActions.updateDownload(msgBody.mediaObjectId);
            return;
          } else if (fs.existsSync(thumbPath)) {
            msgBody.downloading = false;
            body = JSON.stringify(msgBody);
            const msg = {
              id: payload.id + '$' + convJid,
              conversationJid: convJid,
              body,
              status: 'MESSAGE_STATUS_RECEIVED'
            }
            this.saveMessagesAndRefresh([msg]);
            ChatActions.updateDownload(msgBody.mediaObjectId);
          }
        });
      }
    }
    if (aes) {
      msgBody.aes = aes;
    }
    payload.body = JSON.stringify(msgBody);
    return true;
  }

  // retrievingMessages = (jid) => {
  //   console.log('****retrievingMessages', jid);
  //   if (this.conversationJid != jid) {
  //     saveGroupMessages(this.groupedMessages);
  //   }
  //   this.conversationJid = jid;
  //   this.retrieveSelectedConversationMessages(jid);
  // }

  retrieveSelectedConversationMessages = async (jid, limit, offset) => {
    const condistion = {
      where: {
        conversationJid: jid
      },
      order: [
        ['sentTime', 'ASC']
      ],
    };
    if (limit) {
      condistion.limit = limit
    }
    if (offset) {
      condistion.offset = offset
    }
    let messages = await MessageModel.findAll(condistion);
    messages = messages.filter(msg => {
      const isDeleted = msg.body.indexOf('"deleted":true') !== -1;
      return !isDeleted;
    });
    // add row number for lazy display
    let rowNum = messages.length;
    messages.forEach(msg => {
      msg.rowNum = rowNum--;
    })
    addMessagesSenderNickname(messages);
    this.groupedMessages = groupMessagesByTime(messages, 'sentTime', 'day');
    this.conversationJid = jid;
    this._triggerDebounced();
  }

  processGroupMessage = async (payload) => {
    await this.prepareForSaveMessage(payload, RECEIVE_GROUPCHAT);
    let at = false;
    let name = payload.from.local;
    // get the room name and whether you are '@'
    const rooms = await RoomStore.getRooms();
    const body = parseMessageBody(payload.body);
    at = !body.atJids || body.atJids.indexOf(payload.curJid) === -1 ? false : true;
    if (rooms[payload.from.bare] && rooms[payload.from.bare].name) {
      name = rooms[payload.from.bare].name;
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
    const { lastMessageTime, sender, lastMessageText } = await getLastMessageInfo(payload);
    // if not current conversation, unreadMessages + 1
    let unreadMessages = 0;
    const selectedConversation = await ConversationStore.getSelectedConversation();
    if (!selectedConversation || selectedConversation.jid !== payload.from.bare) {
      unreadMessages = 1;
    }
    let conv = {
      jid: payload.from.bare,
      curJid: payload.curJid,
      name: name,
      isGroup: true,
      unreadMessages,
      lastMessageTime,
      lastMessageText,
      lastMessageSender: sender || payload.from.resource + '@im.edison.tech',
      at
    };
    const convInDb = await ConversationStore.getConversationByJid(conv.jid);
    if (convInDb) {
      conv.avatarMembers = convInDb.avatarMembers || [];
      if (unreadMessages) {
        conv.unreadMessages = convInDb.unreadMessages + 1;
      }
      // if conversation's curJid is not equal to payload's curJid, skip it.
      if (convInDb.curJid !== payload.curJid) {
        return;
      }
    } else {
      conv.avatarMembers = [];
    }
    const { contact, roomMembers } = await RoomStore.getMemeberInfo(conv.jid, conv.curJid, conv.lastMessageSender);
    // if avatar members is empty, set the value
    if (!conv.avatarMembers || conv.avatarMembers.length === 0) {
      conv.avatarMembers = roomMembers.slice(0, 2);
    }
    // add last sender to avatar
    addToAvatarMembers(conv, contact);
    conv.name = convInDb && convInDb.name || conv.name // DC-581, DC-519
    await ConversationStore.saveConversations([conv]);
    return conv;
  }

  showNotification = async (payload) => {
    const shouldShow = await this.shouldShowNotification(payload);
    if (!shouldShow) {
      return;
    }
    const convjid = payload.from.bare;
    let msgFrom = payload.from.resource + '@im.edison.tech';
    let memberName = payload.appName;
    if (!memberName) {
      memberName = await RoomStore.getMemberName({ roomJid: payload.from.bare, curJid: payload.curJid, memberJid: msgFrom });
    }
    const contact = ContactStore.findContactByJid(msgFrom);
    const conv = await ConversationStore.getConversationByJid(convjid);
    let title = conv.name;
    const senderName = payload.appName || memberName || contact && contact.name;
    let body = payload.body;
    if (isJsonStr(body)) {
      body = JSON.parse(body);
    }
    body = body.content || payload.body;
    if (senderName) {
      body = senderName + ': ' + body;
    };
    const noti = postNotification(title, body);
    noti.addEventListener('click', (event) => {
      ChatActions.selectConversation(convjid);
      Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
      const window = remote.getCurrentWindow();
      window.show();
      ChatActions.selectConversation(conv.jid);
    });
  }

  shouldShowNotification = async (payload) => {
    const win = remote.getCurrentWindow();
    const focus = win.isFocused();
    if (focus) {
      return false;
    }
    let chatAccounts = AppEnv.config.get('chatAccounts') || {};
    const conv = await ConversationStore.getConversationByJid(payload.from.bare);
    const fromUserId = payload.from.resource;
    let isme = false;
    for (let email in chatAccounts) {
      const acc = chatAccounts[email];
      if (acc.userId === fromUserId) {
        isme = true;
        break;
      }
    }
    return conv && !conv.isHiddenNotification && !isme;
  }

  prepareForSaveMessage = async (payload, type) => {
    let timeSend;
    if (payload.body && !isJsonStr(payload.body)) {
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
    await this.saveMessages([message]);
  }

  saveMessagesAndRefresh = async messages => {
    await this.saveMessages(messages);
    if (this.conversationJid) {
      this.retrieveSelectedConversationMessages(this.conversationJid);
    }
    return messages;
  }

  saveMessages = async messages => {
    for (const msg of messages) {
      if (!msg.conversationJid) {
        console.error(`msg did not have conversationJid`, msg);
      }
      // update message id: uuid + conversationJid
      if (msg.id.indexOf(SEPARATOR) === -1) {
        msg.id += SEPARATOR + msg.conversationJid;
      }
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
        if (isJsonStr(messageInDb.body) && isJsonStr(msg.body)) {
          const dbBody = JSON.parse(messageInDb.body);
          let msgBody = JSON.parse(msg.body);
          if (msg.status === MESSAGE_STATUS_RECEIVED) {
            if (dbBody.localFile) {
              msgBody.localFile = dbBody.localFile;
            }
            if (dbBody.mediaObjectId) {
              msgBody.mediaObjectId = dbBody.mediaObjectId;
            }
          }
          msgBody = JSON.stringify(msgBody);
          messageInDb.body = msgBody;
        } else {
          messageInDb.body = msg.body;
        }
        if (msg.status) {
          messageInDb.status = msg.status;
        }
        await messageInDb.save();
      } else {
        await MessageModel.upsert(msg);
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

const getMessageContent = message => {
  let body = message.body;
  if (isJsonStr(body)) {
    body = JSON.parse(body);
  }
  if (typeof body === 'string') {
    return body;
  } else {
    return body.content;
  }
}

module.exports = new MessageStore();
