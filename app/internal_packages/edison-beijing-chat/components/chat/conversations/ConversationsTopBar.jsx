import React, { PureComponent } from 'react';
import Button from '../../common/Button';
import TopBar from '../../common/TopBar';
import { NEW_CONVERSATION } from '../../../utils/constant';
import { WorkspaceStore, Actions } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';
import { ConversationStore, AppStore } from 'chat-exports';

export default class ConversationsTopBar extends PureComponent {
  constructor() {
    super();
    ConversationStore.setConversationTopBar(this);
  }
  componentWillUnmount() {
    ConversationStore.setConversationTopBar(null);
  }

  newConversation = async () => {
    const messagePanel = document.querySelector('.messages');
    if (messagePanel) {
      ConversationStore.messagePanelScrollTopBeforeNew = messagePanel.scrollTop;
    }
    Actions.pushSheet(WorkspaceStore.Sheet.ChatView);
    document.querySelector('#Center').style.zIndex = 9;
    await AppStore.refreshAppsEmailContacts();
    ConversationStore.selectedConversationBeforeNew = ConversationStore.selectedConversation;
    ConversationStore.setSelectedConversation(NEW_CONVERSATION);
  };
  render() {
    return (
      <TopBar
        className="conversation-top-bar"
        left={[
          <div key="title" className="left-title">
            MESSAGES
          </div>,
          <BindGlobalCommands
            key="bindKey"
            commands={{
              'application:new-chat': this.newConversation,
            }}
          >
            <span />
          </BindGlobalCommands>,
        ]}
        right={
          <Button className="button new-message" onClick={this.newConversation}>
            <RetinaImg
              name={'pencil.svg'}
              style={{ width: 18 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </Button>
        }
      />
    );
  }
}
