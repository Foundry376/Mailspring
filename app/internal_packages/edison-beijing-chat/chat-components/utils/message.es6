import { isJsonStr } from './stringUtils';
import { copyRxdbMessage } from './db-utils';
import groupByTime from 'group-by-time';

import getDb from '../db';

export const groupMessages = async messages => {
  const groupedMessages = [];
  const createGroup = message => ({
    sender: message.sender,
    messages: [message]
  });
  messages.forEach((message, index) => {
    const lastIndex = groupedMessages.length - 1;
    if (index === 0 || groupedMessages[lastIndex].sender !== message.sender) {
      groupedMessages.push(createGroup(message));
    } else {
      groupedMessages[lastIndex].messages.push(message);
    }
  });

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

export const getLastMessageInfo = async (message) => {
  let body, lastMessageText, sender = null, lastMessageTime = (new Date()).getTime();
  body = message.body;
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
        lastMessageTime = lastMessage.sendTime || lastMessageTime;
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
    msg = copyRxdbMessage(msg);
    let body = msg.body;
    body = JSON.parse(body);
    body.deleted = true;
    body = JSON.stringify(body);
    msg.body = body;
    db.messages.upsert(msg);
  }
}

