import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import ConversationItem from './ConversationItem';

export default class Conversations extends PureComponent {
  static propTypes = {
    conversations: PropTypes.arrayOf(PropTypes.object).isRequired,
    selectedIndex: PropTypes.number,
    selectConversation: PropTypes.func.isRequired,
    referenceTime: PropTypes.number,
    removeConversation: PropTypes.func
  };

  static defaultProps = {
    selectedIndex: null,
    referenceTime: new Date().getTime(),
  }

  render() {
    const {
      conversations,
      selectConversation,
      selectedIndex,
      referenceTime,
      removeConversation
    } = this.props;

    return (
      <div>
        {conversations.map((conv, index) => (
          <ConversationItem
            key={conv.jid}
            selected={selectedIndex === index}
            conversation={conv}
            referenceTime={referenceTime}
            onTouchTap={() => selectConversation(conv.jid)}
            removeConversation={removeConversation}
          />
        ))}
      </div>
    );
  }
}
