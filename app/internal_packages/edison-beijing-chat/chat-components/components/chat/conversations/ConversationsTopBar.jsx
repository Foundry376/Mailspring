import React, { PureComponent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../common/Button';
import { theme } from '../../../utils/colors';
import TopBar from '../../common/TopBar';
import { NEW_CONVERSATION } from '../../../actions/chat';
import { WorkspaceStore, Actions } from 'mailspring-exports';

export default class ConversationsTopBar extends PureComponent {
  newConversation = () => {
    Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
    this.props.newConversation(NEW_CONVERSATION);
  }
  render() {
    return (
      <TopBar
        left={
          <div className="left-title">MESSAGES</div>
        }
        right={
          // <Link to="/chat/new">
          <Button className="button new-message" onTouchTap={this.newConversation}>
            <span style={{ fontSize: '16px' }}>+</span> New
          </Button>
          // </Link>
        }
      />
    );
  }
}
