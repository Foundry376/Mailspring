import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import NewTopBar from './NewTopBar';
import NewFilterBar from './NewFilterBar';
import NewSelectedChips from './NewSelectedChips';
import NewContactsList from './NewContactsList';
import Divider from '../../common/Divider';

export default class NewPanel extends PureComponent {
  static propTypes = {
    onMount: PropTypes.func,
    onGroupConversationCompleted: PropTypes.func,
    onPrivateConversationCompleted: PropTypes.func,
    contacts: PropTypes.arrayOf(PropTypes.shape({
      jid: PropTypes.string.isRequired,
      // Warning: Failed prop type
      // name: PropTypes.string.isRequired,
    })).isRequired,
  }

  static defaultProps = {
    onMount: () => { },
    onGroupConversationCompleted: () => { },
    onPrivateConversationCompleted: () => { },
  }

  state = {
    isGroupMode: false,
    selectedContacts: [],
    filterString: '',
  }

  componentDidMount() {
    const { onMount } = this.props;
    if (onMount) {
      onMount();
    }
  }

  contactSelected(contact) {
    const { isGroupMode, selectedContacts } = this.state;
    if (isGroupMode) {
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
    } else {
      const { onPrivateConversationCompleted } = this.props;
      onPrivateConversationCompleted(contact);
    }
  }

  createGroup() {
    const { onGroupConversationCompleted } = this.props;
    const { selectedContacts } = this.state;
    if (onGroupConversationCompleted && selectedContacts.length) {
      onGroupConversationCompleted(selectedContacts);
    }
  }

  render() {
    const { isGroupMode, selectedContacts, filterString } = this.state;
    const { contacts } = this.props;

    const sanitizedFilter = filterString.trim().toLowerCase();
    const visibleContacts = contacts.filter(({ name }) =>
      // TypeError: Cannot read property 'trim' of undefined
      name && (name.trim().toLowerCase().indexOf(sanitizedFilter) > -1)
    );

    return (
      <div className="panel">
        <NewTopBar
          groupMode={isGroupMode}
          createGroupEnabled={isGroupMode && selectedContacts.length > 0}
          onCancelGroupModePressed={
            () => this.setState({ isGroupMode: false, selectedContacts: [] })
          }
          onCreateGroupPressed={this.createGroup.bind(this)}
          onEnterGroupModePressed={() => this.setState({ isGroupMode: true })}
        />
        <Divider type="horizontal" />
        <NewFilterBar
          onFilterStringChanged={newFilter => this.setState({ filterString: newFilter })}
        />
        <Divider type="horizontal" />
        {isGroupMode ?
          <NewSelectedChips
            selectedContacts={selectedContacts}
            onContactClicked={this.contactSelected.bind(this)}
          /> :
          null
        }
        {isGroupMode && selectedContacts.length ?
          <Divider type="horizontal" /> : null
        }
        <NewContactsList
          groupMode={isGroupMode}
          contacts={visibleContacts}
          selectedContacts={selectedContacts}
          onContactClicked={this.contactSelected.bind(this)}
        />
      </div>
    );
  }
}
