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
  //this is only for  being used by safeUpdate
  const db = await getDb();
  if (doc.jid) {
    return await db.conversations.findOne().where('jid').eq(doc.jid).exec();
  } else {
    return await db.messages.findOne().where('id').eq(doc.id).exec();
  }
}

let updateCount = 0;
let tryMax = 3;
export async function safeUpdate(doc, data) {
  //this is only for conversations or messages
  updateCount++;
  try {
    const result = await doc.update({ $set: data });
    updateCount = 0;
    return result;
  } catch (e) {
    const error = new Error();
    if (updateCount == 1) {
      console.log('db error: data, doc, e, stack: ', data, doc, e, error.stack);
    }
    let doc2 = await getDoc(doc);
    let failed = false;
    for (let key in data) {
      if (data[key] != doc2[key]) {
        failed = true;
        break;
      }
    }
    if (failed) {
      if (updateCount < tryMax) {
        const result = await safeUpdate(doc, data);
        updateCount = 0;
        return result;
      } else {
        updateCount = 0;
        throw (e);
      }
    }
  }
}

let cacheForUpsert = {};
const debounceUpsert = _.debounce(async () => {
  const cache = Object.assign({}, cacheForUpsert);
  cacheForUpsert = {};
  for (const k in cache) {
    const item = cache[k];
    await item.doc.upsert(item.data);
  }
}, 30);

export async function safeUpsert(doc, data) {
  try {
    const docId = JSON.stringify(data);
    if (cacheForUpsert[docId]) {
      console.warn('******conlict data', data);
    }
    cacheForUpsert[docId] = { doc, data };
    await debounceUpsert();
  } catch (e) {
    const error = new Error();
    console.log('db error: data, e, stack: ', data, e, error.stack);
    if (e.status === 409 && e.name === 'conflict') {
      return;
    } else {
      throw (e);
    }
  }
}
