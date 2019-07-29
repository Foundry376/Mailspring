import MailspringStore from 'mailspring-store';
import { Actions, WorkspaceStore } from 'mailspring-exports';
import {
  ChatActions,
  RoomStore,
  ConversationStore,
  ContactStore,
  FailMessageStore,
} from 'chat-exports';
import { decrypte } from '../utils/rsa';
import { decryptByAES } from '../utils/aes';
import { downloadFile } from '../utils/awss3';
import { isJsonStr } from '../utils/stringUtils';
import { groupMessagesByTime, addMessagesSenderNickname, parseMessageBody } from '../utils/message';
import ConversationModel from '../model/Conversation';
import MessageModel, { MESSAGE_STATUS_RECEIVED } from '../model/Message';
import fs from 'fs';
import _ from 'underscore';
import { getPriKey, getDeviceId } from '../utils/e2ee';
const { remote } = require('electron');
import { postNotification } from '../utils/electron';
import { FILE_TYPE, isImage } from '../utils/filetypes';

export const RECEIVE_GROUPCHAT = 'RECEIVE_GROUPCHAT';
export const RECEIVE_PRIVATECHAT = 'RECEIVE_PRIVATECHAT';

class MessageStore extends MailspringStore {
  constructor() {
    super();
    this.groupedMessages = [];
    this.conversationJid;
    this._registerListeners();
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
  }

  _registerListeners() { }
  getMessageById = async (id, conversationJid) => {
    return await MessageModel.findOne({
      where: {
        id,
        conversationJid,
      },
    });
  };

  getGroupedMessages = () => {
    return this.groupedMessages;
  };

  receivePrivateChat = async message => {
    let jidLocal = message.curJid.split('@')[0];
    message = await this.decrypteBody(message, jidLocal);
    if (!message || (await this._isExistInDb(message, false))) {
      return;
    }

    await this.prepareForSaveMessage(message, RECEIVE_PRIVATECHAT);
    const conv = await this.processPrivateMessage(message);
    if (!conv) {
      return;
    }
    if (conv.jid === this.conversationJid) {
      this.retrieveSelectedConversationMessages(conv.jid);
    }
    this.showNotification(message);
  };

  receiveGroupChat = async message => {
    let jidLocal = message.curJid.split('@')[0];
    message = await this.decrypteBody(message, jidLocal);
    if (!message || (await this._isExistInDb(message, true))) {
      return;
    }

    await this.prepareForSaveMessage(message, RECEIVE_GROUPCHAT);
    const conv = await this.processGroupMessage(message);
    if (!conv) {
      return;
    }
    if (conv.jid === this.conversationJid) {
      this.retrieveSelectedConversationMessages(conv.jid);
    }
    this.showNotification(message);
  };

  removeMessagesByConversationJid = async jid => {
    await MessageModel.destroy({
      where: {
        conversationJid: jid,
      },
    });
    if (this.conversationJid === jid) {
      this.groupedMessages = [];
      this._triggerDebounced();
    }
  };

  removeMessageById = async (id, convJid) => {
    if (!convJid) {
      convJid = this.conversationJid;
    }
    await MessageModel.destroy({ where: { id, conversationJid: convJid } });
    if (convJid === this.conversationJid) {
      await this.retrieveSelectedConversationMessages(convJid);
    }
  };

  processPrivateMessage = async payload => {
    let name;
    let jid;
    if (payload.from.bare === payload.curJid) {
      jid = payload.to.bare;
      name = null;
    } else {
      jid = payload.from.bare;
      name = payload.from.local;
    }
    const refreshConv = await this.getRefreshConv(jid);
    const contact = await ContactStore.findContactByJid(jid);
    const coversation = {
      jid,
      curJid: payload.curJid,
      name: contact ? contact.name : name,
      isGroup: false,
      unreadMessages: refreshConv.unreadMessages,
      lastMessageTime: refreshConv.lastMessageTime || parseInt(payload.ts),
      lastMessageText: refreshConv.lastMessageText || getMessageContent(payload),
      lastMessageSender: refreshConv.sender || payload.from.bare,
      at: false,
    };

    await ConversationStore.saveConversations([coversation]);
    return coversation;
  };

