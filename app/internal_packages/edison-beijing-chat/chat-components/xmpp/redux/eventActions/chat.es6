import {
  receiveChat,
  receiveGroupchat,
  messageSent,
} from '../../../actions/chat';

export default {
  chat: receiveChat,
  groupchat: receiveGroupchat,
  'message:sent': messageSent,
};
