import getDb from '../db/index';

export function copyRxdbContact(contact) {
  const result = {};
  if (!contact) {
    return result
  }
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
        if (msg.updateTime && (!msg.readTime || msg.readTime < msg.updateTime)) {
          await safeUpdate(msg, { readTime });
        }
      }
    }
  }
}

async function getDoc(doc) {
  //this is only for  being used by saveUpdate
  const db = await getDb();
  if (doc.jid) {
    return await db.conversations.findOne(doc.jid).exec();
  } else {
    return await db.messages.findOne(doc.id).exec();
  }
}

let tryCount = 0;
let tryMax = 3;
export async function safeUpdate(doc, data) {
  //this is only for conversations or messages
  tryCount++;
  try {
    const result = await doc.update({ $set: data });
    tryCount = 0;
    return result;
  } catch (e) {
    const error = new Error();
    if (tryCount==1){
      console.log('db error: data, doc, e, stack: ', data, doc, e, error.stack);
    }
    let doc2 = await getDoc(doc);
    let failed = false;
    for (let key in data) {
      if (data[key] != doc2[key])  {
        failed = true;
        break;
      }
    }
    if (failed) {
      if(tryCount < tryMax) {
        const result = await safeUpdate(doc, data);
        tryCount = 0;
        return result;
      } else {
        throw(e);
      }
    }
  }
}

