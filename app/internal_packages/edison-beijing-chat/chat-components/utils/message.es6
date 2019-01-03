import { isJsonStr } from './stringUtils';

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

export const getLastMessageText = message => {
  console.log('cxm*** getLastMessageText: ', message);
  debugger;
  let body, content;
  if (isJsonStr(message)) {
    message = JSON.parse(message);
  }
  body = message.body || message;
  if (isJsonStr(body)) {
    body = JSON.parse(body);
  }
  if (typeof body === 'string') {
    content = body;
  } else if (body.deleted) {
    content = 'A message was deleted';
  } else {
    content = body.content;
  }
  return content;
}
