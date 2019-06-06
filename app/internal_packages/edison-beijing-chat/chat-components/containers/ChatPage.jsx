import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import ChatPage from '../components/chat/ChatPage';
import { setReferenceTime } from '../actions/time';
import { fetchRoster } from '../actions/contact';
import { retrieveContacts } from '../actions/db/contact';
import {
  // createGroupConversation,
  // createPrivateConversation,
  // deselectConversation,
  // selectConversation,
  // newConversation,
  // removeConversation,
  beginSendingMessage,
} from '../actions/chat';

const actionCreators = {
  fetchRoster,
  retrieveContacts,
  sendMessage: beginSendingMessage,
  setReferenceTime,
};

const mapStateToProps = ({
  auth: {
    currentUser,
    online,
    isAuthenticating
  },
  chat: {
    groupedMessages,
    // conversations,
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
    currentUserId: currentUser ? currentUser.bare : null,
    groupedMessages,
    referenceTime,
    selectedConversation,
    online,
    isAuthenticating
  }
};

const mapDispatchToProps = dispatch => bindActionCreators(actionCreators, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ChatPage);
