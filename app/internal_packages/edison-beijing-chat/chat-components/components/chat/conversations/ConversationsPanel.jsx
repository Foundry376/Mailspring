import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Conversations from './Conversations';
import ConversationsTopBar from './ConversationsTopBar';

export default class ConversationsPanel extends PureComponent {
  static propTypes = {
    retrieveAllConversations: PropTypes.func.isRequired,
    selectConversation: PropTypes.func.isRequired,
    conversations: PropTypes.arrayOf(PropTypes.object).isRequired,
    selectedConversationJid: PropTypes.string,
    referenceTime: PropTypes.number,
    removeConversation: PropTypes.func
  };

  static defaultProps = {
    selectedConversationJid: null,
    referenceTime: new Date().getTime(),
  }

  componentDidMount() {
    const { retrieveAllConversations } = this.props;
    if (retrieveAllConversations) {
      retrieveAllConversations();
    }
  }

  render() {
    const {
      selectConversation,
      newConversation,
      conversations,
      selectedConversationJid,
      referenceTime,
      removeConversation
    } = this.props;
    const selectedIndex = conversations.map(conv => conv.jid)
      .indexOf(selectedConversationJid);

    const conversationsProps = {
      selectConversation,
      conversations,
      selectedIndex,
      referenceTime,
      removeConversation
    };

    return (
      <div className="panel">
        <ConversationsTopBar newConversation={newConversation} />
        <div className="conversations">
          {conversations.length ?
            <Conversations {...conversationsProps} /> :
            <div className="noConversations">
            </div>
          }
        </div>
      </div>
    );
  }
}
