import React, { Component } from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import Select, { Option } from 'rc-select';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';


export default class MessagesTopBar extends Component {
  constructor() {
    super();
  }
  componentDidMount = () => {
  }

  componentDidUpdate = () => {
    const rect = this.contactInputEl.getBoundingClientRect();
    let el = document.querySelector('.rc-select-dropdown.rc-select-dropdown--multiple.rc-select-dropdown-placement-bottomLeft');
    if (el) {
      console.log('dbg*** componentDidUpdate 1: ', el, rect.right-rect.left);
      el.style.width = Math.floor(rect.right-rect.left+5)+'px';
      console.log('dbg*** componentDidUpdate 2: ', el, rect.right-rect.left);
    }
  }

  handleChange = (value, options) => {
    const members = options.map(item => ({
      name: item.props.label,
      jid: item.props.jid,
      curJid: item.props.curjid,
      email: item.props.email,
    }));
    this.props.saveRoomMembersForTemp(members)
  }
  render() {
    const {
      contacts,
    } = this.props;

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
      <div className="new-conversation-header">
        <div className="to">
          <span
            onClick={() => {
              this.props.deselectConversation();
            }}
          >
            <RetinaImg name={'close_1.svg'}
              style={{ width: 24, height: 24 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </span>
          <span className="new-message-title">New Message</span>
        </div>
        <div ref={el=>{this.contactInputEl = el}} style={{ display: 'flex' }} onClick={() => {
          document.querySelector('#contact-select input').focus();
        }}>
          <Select
            mode="tags"
            id="contact-select"
            style={{ width: '400px', flex: 1, height: '50px' }}
            onChange={this.handleChange}
            defaultOpen={true}
            multiple
            autoFocus
            open
            tokenSeparators={[',']}
            optionLabelProp="label"
          >
            {children}
          </Select>
          <Button className="go" onClick={this.props.createRoom}>Go</Button>
        </div>
      </div>
    );
  }
}
