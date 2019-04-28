import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import ConversationItem from './ConversationItem';
import { WorkspaceStore, Actions } from 'mailspring-exports';
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

    console.log('debugger* Conversations.render: conversations: ', conversations);

    return (
      <div onClick={() => Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView)}>
        {conversations.map((conv, index) => (
          <ConversationItem
            key={conv.jid}
            selected={selectedIndex === index}
            conversation={conv}
            referenceTime={referenceTime}
            onClick={() => selectConversation(conv.jid)}
            removeConversation={removeConversation}
          />
        ))}
      </div>
    );
  }
}
