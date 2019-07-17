import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Select, { Option } from 'rc-select';

export default class InviteGroupChatList extends Component {
  static propTypes = {
    onContactClicked: PropTypes.func,
    groupMode: PropTypes.bool,
    contacts: PropTypes.arrayOf(PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,
      avatar: PropTypes.string
    })),
    selectedContacts: PropTypes.arrayOf(PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string.isRequired,
      avatar: PropTypes.string
    })),
  }

  static defaultProps = {
    groupMode: false,
    contacts: [],
    selectedContacts: [],
  }

  constructor() {
    super();
    this.state = { contacts: [], selectedContacts: [], open: false };
  }

  componentDidMount() {
    setTimeout(() => {
      this.setState({ open: true });
    }, 300);
  }

  onUpdateGroup = (value, option) => {
    this.setState({ selectedContacts: [], inviting: false, open: false });
    this.props.onUpdateGroup([option.props.contact]);
  }

  render() {
    const { open } = this.state;
    const { contacts } = this.props;
    const children = open ? contacts.map(contact =>
      <Option
        key={contact.jid}
        jid={contact.jid}
        curjid={contact.curJid}
        value={contact.name + contact.email}
        email={contact.email}
        label={contact.name}
        contact={contact}
        className="invite-contact-option"
      >
        <div className="chip">
          <ContactAvatar jid={contact.jid} name={contact.name}
            email={contact.email} avatar={contact.avatar} size={32} />
          <span className="contact-name">{contact.name}</span>
          <span className="contact-email">{contact.email}</span>
        </div>
      </Option>
    ) : [];

    return (
      <div className="contactsList">
        <h2>Add to Group...</h2>
        <div style={{ flex: 1 }}>
          <Select
            ref="contacts"
            mode="tags"
            style={{ width: '100%', flex: 1 }}
            onSelect={this.onUpdateGroup}
            open={open}
            defaultOpen={true}
            multiple={true}
            placeholder="Search"
            tokenSeparators={[',']}
            optionLabelProp="label"
          >
            {children}
          </Select>
        </div>
      </div>
    );
  }
}