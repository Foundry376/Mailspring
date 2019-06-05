import {
  receiveChat,
  receiveGroupchat,
  messageSent,
  membersChange,
} from '../../../actions/chat';

export default {
  // chat: receiveChat,
  // groupchat: receiveGroupchat,
  'message:sent': messageSent,
  memberschange: membersChange,
};
