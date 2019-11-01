import React, { Component } from 'react';
import { RetinaImg, InjectedComponent } from 'mailspring-component-kit';
import Select, { Option } from 'rc-select';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import uuid from 'uuid/v4';
import { Actions, WorkspaceStore } from 'mailspring-exports';
import { ChatActions, ConversationStore, ContactStore, AppStore } from 'chat-exports';
const { AccountStore } = require('mailspring-exports');

const GROUP_CHAT_DOMAIN = '@muc.im.edison.tech';
export default class NewConversation extends Component {
  static displayName = 'NewConversation';

  constructor() {
    super();
    this.state = {
      members: [],
      contacts: [],
      membersTemp: [],
      loading: true,
    };
    this._mounted = false;
  }

  componentDidMount() {
    this._mounted = true;
    this.unsub = AppStore.listen(() => {
      this.initContacts();
    });
    // this.initContacts();
    setTimeout(this._setDropDownHeight, 300);
    window.addEventListener('resize', this.setUlListPosition);
  }

  initContacts = async () => {
    const contacts = await ContactStore.getContacts();
    console.log('contacts===', contacts);
    if (this._mounted) {
      this.setState({ contacts, loading: false });
    }
  };

  componentWillUnmount() {
    this._mounted = false;
    window.removeEventListener('resize', this.setUlListPosition);
    this.unsub();
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
      const widthDiff =
        ulList.getBoundingClientRect().width - container.getBoundingClientRect().width;
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
    this.saveRoomMembersForTemp(members);
    this.setState(
      {
        members,
      },
      () => {
        document.querySelector('#contact-select input').focus();
      }
    );
  };

  createRoom = () => {
    if (this.state.members.length === 0) {
      return;
    }
    this._close();
    Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);

    const contacts = this.state.membersTemp;
    if (contacts && contacts.length) {
      const curJid = contacts[0].curJid;
      if (contacts.length === 1) {
        ConversationStore.createPrivateConversation(contacts[0]);
      } else if (contacts.some(contact => contact.jid.match(/@app/))) {
        alert('Should only create private conversation with single plugin app contact.');
        return;
      } else {
        const roomId = uuid() + GROUP_CHAT_DOMAIN;
        const names = contacts.map(contact => contact.name);
        const name =
          contacts.length > 4
            ? names.slice(0, 3).join(', ') + ' & ' + `${names.length - 3} others`
            : names.slice(0, names.length - 1).join(', ') + ' & ' + names[names.length - 1];
        ConversationStore.createGroupConversation({ contacts, roomId, name, curJid });
      }
      AppEnv.config.set('chatNeedAddIntialConversations', false);
    }
  };

  _close = () => {
    Actions.popSheet({ reason: 'NewConversation:_close' });
    const conv = ConversationStore.selectedConversationBeforeNew;
    if (conv) {
      ConversationStore.setSelectedConversation(conv.jid);
    } else {
      ChatActions.deselectConversation();
    }
    ConversationStore.selectedConversationBeforeNew = null;
  };

  onKeyUp = event => {
    if (event.keyCode === 27) {
      // ESC
      this._close();
    }
  };

  focusIntoInput = () => {
    document.querySelector('#contact-select').focus();
    document.querySelector('#contact-select input').focus();
  };

  saveRoomMembersForTemp = members => {
    this.setState({ membersTemp: members });
  };

  render() {
    const { members, contacts, loading } = this.state;

    const children = contacts
      .filter(contact => !!contact && !this.isMe(contact.email))
      .map((contact, index) => (
        <Option
          key={contact.jid}
          jid={contact.jid}
          curjid={contact.curJid}
          value={contact.name + contact.email}
          email={contact.email}
          label={contact.name}
        >
          <div className="chip">
            <ContactAvatar jid={contact.jid} name={contact.name} email={contact.email} size={32} />
            <span className="contact-name">{contact.name}</span>
            <span className="contact-email">{contact.email}</span>
          </div>
        </Option>
      ));
    return (
      <div className="new-conversation-popup">
        <div className="newConversationPanel" onKeyUp={this.onKeyUp}>
          <InjectedComponent matching={{ role: 'ToolbarWindowControls' }} />
          <div className="to">
            <span className="close" onClick={this._close}>
              <RetinaImg
                name={'close_1.svg'}
                style={{ width: 24, height: 24 }}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask}
              />
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
              defaultOpen
              multiple
              autoFocus
              open
              placeholder="Find a contact or enter an email"
              tokenSeparators={[',']}
              optionLabelProp="label"
              loading={loading}
            >
              {children}
            </Select>
            <Button
              className={`btn go ${members.length === 0 ? 'btn-disabled' : ''}`}
              onClick={this.createRoom}
            >
              Go
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
