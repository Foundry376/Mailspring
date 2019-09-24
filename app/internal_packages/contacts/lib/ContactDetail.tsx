import React from 'react';
import { Contact } from 'mailspring-exports';
import { ContactProfilePhoto, FocusContainer, ListensToFluxStore } from 'mailspring-component-kit';
import { Store } from './Store';

interface ContactDetailProps {
  contacts: Contact[];
  focusedId?: string;
}

interface ContactDetailState {}

class ContactDetailWithFocus extends React.Component<ContactDetailProps, ContactDetailState> {
  render() {
    const { contacts, focusedId } = this.props;
    const contact = contacts.find(c => c.id === focusedId);

    if (!contact) {
      return (
        <div className="contact-detail-column">
          <div className="contacts-empty-state">
            <div className="message">No contact selected.</div>
          </div>
        </div>
      );
    }

    return (
      <div className="contact-detail-column">
        <div className="contact-hero">
          <ContactProfilePhoto contact={contact} loading={false} avatar={null} />
          <h3>{contact.name}</h3>
        </div>
        <div className="contact-attributes">
          <div className="contact-attribute">
            <label>email</label>
            <div>
              <a href={`mailto:${contact.email}`} title="Send email...">
                {contact.email}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export const ContactDetail: React.FunctionComponent<ContactDetailProps> = ListensToFluxStore(
  ({ contacts }) => (
    <FocusContainer collection="contact">
      <ContactDetailWithFocus contacts={contacts} />
    </FocusContainer>
  ),
  {
    stores: [Store],
    getStateFromStores: () => ({
      contacts: Store.filteredContacts(),
    }),
  }
);

ContactDetail.displayName = 'ContactDetail';
(ContactDetail as any).containerStyles = {
  minWidth: 400,
  maxWidth: 100000,
};
