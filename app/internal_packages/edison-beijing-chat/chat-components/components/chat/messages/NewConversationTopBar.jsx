import React, { Component } from 'react';
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
      members: []
    }
  }
  componentDidMount = () => {
    setTimeout(this._setDropDownHeight, 300);
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
      members
    });
  }

  createRoom = () => {
    if (this.state.members.length === 0) {
      return;
    }
    this._close();
    Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
    this.props.createRoom();
  }

  _close = () => {
    Actions.popSheet();
    ChatActions.deselectConversation();
  }

  onKeyUp = (event) => {
    if (event.keyCode === 27) { // ESC
      this._close();
    }
  }

  render() {
    const {
      contacts,
    } = this.props;
    const { members } = this.state;

    const children = contacts.filter(contant => !!contant).map((contact, index) =>
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
      </Option>
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
        <div ref={el => { this.contactInputEl = el }} style={{ display: 'flex' }} onClick={() => {
          document.querySelector('#contact-select input').focus();
        }}>
          <Select
            mode="tags"
            id="contact-select"
            style={{ width: '400px', flex: 1, height: '70px' }}
            onChange={this.handleChange}
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
          <Button className={`btn go ${members.length === 0 ? 'btn-disabled' : ''}`} onClick={this.createRoom}>Go</Button>
        </div>
      </div>
    );
  }
}
