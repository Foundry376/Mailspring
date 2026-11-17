import React from 'react';
import {
  Contact,
  localized,
  Actions,
  SyncbackContactTask,
  ContactGroup,
  DatabaseStore,
  TaskQueue,
  WorkspaceStore,
} from 'mailspring-exports';
import { isEqual } from 'underscore';
import { FocusContainer, ListensToFluxStore, ScrollRegion } from 'mailspring-component-kit';
import {
  parse,
  ContactBase,
  ContactInteractorMetadata,
  apply,
  contactSourceForAccount,
  emptyContactForAccount,
} from './ContactInfoMapping';
import { ContactDetailRead } from './ContactDetailRead';
import { ContactDetailEdit } from './ContactDetailEdit';
import { displayNameForContact } from './ContactDisplayName';
import { Store } from './Store';

interface ContactDetailProps {
  editing: string | 'new' | false;
  newContactAccountId: string | null;
  groups: ContactGroup[];
  contacts: Contact[];
  focusedId?: string;
}

interface ContactDetailState {
  contact: Contact | null;
  data: ContactBase | null;
  metadata: ContactInteractorMetadata | null;
}

export class ContactDetailWithFocus extends React.Component<
  ContactDetailProps,
  ContactDetailState
> {
  _removeLeaveGuard: () => void;
  _refocusingEdited = false;

  constructor(props: ContactDetailProps) {
    super(props);
    this.state = this.getStateForProps();
  }

  componentDidMount() {
    this._removeLeaveGuard = WorkspaceStore.setSectionLeaveGuard(this._mayLeaveSection);
  }

  componentWillUnmount() {
    this._removeLeaveGuard();
  }

  // Switching sections unmounts the editor, and the typed changes live only in its state.
  _mayLeaveSection = () => {
    const { editing } = this.props;
    const { contact, data } = this.state;
    if (!editing || !contact || isEqual(data, parse(contact).data)) return true;

    const name = editing === 'new' ? localized('New Contact') : displayNameForContact(contact);
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'question',
      buttons: [localized('Save Changes'), localized('Discard'), localized('Keep editing')],
      defaultId: 0,
      cancelId: 2,
      message: localized('"%@" has unsaved changes.', name),
    });
    if (response === 2) return false;
    if (response === 0) this.onSaveChanges();
    else this.onCancel();
    return true;
  };

  componentDidUpdate(prevProps: ContactDetailProps) {
    const prevContact = prevProps.contacts?.find((c) => c.id === prevProps.focusedId);
    const newContact = this.props.contacts?.find((c) => c.id === this.props.focusedId);

    if (
      isEqual(prevContact, newContact) &&
      prevProps.editing === this.props.editing &&
      prevProps.newContactAccountId === this.props.newContactAccountId
    ) {
      return;
    }
    if (this._refocusingEdited) {
      this._refocusingEdited = false;
      return;
    }
    // Focus follows a click a frame late, so an edit started since still sees the old focus.
    const { editing, focusedId } = this.props;
    if (newContact && focusedId !== prevProps.focusedId && editing !== newContact.id) {
      // The list moves focus before anything asks, so keeping the edit moves it back without
      // rebuilding the form from the stored contact.
      if (editing && !this._mayLeaveSection()) {
        this._refocusingEdited = true;
        Actions.setFocus({ collection: 'contact', item: editing === 'new' ? null : prevContact });
        return;
      }
      Store.setEditing(false);
    }
    this.setState(this.getStateForProps());
  }

  getStateForProps() {
    const { editing, contacts, focusedId, newContactAccountId } = this.props;

    const contact =
      editing === 'new'
        ? emptyContactForAccount(
            newContactAccountId,
            contactSourceForAccount(newContactAccountId, Store.books())
          )
        : contacts?.find((c) => c.id === focusedId);

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
      : SyncbackContactTask.forCreating({ contact, accountId: contact.accountId });
    Actions.queueTask(task);
    Store.setEditing(false);

    if (!contact.id) {
      // The sync engine assigns the new contact's id during performLocal.
      TaskQueue.waitForPerformLocal(task)
        .then((t) => DatabaseStore.find<Contact>(Contact, t.contact.id).then((c) => c))
        .then((created) => created && Actions.setFocus({ collection: 'contact', item: created }));
    }
  };

  render() {
    const { editing, groups } = this.props;
    const { data, metadata, contact } = this.state;

    if (!data) {
      return (
        <div className="contact-detail-column">
          <div className="contacts-empty-state">
            <div className="message">{localized('No contact selected.')}</div>
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
              metadata={metadata}
              onChange={(changes) => this.setState({ data: { ...data, ...changes } })}
            />
          ) : (
            <ContactDetailRead data={data} contact={contact} metadata={metadata} groups={groups} />
          )}
        </ScrollRegion>
        {editing && (
          <div className="contact-edit-footer">
            <button className={`btn`} onClick={this.onCancel}>
              {localized('Cancel')}
            </button>
            <button className={`btn btn-emphasis`} onClick={this.onSaveChanges}>
              {localized('Save Changes')}
            </button>
          </div>
        )}
      </>
    );
  }
}

export const ContactDetail: React.FunctionComponent<ContactDetailProps> = ListensToFluxStore(
  ({ contacts, editing, newContactAccountId, groups }) => (
    <FocusContainer collection="contact">
      <ContactDetailWithFocus
        contacts={contacts}
        editing={editing}
        newContactAccountId={newContactAccountId}
        groups={groups}
      />
    </FocusContainer>
  ),
  {
    stores: [Store],
    getStateFromStores: () => ({
      editing: Store.editing(),
      newContactAccountId: Store.newContactAccountId(),
      groups: Store.groups(),
      contacts: Store.filteredContacts(),
    }),
  }
);

ContactDetail.displayName = 'ContactDetail';
(ContactDetail as any).containerStyles = {
  minWidth: 360,
  maxWidth: 100000,
};
