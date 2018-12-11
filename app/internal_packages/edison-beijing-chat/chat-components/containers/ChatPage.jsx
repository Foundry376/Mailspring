import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { replace } from 'react-router-redux';
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
  replace,
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
}) => ({
  availableUsers,
  contacts,
  conversations,
  currentUserId: currentUser ? currentUser.bare : null,
  groupedMessages,
  referenceTime,
  selectedConversation,
});

const mapDispatchToProps = dispatch => bindActionCreators(actionCreators, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ChatPage);
