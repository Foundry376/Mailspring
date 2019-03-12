import React, { PureComponent } from 'react';
import Button from '../../common/Button';
import TopBar from '../../common/TopBar';
import { NEW_CONVERSATION } from '../../../actions/chat';
import { WorkspaceStore, Actions } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';

export default class ConversationsTopBar extends PureComponent {
  newConversation = () => {
    Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
    this.props.newConversation(NEW_CONVERSATION);
  }
  render() {
    return (
      <TopBar
        left={
          [<div key='title' className="left-title">MESSAGES</div>,
          <BindGlobalCommands key='bindKey' commands={{
            "application:new-chat": this.newConversation
          }}><span/></BindGlobalCommands>]
        }
        right={
          <Button className="button new-message" onClick={this.newConversation}>
            <RetinaImg name={'pencil.svg'}
              style={{ width: 14 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
            New
          </Button>
        }
      />
    );
  }
}
