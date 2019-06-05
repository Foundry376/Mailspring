import { isImageFilePath, isJsonStr } from './stringUtils';
import { copyRxdbMessage, safeUpsert } from './db-utils';
import groupByTime from 'group-by-time';

import getDb from '../db';
import chatModel from '../store/model';
import path from "path";
import fs from "fs";
import uuid from 'uuid/v4';
import { FILE_TYPE } from '../components/chat/messages/messageModel';
import { uploadFile } from './awss3';
import { MESSAGE_STATUS_UPLOAD_FAILED } from '../db/schemas/message';
import { beginStoringMessage } from '../actions/db/message';
import { updateSelectedConversation } from '../actions/db/conversation';
import { ProgressBarStore } from 'chat-exports';

var thumb = require('node-thumbnail').thumb;

export const groupMessages = async messages => {
  const groupedMessages = [];
  const createGroup = message => ({
    sender: message.sender,
    messages: [message]
  });
  const db = await getDb();
  for (let index = 0; index < messages.length; index++) {
    let message = messages[index];
    const lastIndex = groupedMessages.length - 1;
    if (index === 0 || groupedMessages[lastIndex].sender !== message.sender) {
      groupedMessages.push(createGroup(message));
    } else {
      groupedMessages[lastIndex].messages.push(message);
    }
  };

  return groupedMessages;
}

/* kind: day, week, month */
export const groupMessagesByTime = async (messages, key, kind) => {
  var groupedByDay = groupByTime(messages, key, kind);
  const groupedMessages = []
  if (groupedByDay) {
    for (const time in groupedByDay) {
      groupedMessages.push({ time, messages: groupedByDay[time] })
    }
  }
  return groupedMessages;
}

export const addMessagesSenderNickname = async (messages) => {
  const nicknames = chatModel.chatStorage.nicknames;
  for (let message of messages){
    message.senderNickname = nicknames[message.sender];
  }
}

export const getLastMessageInfo = async (message) => {
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
    let db = await getDb();
    if (!conv) {
      conv = await db.conversations.findOne().where('jid').eq(message.from.bare).exec();
      if (!conv) {
        lastMessageText = getMessageContent(message);
        return { sender, lastMessageTime, lastMessageText };
      }
    }
    let messages = await db.messages.find().where('conversationJid').eq(conv.jid).exec();

    if (messages.length) {
      messages.sort((a, b) => a.sentTime - b.sentTime);
      const lastMessage = messages[messages.length - 1];
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

export const parseMessageBody = (body) => {
  if (isJsonStr(body)) {
    return JSON.parse(body);
  }
  if (typeof body === 'string') {
    return body;
  }
}

export const clearMessages = async (conversation) => {
  const db = await getDb();
  let msg = await db.messages.findOne().where('conversationJid').eq(conversation.jid).exec();
  if (msg) {
    await db.messages.find().where('conversationJid').eq(conversation.jid).remove();
  }
}

export const sendFileMessage = (file, index, reactInstance, messageBody) => {
  let { progress } = ProgressBarStore;
  let { loading} = progress;
  if (loading) {
    const loadConfig = progress.loadConfig;
    const loadText = loadConfig.type==='upload'? 'An upload' : ' A download';
    window.alert(`${loadText} is processing, please wait it to be finished!`);
    return;
  }

  const props = reactInstance.props;
  const conversation = props.selectedConversation;
  const onMessageSubmitted = props.onMessageSubmitted || props.sendMessage;
  const queueLoadMessage = reactInstance.queueLoadMessage || props.queueLoadMessage;
  let filepath;
  if (typeof file === 'object') {
    // the file is an description to an email attachment
    let id = file.id;
    let configDirPath = AppEnv.getConfigDirPath();
    filepath = path.join(configDirPath, 'files', id.slice(0, 2), id.slice(2, 4), id, file.filename);
    if (!fs.existsSync(filepath)) {
      alert(`the selected file to be sent is not downloaded  to this computer: ${filepath}, ${file.id}, ${file.filename}`);
      return;
    }
  } else {
    // the file is selected from the local file system
    filepath = file;
  }
  const isdir = fs.lstatSync(filepath).isDirectory();
  if (isdir) {
    window.alert('Not support to send folder.');
    return;
  }
  let messageId, updating = false;
  if (chatModel.editingMessageId) {
    messageId = chatModel.editingMessageId;
    updating = true;
    chatModel.editingMessageId = null;
  } else {
    messageId = uuid();
  }
  let message;
  if (index === 0) {
    message = messageBody.trim();
  } else {
    message = '📄';
  }
  let body = {
    type: FILE_TYPE.TEXT,
    timeSend: new Date().getTime(),
    isUploading: true,
    content: 'sending...',
    email: conversation.email,
    name: conversation.name,
    mediaObjectId: '',
    localFile: filepath,
    updating
  };
  if (file !== filepath) {
    body.emailSubject = file.subject;
    body.emailMessageId = file.messageId;
  }
  onMessageSubmitted(conversation, JSON.stringify(body), messageId, true);
  if (!isImageFilePath(filepath)){
    const loadConfig = {
      conversation,
      messageId,
      msgBody: body,
      filepath,
      type:'upload',
    }
    queueLoadMessage(loadConfig);
  } else {
    const atIndex = conversation.jid.indexOf('@')
    let jidLocal = conversation.jid.slice(0, atIndex);
    uploadFile(jidLocal, null, filepath, (err, filename, myKey, size) => {
      const sendUploadMessage = thumbKey => {
        body.localFile = filepath;
        body.isUploading = false;
        body.content = message || " ";
        body.mediaObjectId = myKey;
        if (thumbKey){
          body.thumbObjectId = thumbKey;
        }
        body.occupants = reactInstance.state.occupants || [];
        body.atJids = reactInstance.getAtTargetPersons && reactInstance.getAtTargetPersons() || [];
        body = JSON.stringify(body);
        if (err) {
          console.error(`${conversation.name}:\nfile(${filepath}) transfer failed because error: ${err}`);
          const message = {
            id: messageId,
            conversationJid: conversation.jid,
            body,
            sender: conversation.curJid,
            sentTime: (new Date()).getTime() + chatModel.diffTime,
            status: MESSAGE_STATUS_UPLOAD_FAILED,
          };
          chatModel.store.dispatch(beginStoringMessage(message));
          chatModel.store.dispatch(updateSelectedConversation(conversation));
          return;
        } else {
          onMessageSubmitted(conversation, body, messageId, false);
        }
      }
      if (filename.match(/.gif$/)) {
        body.type = FILE_TYPE.GIF;
        sendUploadMessage(null);
      } else {
        body.type = FILE_TYPE.IMAGE;
        let thumbPath = path.join(path.dirname(filepath), path.basename(filepath).replace(/\.\w*$/, '_thumb')+path.extname(filepath));
        thumb({
          source: filepath,
          destination: path.dirname(filepath)
        }, function(files, err, stdout, stderr) {
          const thumbExist = fs.existsSync(thumbPath);
          if (thumbExist) {
            uploadFile(jidLocal, null, thumbPath, (err, filename, thumbKey, size) => {
              sendUploadMessage(thumbKey);
              fs.unlinkSync(thumbPath);
            });
          } else {
            sendUploadMessage(null);
          }
        });
      }
    });
  }
}


