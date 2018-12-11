import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Select, { Option } from 'rc-select';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';


export default class MessagesTopBar extends Component {
  constructor() {
    super();
  }
  handleChange = (value, options) => {
    const members = options.map(item => ({
      name: item.key,
      jid: item.props.jid,
      curJid: item.props.curjid
    }));
    this.props.saveRoomMembersForTemp(members)
  }
  render() {
    const {
      contacts,
    } = this.props;

    const children = contacts.map(contact =>
      <Option
        key={contact.name}
        jid={contact.jid}
        curjid={contact.curJid}
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
          <Button
            className='no-border'
            onTouchTap={() => {
              this.props.deselectConversation();
            }}
          >X</Button>
          <span>To</span>
        </div>
        <Select
          mode="tags"
          style={{ width: '100%', height: '50px' }}
          onChange={this.handleChange}
          multiple
          tokenSeparators={[',']}
        >
          {children}
        </Select>
      </div>
    );
  }
}
