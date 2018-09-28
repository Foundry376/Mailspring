import React, { PureComponent } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import Conversations from './Conversations';
import ConversationsTopBar from './ConversationsTopBar';
import Button from '../../common/Button';
import Divider from '../../common/Divider';

export default class ConversationsPanel extends PureComponent {
  static propTypes = {
    retrieveAllConversations: PropTypes.func.isRequired,
    selectConversation: PropTypes.func.isRequired,
    conversations: PropTypes.arrayOf(PropTypes.object).isRequired,
    selectedConversationJid: PropTypes.string,
    referenceTime: PropTypes.number,
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
      conversations,
      selectedConversationJid,
      referenceTime,
    } = this.props;
    const selectedIndex = conversations.map(conv => conv.jid)
      .indexOf(selectedConversationJid);

    const conversationsProps = {
      selectConversation,
      conversations,
      selectedIndex,
      referenceTime,
    };

    return (
      <div className="panel">
        <ConversationsTopBar />
        <Divider type="horizontal" />
        <div className="conversations">
          {conversations.length ?
            <Conversations {...conversationsProps} /> :
            <div className="noConversations">
              <div>It looks like you are new here</div>
              <Link to="/chat/new">
                <Button>
                  <span className="newPrompt">
                    Start a conversation now!
                  </span>
                </Button>
              </Link>
            </div>
          }
        </div>
      </div>
    );
  }
}
