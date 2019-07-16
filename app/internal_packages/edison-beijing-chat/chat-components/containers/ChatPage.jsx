import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import ChatPage from '../components/chat/ChatPage';
import { setReferenceTime } from '../actions/time';
import {
  beginSendingMessage,
} from '../actions/chat';

const actionCreators = {
  sendMessage: beginSendingMessage,
  setReferenceTime,
};

const mapStateToProps = ({
  auth: {
    currentUser,
    online,
    isAuthenticating
  },
  time: referenceTime,
}) => {
  return {
    currentUserId: currentUser ? currentUser.bare : null,
    referenceTime,
    online,
    isAuthenticating
  }
};

const mapDispatchToProps = dispatch => bindActionCreators(actionCreators, dispatch);

export default ChatPage;
