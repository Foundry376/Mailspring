import getDb from '../db/index';

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

export function saveGroupMessages(groupedMessages) {
  const readTime = new Date().getTime();
  getDb().then(db =>{
    groupedMessages.map(group => {
      group.messages.map((msg, idx) => {
        msg = copyRxdbMessage(msg);
        msg.readTime = readTime;
        db.messages.upsert(msg);
      })
    })
  })
}

