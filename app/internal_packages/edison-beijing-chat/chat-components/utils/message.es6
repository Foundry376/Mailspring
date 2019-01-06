import { isJsonStr } from './stringUtils';

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
      let lastMessage = messages[messages.length - 1];
      if (message.id != lastMessage.id) {
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
