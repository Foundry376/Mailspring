import React, { PureComponent } from 'react';
import { ChatActions, ConversationStore } from 'chat-exports';
import PropTypes from 'prop-types';
import ConversationItem from './ConversationItem';
import { WorkspaceStore, Actions } from 'mailspring-exports';
import ProgressBar from '../../common/ProgressBar';
export default class Conversations extends PureComponent {
  static propTypes = {
    // conversations: PropTypes.arrayOf(PropTypes.object).isRequired,
    // selectedIndex: PropTypes.number,
    // selectConversation: PropTypes.func.isRequired,
    referenceTime: PropTypes.number,
    // removeConversation: PropTypes.func
  };

  static defaultProps = {
    // selectedIndex: null,
    referenceTime: new Date().getTime(),
  }

  constructor(props) {
    super(props);
    this.state = {
      selectedConversation: null,
      conversations: null
    }
    this._listenToStore();
  }

  _listenToStore = () => {
    this._unsub = ConversationStore.listen(this._onDataChanged);
  }

  componentWillUnmount() {
    this._unsub();
  }

  _onDataChanged = async () => {
    const selectedConversation = await ConversationStore.getSelectedConversation();
    const conversations = await ConversationStore.getConversations();
    this.setState({
      selectedConversation,
      conversations
    });
  }

  render() {
    const {
      // conversations,
      // selectConversation,
      // selectedIndex,
      referenceTime,
      // removeConversation
    } = this.props;

    const { selectedConversation, conversations } = this.state;
    if (!conversations || conversations.length === 0) {
      return (
        <div className="noConversations">
        </div>
      )
    }

    return (
      <div onClick={() => Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView)}>
        {conversations.map(conv => (
          <ConversationItem
            key={conv.jid}
            selected={selectedConversation && selectedConversation.jid === conv.jid}
            conversation={conv}
            referenceTime={referenceTime}
            onClick={() => ChatActions.selectConversation(conv.jid)}
          />
        ))}
      </div>
    );
  }
}
