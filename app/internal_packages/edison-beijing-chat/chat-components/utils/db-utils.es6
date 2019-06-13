import getDb from '../db/index';
import _ from 'underscore';

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

const docName2key = {
  messages: 'id',
  contacts: 'jid',
  configs: 'key',
  conversations: 'jid',
  e2ees: 'jid',
  rooms: 'jid'
}
async function getDoc(doc) {
  //this is only for  being used by safeUpdate
  const db = await getDb();
  if (doc.jid) {
    return await db.conversations.findOne({ where: { jid: doc.jid } });
  } else {
    return await db.messages.findOne({ where: { id: doc.id } });
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
    if (tryCount === 1) {
      const error = new Error();
      console.log('safeUpdate error: data, doc, e, stack: ', data, doc, e, error.stack);
    }
    let doc2 = await getDoc(doc);
    let failed = false;
    if (data && doc2) {
      for (let key in data) {
        if (data[key] != doc2[key]) {
          failed = true;
          break;
        }
      }
    } else {
      const error = new Error();
      console.log('safeUpdate error data is null or getDoc return null: data, doc, e, stack: ', data, doc, e, error.stack);
      failed = true;
    }
    if (failed) {
      if (tryCount < tryMax) {
        const result = await safeUpdate(doc, data);
        tryCount = 0;
        return result;
      } else {
        tryCount = 0;
        throw (e);
      }
    }
  }
}

export async function safeUpsert(doc, data) {
  tryCount++;
  let docinDB;
  const db = await getDb();
  const key = docName2key[doc.name];
  const keyValue = data[key];
  try {
    docinDB = await db[doc.name].findOne({ where: { [key]: keyValue } });
    if (docinDB) {
      await docinDB.updateAttributes(data)
      return docinDB;
    } else {
      return await doc.create(data)
    }
    tryCount = 0;
  } catch (e) {
    if (tryCount === 1) {
      const error = new Error();
      console.log('safeUpsert error: data, doc, e, stack: ', data, doc, e, error.stack);
    }
    let doc2 = await db[doc.name].findOne({ where: { [key]: keyValue } });
    let failed = false;
    if (doc2 && data) {
      for (let key in data) {
        if (data[key] != doc2[key]) {
          failed = true;
          break;
        }
      }
    } else {
      const error = new Error();
      console.log('safeUpsert error no doc2 or data: data, doc, e, stack: ', data, doc, e, error.stack);
      failed = true;
    }
    if (failed) {
      if (tryCount < tryMax) {
        const result = await safeUpsert(doc, data);
        tryCount = 0;
        return result;
      } else {
        tryCount = 0;
        throw (e);
      }
    }
  }
  tryCount = 0;
}
