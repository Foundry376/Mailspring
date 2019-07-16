import React, { Component } from 'react';
const { AccountStore } = require('mailspring-exports');
import { RetinaImg, InjectedComponent } from 'mailspring-component-kit';
import Select, { Option } from 'rc-select';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import { Actions, WorkspaceStore } from 'mailspring-exports';
import { ChatActions } from 'chat-exports';

export default class NewConversationTopBar extends Component {
  constructor() {
    super();
    this.state = {
      members: [],
    };
  }

  componentDidMount = () => {
    setTimeout(this._setDropDownHeight, 300);
    window.addEventListener('resize', this.setUlListPosition);
  };

  componentWillUnmount() {
    window.removeEventListener('resize', this.setUlListPosition);
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    if (this.state.members.length !== prevState.members.length) {
      this.setUlListPosition();
    }
  }

  isMe(email) {
    return !!AccountStore.accountForEmail(email);
  }

  setUlListPosition() {
    const container = document.querySelector('#contact-select');
    const ulList = document.querySelector('#contact-select ul');
    if (container && ulList) {
      const widthDiff = ulList.getBoundingClientRect().width - container.getBoundingClientRect().width;
      if (widthDiff <= 0) {
        ulList.setAttribute('style', 'margin-left: 0');
      } else {
        ulList.setAttribute('style', `margin-left: -${widthDiff + 20}px`);
      }
    }
  }

  _setDropDownHeight() {
    const dropDown = document.querySelector('.rc-select-dropdown');
    if (dropDown) {
      const offsetTop = dropDown.offsetTop;
      dropDown.style.maxHeight = `calc(100vh - ${offsetTop + 5}px)`;
    }
  }

  handleChange = (value, options) => {
    const members = options.map(item => ({
      name: item.props.label,
      jid: item.props.jid,
      curJid: item.props.curjid,
      email: item.props.email,
    }));
    this.props.saveRoomMembersForTemp(members);
    this.setState({
      members,
    }, () => {
      document.querySelector('#contact-select input').focus();
    });
  };

  createRoom = () => {
    if (this.state.members.length === 0) {
      return;
    }
    this._close();
    Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
    this.props.createRoom();
  };

  _close = () => {
    Actions.popSheet();
    ChatActions.deselectConversation();
  };

  onKeyUp = (event) => {
    if (event.keyCode === 27) { // ESC
      this._close();
    }
  };

  focusIntoInput = () => {
    document.querySelector('#contact-select').focus();
    document.querySelector('#contact-select input').focus();
  }

  render() {
    const {
      contacts,
    } = this.props;
    const { members } = this.state;

    const children = contacts
      .filter(contact => !!contact && !this.isMe(contact.email))
      .map((contact, index) =>
        <Option
          key={contact.jid}
          jid={contact.jid}
          curjid={contact.curJid}
          value={contact.name + contact.email}
          email={contact.email}
          label={contact.name}
        >
          <div className="chip">
            <ContactAvatar jid={contact.jid} name={contact.name}
              email={contact.email} avatar={contact.avatar} size={32} />
            <span className="contact-name">{contact.name}</span>
            <span className="contact-email">{contact.email}</span>
          </div>
        </Option>,
      );
    return (
      <div className="new-conversation-header" onKeyUp={this.onKeyUp}>
        <InjectedComponent
          matching={{ role: 'ToolbarWindowControls' }}
        />
        <div className="to">
          <span
            className="close"
            onClick={this._close}
          >
            <RetinaImg name={'close_1.svg'}
              style={{ width: 24, height: 24 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </span>
          <span className="new-message-title">New Message</span>
        </div>
        <div
          ref={el => {
            this.contactInputEl = el;
          }}
          style={{ display: 'flex' }}
          onClick={this.focusIntoInput}
          className="contact-select-wrapper"
        >
          <Select
            mode="tags"
            id="contact-select"
            style={{ width: '400px', flex: 1, height: '70px' }}
            onChange={this.handleChange}
            onSelect={this.focusIntoInput}
            defaultOpen={true}
            multiple
            autoFocus
            open
            placeholder="Find a contact or enter an email"
            tokenSeparators={[',']}
            optionLabelProp="label"
          >
            {children}
          </Select>
          <Button className={`btn go ${members.length === 0 ? 'btn-disabled' : ''}`}
            onClick={this.createRoom}>Go</Button>
        </div>
      </div>
    );
  }
}
