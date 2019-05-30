import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Conversations from './Conversations';
import ConversationsTopBar from './ConversationsTopBar';
import ProgressBar from '../../common/ProgressBar';
import chatModel from '../../../store/model';

let key = 0;
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
    chatModel.convPanel = this;
    const { retrieveAllConversations } = this.props;
    if (retrieveAllConversations) {
      retrieveAllConversations();
    }
  }

  update() {
    key++;
    const state = {key};
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
    const progressBarProps = chatModel.progressBarData;

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
        <ProgressBar {...progressBarProps}/>
      </div>
    );
  }
}