  decrypteBody = async (message, jidLocal) => {
    const { deviceId, prikey } = await getPriKey();
    let bodyStr = message.body;
    let aes;
    if (message.payload) {
      let keys = message.keys;
      if (keys && keys[jidLocal] && keys[jidLocal][deviceId]) {
        let text = keys[jidLocal][deviceId];
        if (text) {
          aes = decrypte(text, prikey); //window.localStorage.priKey);
          if (aes) {
            bodyStr = decryptByAES(aes, message.payload);
            try {
              const bodyStrToJson = JSON.parse(bodyStr);
              bodyStr = JSON.stringify({ ...bodyStrToJson, aes });
            } catch (err) {
              console.error('decrypteBody error:', e, bodyStr);
              return;
            }
          }
        }
      }
    }
    if (!bodyStr) {
      return;
    }
    const bodyJson = this.downloadAndTagImageFileInMessage({
      id: message.id,
      conversationJid: message.from.bare,
      body: bodyStr,
    });
    if (!bodyJson) {
      return;
    }

    if (message.appJid) {
      bodyJson.appJid = message.appJid;
      bodyJson.appName = message.appName;
      bodyJson.htmlBody = message.htmlBody;
      bodyJson.ctxCmds = message.ctxCmds;
    }
    message.body = JSON.stringify(bodyJson);

    return message;
  };

  _isExistInDb = async (message, isGroup) => {
    let convJid = message.from.bare;
    // if private chat
    if (!isGroup) {
      if (message.curJid === message.from.bare) {
        convJid = message.to.bare;
      } else {
        convJid = message.from.bare;
      }
    }
    const messageInDb = await this.getMessageById(message.id, convJid);
    if (messageInDb) {
      // if already exist in db, skip it
      if (messageInDb.body === message.body) {
        return true;
      }
    }
    return false;
  };

  downloadAndTagImageFileInMessage = message => {
    let msgBody;
    try {
      msgBody = JSON.parse(message.body);
    } catch (e) {
      console.error('downloadAndTagImageFileInMessage error:', e, message.body);
      return;
    }

    msgBody.path = generateMsgPath(msgBody);

    const aes = msgBody.aes || null;
    if (aes) {
      msgBody.aes = aes;
    }

    if (
      isImage(msgBody.type) &&
      msgBody.mediaObjectId &&
      !msgBody.mediaObjectId.match(/^https?:\/\//)
    ) {
      // 原图路径
      const originalPath = msgBody.path && msgBody.path.replace('file://', '');
      // 缩略图路径
      const thumbPath = originalPath && originalPath.replace('/download/', '/download/thumbnail-');
      msgBody.downloading = true;
      message.body = JSON.stringify(msgBody);
      this.saveMessagesAndRefresh([message]);
      const downloadResult = [];

      const testDownloadSuccess = () => {
        msgBody.downloading = false;
        // downloadResult不为空就代表成功了
        if (downloadResult.length) {
          message.body = JSON.stringify(msgBody);
          message.status = 'MESSAGE_STATUS_RECEIVED';
          // 优先使用缩略图
          ChatActions.updateDownload(downloadResult[0]);
        } else {
          msgBody.content = `the file ${name} failed to be downloaded`;
          message.body = JSON.stringify(msgBody);
          message.status = 'MESSAGE_STATUS_TRANSFER_FAILED';
          ChatActions.updateDownload(msgBody.mediaObjectId);
        }
        this.saveMessagesAndRefresh([message]);
      };

      if (msgBody.thumbObjectId) {
        downloadFile(aes, msgBody.thumbObjectId, thumbPath, err => {
          // 成功就往结果中推入ObjectId
          if (!err && fs.existsSync(thumbPath)) {
            downloadResult.push(msgBody.thumbObjectId);
            // 缩略图下载成功就算成功
            testDownloadSuccess();
            downloadFile(aes, msgBody.mediaObjectId, originalPath, err => {
              downloadResult.push(msgBody.mediaObjectId);
            });
          } else {
            // 缩略图下载失败，原图下载成功才算成功
            downloadFile(aes, msgBody.mediaObjectId, originalPath, err => {
              if (!err && fs.existsSync(originalPath)) {
                downloadResult.push(msgBody.mediaObjectId);
              }
              testDownloadSuccess();
            });
          }
        });
      } else {
        downloadFile(aes, msgBody.mediaObjectId, originalPath, err => {
          if (!err && fs.existsSync(originalPath)) {
            downloadResult.push(msgBody.mediaObjectId);
          }
          testDownloadSuccess();
        });
      }
    }

    return msgBody;
  };

  retrieveSelectedConversationMessages = async (jid, limit, offset) => {
    const condistion = {
      where: {
        conversationJid: jid,
      },
      order: [['sentTime', 'ASC']],
    };
    if (limit) {
      condistion.limit = limit;
    }
    if (offset) {
      condistion.offset = offset;
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
    });
    addMessagesSenderNickname(messages);
    this.groupedMessages = groupMessagesByTime(messages, 'sentTime', 'day');
    this.conversationJid = jid;
    this._triggerDebounced();
  };

