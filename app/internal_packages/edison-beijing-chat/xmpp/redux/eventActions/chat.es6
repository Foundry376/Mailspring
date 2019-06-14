import {
  receiveChat,
  receiveGroupchat,
  messageSent,
  membersChange,
} from '../../../chat-components/actions/chat';

import { RoomStore } from 'chat-exports';

export default {
  // chat: receiveChat,
  // groupchat: receiveGroupchat,
  'message:sent': messageSent,
};
