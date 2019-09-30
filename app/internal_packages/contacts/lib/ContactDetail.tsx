import React from 'react';
import { Contact, localized } from 'mailspring-exports';
import { isEqual } from 'underscore';
import { FocusContainer, ListensToFluxStore, ScrollRegion } from 'mailspring-component-kit';
import { parse, ContactBase, ContactInteractorMetadata } from './ContactController';
import { ContactDetailRead } from './ContactDetailRead';
import { ContactDetailEdit } from './ContactDetailEdit';
import { Store, ContactsPerspective } from './Store';

interface ContactDetailProps {
  editing: boolean;
  contacts: Contact[];
  perspective: ContactsPerspective;
  focusedId?: string;
}

interface ContactDetailState {
  contact: Contact | null;
  data: ContactBase | null;
  metadata: ContactInteractorMetadata | null;
}

class ContactDetailWithFocus extends React.Component<ContactDetailProps, ContactDetailState> {
  constructor(props: ContactDetailProps) {
    super(props);
    this.state = this.getStateForProps();
  }

  componentDidUpdate(prevProps) {
    const prevContact = prevProps.contacts.find(c => c.id === prevProps.focusedId);
    const newContact = this.props.contacts.find(c => c.id === this.props.focusedId);

    if (isEqual(prevContact, newContact)) return;
    if (this.props.editing) Store.setEditing(false);
    this.setState(this.getStateForProps());
  }

  getStateForProps() {
    const contact = this.props.contacts.find(c => c.id === this.props.focusedId);

    if (!contact) {
      return { metadata: null, data: null, contact: null };
    }
    const { metadata, data } = parse(contact);

    return {
      contact: contact,
      data,
      metadata,
    };
  }

  render() {
    const { editing } = this.props;
    const { data, metadata, contact } = this.state;

    if (!data) {
      return (
        <div className="contact-detail-column">
          <div className="contacts-empty-state">
            <div className="message">No contact selected.</div>
          </div>
        </div>
      );
    }

    return (
      <>
        <ScrollRegion className="contact-detail-column">
          {editing ? (
            <ContactDetailEdit
              data={data}
              contact={contact}
              onChange={changes => this.setState({ data: { ...data, ...changes } })}
            />
          ) : (
            <ContactDetailRead data={data} contact={contact} metadata={metadata} />
          )}
        </ScrollRegion>
        {editing && (
          <div className="contact-edit-footer">
            <button
              tabIndex={-1}
              className={`btn btn-emphasis`}
              onClick={() => Store.setEditing(false)}
            >
              {localized('Save Changes')}
            </button>
          </div>
        )}
      </>
    );
  }
}

export const ContactDetail: React.FunctionComponent<ContactDetailProps> = ListensToFluxStore(
  ({ contacts, perspective, editing }) => (
    <FocusContainer collection="contact">
      <ContactDetailWithFocus contacts={contacts} editing={editing} perspective={perspective} />
    </FocusContainer>
  ),
  {
    stores: [Store],
    getStateFromStores: () => ({
      editing: Store.editing(),
      contacts: Store.filteredContacts(),
      perspective: Store.perspective(),
    }),
  }
);

ContactDetail.displayName = 'ContactDetail';
(ContactDetail as any).containerStyles = {
  minWidth: 360,
  maxWidth: 100000,
};
