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
