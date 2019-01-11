import getDb from '../db/index';

export function copyRxdbContact(contact) {
  const result = {};
  result.jid = contact.jid;
  result.curJid = contact.curJid;
  result.name = contact.name;
  result.email = contact.email;
  result.avatar = contact.avatar;
  return result;
}

export function copyRxdbMessage(msg) {
  const result = {};
  result.id = msg.id;
  result.conversationJid = msg.conversationJid;
  result.sender = msg.sender;
  result.body = msg.body;
  result.sentTime = msg.sentTime;
  result.updateTime = msg.updateTime;
  result.readTime = msg.readTime;
  result.status = msg.status;
  return result;
}

export function copyRxdbConversation(conv) {
  const result = {};
  result.jid = conv.jid;
  result.curJid = conv.curJid;
  result.name = conv.name;
  result.avatar = conv.avatar;
  result.isGroup = conv.isGroup;
  result.at = conv.at;
  result.unreadMessages = conv.unreadMessages;
  result.occupants = conv.occupants;
  result.lastMessageTime = conv.lastMessageTime;
  result.lastMessageText = conv.lastMessageText;
  result.lastMessageSender = conv.lastMessageSender;
  return result;
}

export async function saveGroupMessages(groupedMessages) {
  const readTime = new Date().getTime();
  if (groupedMessages) {
    groupedMessages.reverse();
    for (const { messages } of groupedMessages) {
      messages.reverse();
      for (const msg of messages) {
        if (!msg.readTime) {
          await msg.update({
            $set: {
              readTime
            }
          })
        } else {
          return;
        }
      }
    }
  }
}