  processGroupMessage = async payload => {
    const body = parseMessageBody(payload.body);
    const at = !body.atJids || body.atJids.indexOf(payload.curJid) === -1 ? false : true;

    let name = payload.from.local;
    // get the room name and whether you are '@'
    const rooms = await RoomStore.getRooms();
    if (rooms && rooms[payload.from.bare] && rooms[payload.from.bare].name) {
      name = rooms[payload.from.bare].name;
    } else {
      let items = [];
      const roomsInfo = await xmpp.getRoomList(null, payload.curJid);
      if (roomsInfo) {
        RoomStore.saveRooms(roomsInfo);
        items = roomsInfo.discoItems ? roomsInfo.discoItems.items : [];
      }

      if (items && items.length) {
        for (const item of items) {
          if (payload.from.local === item.jid.local) {
            name = item.name;
            break;
          }
        }
      }
    }
    const refreshConv = await this.getRefreshConv(payload.from.bare);
    let conv = {
      jid: payload.from.bare,
      curJid: payload.curJid,
      name: refreshConv.name || name, // DC-581, DC-519,
      isGroup: true,
      avatarMembers: refreshConv.avatarMembers || [],
      unreadMessages: refreshConv.unreadMessages,
      lastMessageTime: refreshConv.lastMessageTime || parseInt(payload.ts),
      lastMessageText: refreshConv.lastMessageText || getMessageContent(payload),
      lastMessageSender: refreshConv.sender || payload.from.resource + '@im.edison.tech',
      at,
    };

    // if conversation's curJid is not equal to payload's curJid, skip it.
    if (refreshConv.curJid && refreshConv.curJid !== payload.curJid) {
      return;
    }

    const { contact, roomMembers } = await RoomStore.getMemeberInfo(
      conv.jid,
      conv.curJid,
      conv.lastMessageSender
    );
    // if avatar members is empty, set the value
    if (!conv.avatarMembers || conv.avatarMembers.length === 0) {
      conv.avatarMembers = roomMembers.slice(0, 2);
    }
    // add last sender to avatar
    addToAvatarMembers(conv, contact);

    // conv name fallback
    if (!conv.name) {
      const contactNameList = roomMembers
        .filter(member => {
          const memberJid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
          return memberJid !== payload.curJid;
        })
        .map(member => member.name || member.email);
      const fallbackName =
        contactNameList.length > 4
          ? contactNameList.slice(0, 3).join(', ') + ' & ' + `${contactNameList.length - 3} others`
          : contactNameList.slice(0, contactNameList.length - 1).join(', ') +
          ' & ' +
          contactNameList[contactNameList.length - 1];
      conv.name = fallbackName;
    }
    await ConversationStore.saveConversations([conv]);
    return conv;
  };

  showNotification = async payload => {
    const shouldShow = await this.shouldShowNotification(payload);
    if (!shouldShow) {
      return;
    }
    const convjid = payload.from.bare;
    let msgFrom = payload.from.resource + '@im.edison.tech';
    let memberName = payload.appName;
    if (!memberName) {
      memberName = await RoomStore.getMemberName({
        roomJid: payload.from.bare,
        curJid: payload.curJid,
        memberJid: msgFrom,
      });
    }
    const contact = ContactStore.findContactByJid(msgFrom);
    const conv = await ConversationStore.getConversationByJid(convjid);
    let title = conv.name;
    const senderName = payload.appName || memberName || (contact && contact.name);
    let body = payload.body;
    if (isJsonStr(body)) {
      body = JSON.parse(body);
    }
    body = body.content || payload.body;
    if (senderName) {
      body = senderName + ': ' + body;
    }
    const noti = postNotification(title, body);
    noti.addEventListener('click', event => {
      ChatActions.selectConversation(convjid);
      Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
      const window = remote.getCurrentWindow();
      window.show();
      ChatActions.selectConversation(conv.jid);
    });
  };

  _isWindowFocused = () => {
    const win = remote.getCurrentWindow();
    const focus = win.isFocused();
    return focus;
  };

