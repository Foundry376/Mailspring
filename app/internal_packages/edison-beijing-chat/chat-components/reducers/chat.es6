import {
  DESELECT_CONVERSATION,
  SELECT_CONVERSATION,
} from '../actions/chat';
import {
  UPDATE_SELECTED_CONVERSATION,
  UPDATE_CONVERSATIONS,
} from '../actions/db/conversation';
import {
  UPDATE_SELECTED_CONVERSATION_MESSAGES,
} from '../actions/db/message';


const initialState = {
  selectedConversation: null,
  conversations: [],
  groupedMessages: []
};

export default function chatReducer(state = initialState, { type, payload }) {
  switch (type) {
    case UPDATE_CONVERSATIONS:
      return Object.assign({}, state, { conversations: payload });
    case UPDATE_SELECTED_CONVERSATION:
      return Object.assign({}, state, { selectedConversation: payload });
    case DESELECT_CONVERSATION:
      return Object.assign({}, state, { selectedConversation: null, groupedMessages: [] });
    case SELECT_CONVERSATION:
      return Object.assign({}, state, { groupedMessages: [] });
    case UPDATE_SELECTED_CONVERSATION_MESSAGES:
      return Object.assign({}, state, { groupedMessages: payload });
    default:
      return state;
  }
}
