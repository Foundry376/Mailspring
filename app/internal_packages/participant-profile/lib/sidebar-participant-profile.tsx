import React from 'react';
import { Contact } from 'mailspring-exports';
import { ContactProfilePhoto } from 'mailspring-component-kit';

export default class SidebarParticipantProfile extends React.Component<{ contact: Contact }> {
  static displayName = 'SidebarParticipantProfile';

  static containerStyles = { order: 0 };

  render() {
    const { contact } = this.props;
    return (
      <div className="participant-profile">
        <ContactProfilePhoto contact={contact} loading={false} avatar={null} />
        <div className="personal-info">
          {contact.fullName() !== contact.email && (
            <div className="selectable larger">{contact.fullName()}</div>
          )}
          <div className="selectable email">{contact.email}</div>
        </div>
      </div>
    );
  }
}
