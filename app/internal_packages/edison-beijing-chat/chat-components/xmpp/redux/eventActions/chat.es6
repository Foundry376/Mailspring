import {
  receiveChat,
  receiveGroupchat,
  messageSent,
  membersChange,
} from '../../../actions/chat';

import { RoomStore } from 'chat-exports';

export default {
  // chat: receiveChat,
  // groupchat: receiveGroupchat,
  'message:sent': messageSent,
};
