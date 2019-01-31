import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import ChatPage from '../components/chat/ChatPage';
import { setReferenceTime } from '../actions/time';
import { fetchRoster } from '../actions/contact';
import { retrieveContacts } from '../actions/db/contact';
import {
  createGroupConversation,
  createPrivateConversation,
  deselectConversation,
  selectConversation,
  newConversation,
  removeConversation,
  beginSendingMessage,
} from '../actions/chat';
import {
  retrieveAllConversations,
} from '../actions/db/conversation';

const actionCreators = {
  createGroupConversation,
  createPrivateConversation,
  fetchRoster,
  retrieveAllConversations,
  retrieveContacts,
  deselectConversation,
  selectConversation,
  newConversation,
  removeConversation,
  sendMessage: beginSendingMessage,
  setReferenceTime,
};

const mapStateToProps = ({
  auth: {
    currentUser,
    online
  },
  chat: {
    groupedMessages,
    conversations,
    selectedConversation,
  },
  contact: {
    availableUsers,
    contacts,
  },
  time: referenceTime,
}) => {
  return {
    availableUsers,
      contacts,
      conversations,
      currentUserId: currentUser ? currentUser.bare : null,
    groupedMessages,
    referenceTime,
    selectedConversation,
    online
  }
};

const mapDispatchToProps = dispatch => bindActionCreators(actionCreators, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ChatPage);
