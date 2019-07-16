import React, { PureComponent } from 'react';
import { WorkspaceStore, Actions } from 'mailspring-exports';
import { ConversationStore, FailMessageStore } from 'chat-exports';
import CancelIcon from './icons/CancelIcon';

export default class FailAlert extends PureComponent {
  constructor(props) {
    super(props);
  }

  state = {}

  componentDidMount = async () => {

  }
  componentWillReceiveProps = async (nextProps, nextContext) => {
    const {msg} = nextProps;
    if (!msg) {
      return;
    }
    const conv = await ConversationStore.getConversationByJid(msg.conversationJid);
    const msgTo = conv.name;
    this.setState({msgTo});
  }

  view = () => {
    const {msg, visible} = this.props;
    if (!msg) {
      return;
    }
    Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
    ConversationStore.setSelectedConversation(msg.conversationJid);
    FailMessageStore.hide();
  };

  hide = () => {
    FailMessageStore.hide();
  };

  render() {
    const {msg, visible} = this.props;
    if (!visible) {
      return null
    }
    const {msgTo} = this.state;

    return (<div className="fail-alert-container">
      messages to {msgTo} failed to send
      <button className="view-btn" onClick = {this.view}> View </button>
      <CancelIcon className="hide-btn" color={'gray'} onClick={this.hide}></CancelIcon>
    </div>);
  }
}

