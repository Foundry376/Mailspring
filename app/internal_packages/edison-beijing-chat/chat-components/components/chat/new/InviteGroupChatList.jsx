import React, { Component } from 'react';
import PropTypes from 'prop-types';
import CheckBox from '../../common/icons/CheckBox';
import ContactAvatar from '../../common/ContactAvatar';
import { theme } from '../../../utils/colors';
import getDb from '../../../db';
import NewSelectedChips from './NewSelectedChips';
import DoneIcon from '../../common/icons/DoneIcon';
import CancelIcon from '../../common/icons/CancelIcon';
import Button from '../../common/Button';

const { primaryColor } = theme;

export default class InviteGroupChatList extends Component {
  static propTypes = {
    onContactClicked: PropTypes.func,
    groupMode: PropTypes.bool,
    contacts: PropTypes.arrayOf(PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string.isRequired,
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
    onContactClicked: () => { },
    groupMode: false,
    contacts: [],
    selectedContacts: [],
  }

  constructor() {
    super();
    this.state = { contacts: [], selectedContacts: [] }
  }

  componentDidMount() {
    getDb().then(db => {
      db.contacts.find().exec().then(contacts => this.setState({ contacts }))
    })
  }
  contactSelected(contact) {
    const { selectedContacts } = this.state;

    const enumeratedFilteredContacts = selectedContacts.map((c, idx) => [c, idx])
      .filter(([c]) => c.jid === contact.jid);
    const selectedContactsCopy = Array.from(selectedContacts);
    if (enumeratedFilteredContacts.length) {
      selectedContactsCopy.splice(enumeratedFilteredContacts[0][1], 1);
      this.setState({ selectedContacts: selectedContactsCopy });
    } else {
      selectedContactsCopy.push(contact);
      this.setState({ selectedContacts: selectedContactsCopy });
    }
  }

  onCancel = () => {
    this.setState({ selectedContacts: [], inviting: false });
    this.props.onUpdateGroup([]);
  }

  onUpdateGroup = () => {
    const { selectedContacts } = this.state;
    this.setState({ selectedContacts: [], inviting: false });
    this.props.onUpdateGroup(selectedContacts);
  }

  render() {
    const {
      contacts,
      selectedContacts,
    } = this.state;

    const jids = new Set(selectedContacts.map(contact => contact.jid));
    const getContactItemClasses = contact => {
      const classes = ['contactItem'];
      if (jids.has(contact.jid)) {
        classes.push('selected');
      }
      return classes.join(' ');
    };
    const { onUpdateGroup } = this.props;

    return (
      <div className="contactsList">
        {/* <NewSelectedChips
          selectedContacts={selectedContacts}
          onContactClicked={this.contactSelected.bind(this)}
        /> */}
        <div style={{ padding: '5px 12px', overflow: 'hidden' }}>
          <Button style={{ float: 'left' }} className="no-border" onClick={this.onCancel}>
            <CancelIcon color={primaryColor} />
          </Button>
          <Button style={{ float: 'right' }} onClick={this.onUpdateGroup} className="update-group-button no-border">
            <DoneIcon color={primaryColor} />
          </Button>
        </div>
        <div style={{ overflowY: 'scroll', flex: 1 }}>
          {
            contacts.map(contact =>
              <div
                key={contact.jid}
                className={getContactItemClasses(contact)}
                onClick={() => this.contactSelected(contact)}
              >
                <ContactAvatar jid={contact.jid} name={contact.name}
                  email={contact.email} avatar={contact.avatar} size={32} />
                <span className="contactName">{contact.name}</span>
                <CheckBox
                  checked={jids.has(contact.jid)}
                  checkColor={primaryColor}
                  circleColor="#444"
                  size={18}
                />
              </div>
            )
          }
        </div>
      </div>
    );
  }
}