  shouldShowNotification = async payload => {
    if (this._isWindowFocused()) {
      return false;
    }
    // update and delete dont notice
    if (
      (payload.body && payload.body.indexOf('"deleted":true') >= 0) ||
      (payload.body && payload.body.indexOf('"updating":true') >= 0)
    ) {
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
  };

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
      conversationJid = payload.to.bare;
    } else {
      conversationJid = payload.from.bare;
    }
    const message = {
      id: payload.id,
      conversationJid,
      sender: sender,
      body: payload.body,
      sentTime: new Date(timeSend).getTime(),
      status: MESSAGE_STATUS_RECEIVED,
      ts: payload.ts,
      curJid: payload.curJid,
    };
    await this.saveMessages([message]);
  };

  saveMessagesAndRefresh = async messages => {
    await this.saveMessages(messages);
    if (this.conversationJid) {
      this.retrieveSelectedConversationMessages(this.conversationJid);
    }
    return messages;
  };

  saveMessages = async messages => {
    for (const msg of messages) {
      if (!msg.conversationJid) {
        console.error(`msg did not have conversationJid`, msg);
        msg.conversationJid = this.conversationJid;
      }

      const messageInDb = await MessageModel.findOne({
        where: {
          id: msg.id,
          conversationJid: msg.conversationJid,
        },
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
      if (msg.status !== 'MESSAGE_STATUS_SENDING') {
        return;
      }
      setTimeout(async () => {
        const messageInDb = await MessageModel.findOne({
          where: {
            id: msg.id,
            conversationJid: msg.conversationJid,
          },
        });
        if (messageInDb && messageInDb.status === 'MESSAGE_STATUS_SENDING') {
          messageInDb.status = 'MESSAGE_STATUS_TRANSFER_FAILED';
          this.saveMessagesAndRefresh([messageInDb.get({ plain: true })]);
          const convJid = msg.conversationJid;
          const conv = ConversationStore.selectedConversation;
          if (convJid !== (conv && conv.jid)) {
            FailMessageStore.setMsg(msg);
          }
        }
      }, 5000);
    }
  };

  getRefreshConv = async jid => {
    let refreshConv = {
      curJid: null,
      name: null,
      unreadMessages: 0,
      sender: null,
      lastMessageTime: null,
      lastMessageText: '',
      avatarMembers: [],
    };
    const convInDb = await ConversationStore.getConversationByJid(jid);
    const selectedConversation = await ConversationStore.getSelectedConversation();

    if (!selectedConversation || selectedConversation.jid !== jid || !this._isWindowFocused()) {
      refreshConv.unreadMessages = convInDb ? convInDb.unreadMessages + 1 : 1;
    }

    if (convInDb) {
      refreshConv.avatarMembers = convInDb.avatarMembers || [];
      refreshConv.curJid = convInDb.curJid;
      refreshConv.name = convInDb.name;
    }

    const lastMessage = await MessageModel.findOne({
      where: {
        conversationJid: jid,
      },
      order: [['sentTime', 'DESC']],
    });
    if (lastMessage) {
      let lastMessageText = getMessageContent(lastMessage);
      if (lastMessage.body.indexOf('"deleted":true') >= 0) {
        lastMessageText = '';
      }
      refreshConv.sender = lastMessage.sender;
      refreshConv.lastMessageTime = lastMessage.sentTime;
      refreshConv.lastMessageText = lastMessageText;
    }

    return refreshConv;
  };
}

// 根据msgbody生成msg.path
const generateMsgPath = msgBody => {
  if (msgBody.mediaObjectId && msgBody.mediaObjectId.match(/^https?:\/\//)) {
    return msgBody.mediaObjectId;
  } else if (msgBody.type && msgBody.type !== FILE_TYPE.TEXT) {
    let name = msgBody.mediaObjectId || '';
    if (name && name.indexOf('/') !== -1) {
      name = name.substr(name.lastIndexOf('/') + 1);
    }
    name = (name && name.replace(/\.encrypted$/, '')) || '';
    let path = AppEnv.getConfigDirPath();
    let downpath = path + '/download/';
    if (!fs.existsSync(downpath)) {
      fs.mkdirSync(downpath);
    }
    return `file://${downpath}${name}`;
  }
  return '';
};

// TODO
// 这里为什么要加上阅读时间
const saveGroupMessages = async groupedMessages => {
  const readTime = new Date().getTime();
  if (groupedMessages) {
    groupedMessages.reverse();
    for (const { messages } of groupedMessages) {
      messages.reverse();
      for (const msg of messages) {
        if (msg.updateTime && (!msg.readTime || msg.readTime < msg.updateTime)) {
          ConversationModel.update(
            { readTime },
            {
              where: {
                id: msg.id,
              },
            }
          );
        }
      }
    }
  }
};

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
};

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
};

module.exports = new MessageStore();
