import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';

export default class NewSelectedChips extends PureComponent {
  static propTypes = {
    onContactClicked: PropTypes.func,
    selectedContacts: PropTypes.arrayOf(PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string.isRequired,
      avatar: PropTypes.string,
    })),
  }

  static defaultProps = {
    onContactClicked: () => { },
    selectedContacts: [],
  }

  render() {
    const {
      selectedContacts,
      onContactClicked,
    } = this.props;

    const resizableContainerStyles = ['resizableContainer'];
    if (selectedContacts.length) {
      resizableContainerStyles.push('nonEmpty');
    } else {
      resizableContainerStyles.push('empty');
    }
    const resizableContainerClasses = resizableContainerStyles.join(' ');

    return (
      <div className={resizableContainerClasses}>
        <div className="chipContainer">
          {selectedContacts.map(contact => (
            <div
              className="chip"
              key={contact.jid}
              onClick={() => onContactClicked(contact)}
            >
              {contact.name}
            </div>
          ))}
        </div>
      </div>
    );
  }
}
