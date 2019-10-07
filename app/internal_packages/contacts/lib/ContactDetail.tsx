import React from 'react';
import { v4 } from 'uuid';
import {
  Contact,
  localized,
  Actions,
  SyncbackContactTask,
  AccountStore,
  ContactGroup,
} from 'mailspring-exports';
import { isEqual } from 'underscore';
import { FocusContainer, ListensToFluxStore, ScrollRegion } from 'mailspring-component-kit';
import { parse, ContactBase, ContactInteractorMetadata, apply } from './ContactController';
import { ContactDetailRead } from './ContactDetailRead';
import { ContactDetailEdit } from './ContactDetailEdit';
import { Store, ContactsPerspective } from './Store';

interface ContactDetailProps {
  editing: string | 'new' | false;
  groups: ContactGroup[];
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

    if (isEqual(prevContact, newContact) && prevProps.editing === this.props.editing) return;
    if (newContact && this.props.editing !== newContact.id) Store.setEditing(false);
    this.setState(this.getStateForProps());
  }

  getStateForProps() {
    const { editing, contacts, focusedId, perspective } = this.props;
    let contact = contacts.find(c => c.id === focusedId);

    if (editing === 'new') {
      const account = AccountStore.accountForId(perspective.accountId);
      contact = new Contact({
        name: '',
        email: '',
        accountId: account.id,
        info:
          account.provider === 'gmail'
            ? {}
            : {
                vcf: `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${v4()}\r\nEND:VCARD\r\n`,
                href: '',
              },
      });
    }

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

  onCancel = () => {
    Store.setEditing(false);
  };

  onSaveChanges = () => {
    const contact = apply(this.state.contact, this.state.data);

    const task = contact.id
      ? SyncbackContactTask.forUpdating({ contact })
      : SyncbackContactTask.forCreating({ contact, accountId: this.props.perspective.accountId });
    Actions.queueTask(task);
    Store.setEditing(false);
  };

  render() {
    const { editing, groups } = this.props;
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
            <ContactDetailRead data={data} contact={contact} metadata={metadata} groups={groups} />
          )}
        </ScrollRegion>
        {editing && (
          <div className="contact-edit-footer">
            <button tabIndex={-1} className={`btn`} onClick={this.onCancel}>
              {localized('Cancel')}
            </button>
            <div style={{ flex: 1 }} />
            <button tabIndex={-1} className={`btn btn-emphasis`} onClick={this.onSaveChanges}>
              {localized('Save Changes')}
            </button>
          </div>
        )}
      </>
    );
  }
}

export const ContactDetail: React.FunctionComponent<ContactDetailProps> = ListensToFluxStore(
  ({ contacts, perspective, editing, groups }) => (
    <FocusContainer collection="contact">
      <ContactDetailWithFocus
        contacts={contacts}
        editing={editing}
        perspective={perspective}
        groups={groups}
      />
    </FocusContainer>
  ),
  {
    stores: [Store],
    getStateFromStores: () => ({
      editing: Store.editing(),
      groups: Store.groups(),
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
