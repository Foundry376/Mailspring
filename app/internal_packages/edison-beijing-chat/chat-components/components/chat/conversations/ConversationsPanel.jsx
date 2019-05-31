import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Conversations from './Conversations';
import ConversationsTopBar from './ConversationsTopBar';
import ProgressBar from '../../common/ProgressBar';
import { ProgressBarStore } from 'chat-exports';

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

  state = {progress:{}}

  componentDidMount() {
    this.unsubscribers = [];
    this.unsubscribers.push(ProgressBarStore.listen(this.onProgressChange));

    const { retrieveAllConversations } = this.props;
    if (retrieveAllConversations) {
      retrieveAllConversations();
    }
  }

  componentWillUnmount() {
    return this.unsubscribers.map(unsubscribe => unsubscribe());
  }

  onProgressChange = () => {
    let { progress, props } = ProgressBarStore;
    progress = Object.assign({}, progress);
    const state = Object.assign({}, this.state, { progress }, props);
    console.log('ConversationsPanel.onProgressChange: state: ', state, props);
    this.setState(state);
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
    const { progress, onCancel, onRetry } = this.state;

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
        <ProgressBar progress = { progress } onCancel={onCancel} onRetry={onRetry}/>
      </div>
    );
  }
}
