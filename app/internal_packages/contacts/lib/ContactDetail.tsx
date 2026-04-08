import React from 'react';
import {
  Contact,
  localized,
  Actions,
  SyncbackContactTask,
  AccountStore,
  ContactGroup,
  FocusedContentStore,
} from 'mailspring-exports';
import { isEqual } from 'underscore';
import { ListensToFluxStore, ScrollRegion } from 'mailspring-component-kit';
import { parse, ContactBase, ContactInteractorMetadata, apply } from './ContactInfoMapping';
import { ContactDetailRead } from './ContactDetailRead';
import { ContactDetailEdit } from './ContactDetailEdit';
import { Store, ContactsPerspective } from './Store';

interface ContactDetailProps {
  editing: string | 'new' | false;
  groups: ContactGroup[];
  contacts: Contact[];
  perspective: ContactsPerspective;
  focusedId?: string;
  keyboardCursorId?: string;
}

interface ContactDetailState {
  contact: Contact | null;
  data: ContactBase | null;
  metadata: ContactInteractorMetadata | null;
}

function defaultContactAccountId() {
  const accounts = AccountStore.accounts();
  const pick = accounts.find(a => a.provider !== 'gmail') || accounts[0];
  return pick ? pick.id : null;
}

function accountIdForPerspective(perspective: ContactsPerspective) {
  if ('accountId' in perspective && perspective.accountId) {
    return perspective.accountId;
  }
  if (
    perspective.type === 'unified' ||
    perspective.type === 'local-group' ||
    perspective.type === 'local-all'
  ) {
    return defaultContactAccountId();
  }
  return null;
}

function emptyContactForAccountId(accountId: string) {
  const account = AccountStore.accountForId(accountId);
  const source = account.provider === 'gmail' ? 'gpeople' : 'carddav';
  const info: Contact['info'] =
    source === 'gpeople'
      ? {
          names: [],
          resourceName: '',
          etag: '',
          addresses: [],
        }
      : {
          vcf: `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${crypto.randomUUID()}\r\nEND:VCARD\r\n`,
          href: '',
        };

  return new Contact({
    source,
    name: '',
    email: '',
    accountId: account.id,
    info,
  });
}

class ContactDetailWithFocus extends React.Component<ContactDetailProps, ContactDetailState> {
  constructor(props: ContactDetailProps) {
    super(props);
    this.state = this.getStateForProps();
  }

  _activeId(props: ContactDetailProps = this.props) {
    return props.focusedId || props.keyboardCursorId;
  }

  componentDidUpdate(prevProps) {
    const { editing, contacts } = this.props;
    const prevActiveId = prevProps.focusedId || prevProps.keyboardCursorId;
    const activeId = this._activeId();

    const at = (id?: string) => id && contacts.find(c => c.id === id);
    const prevFocused = at(prevActiveId);
    const newFocused = at(activeId);

    if (isEqual(prevFocused, newFocused) && prevProps.editing === editing) return;

    if (editing === 'new') {
      if (prevActiveId !== activeId && (prevActiveId != null || activeId != null)) {
        Store.setEditing(false);
      }
    } else if (typeof editing === 'string') {
      if (
        prevActiveId !== activeId &&
        activeId !== undefined &&
        prevActiveId !== undefined &&
        activeId !== editing
      ) {
        Store.setEditing(false);
      }
    }

    this.setState(this.getStateForProps());
  }

  getStateForProps() {
    const { editing, contacts, perspective } = this.props;
    const activeId = this._activeId();

    let contact: Contact | undefined;
    if (editing === 'new') {
      const accountId = accountIdForPerspective(perspective);
      if (accountId) {
        contact = emptyContactForAccountId(accountId);
      }
    } else if (typeof editing === 'string' && editing !== 'new') {
      contact = contacts?.find(c => c.id === editing);
    } else {
      contact = contacts?.find(c => c.id === activeId);
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

  contactPreparedForEditing = (contact: Contact) => {
    const prepared = contact.clone();
    const account = AccountStore.accountForId(contact.accountId);
    const source = account?.provider === 'gmail' ? 'gpeople' : 'carddav';
    const hasInfo = !!prepared.info && Object.keys(prepared.info).length > 0;

    if (prepared.source === 'mail' || !hasInfo) {
      prepared.source = source;
      if (source === 'gpeople') {
        prepared.info = {
          names: [],
          resourceName: '',
          etag: '',
          addresses: [],
        } as any;
      } else {
        prepared.info = {
          vcf: `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${crypto.randomUUID()}\r\nEND:VCARD\r\n`,
          href: '',
        } as any;
      }
    }
    return prepared;
  };

  onSaveChanges = () => {
    const { perspective } = this.props;
    const prepared = this.contactPreparedForEditing(this.state.contact);
    const contact = apply(prepared, this.state.data);

    if (contact.id) {
      Actions.queueTask(SyncbackContactTask.forUpdating({ contact }));
      Store.setEditing(false);
      return;
    }

    const accountId = accountIdForPerspective(perspective);
    if (!accountId) return;
    Actions.queueTask(SyncbackContactTask.forCreating({ contact, accountId }));
    Store.setEditing(false);
  };

  render() {
    const { editing, groups } = this.props;
    const { data, metadata, contact } = this.state;
    const willConvertMailContactOnSave = !!editing && !!contact && contact.source === 'mail';

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
              onChange={changes =>
                this.setState(prev => ({
                  data: { ...prev.data, ...changes },
                }))
              }
            />
          ) : (
            <ContactDetailRead data={data} contact={contact} metadata={metadata} groups={groups} />
          )}
        </ScrollRegion>
        {editing && (
          <div className="contact-edit-footer">
            {willConvertMailContactOnSave && (
              <div style={{ alignSelf: 'center', marginRight: 12, opacity: 0.75 }}>
                {localized('This contact was found in mail and will be saved to your contacts.')}
              </div>
            )}
            <button className={`btn`} onClick={this.onCancel}>
              {localized('Cancel')}
            </button>
            <div style={{ flex: 1 }} />
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
  ({ contacts, perspective, editing, groups, focusedId, keyboardCursorId }) => (
    <ContactDetailWithFocus
      contacts={contacts}
      editing={editing}
      perspective={perspective}
      groups={groups}
      focusedId={focusedId}
      keyboardCursorId={keyboardCursorId}
    />
  ),
  {
    stores: [Store, FocusedContentStore],
    getStateFromStores: () => ({
      editing: Store.editing(),
      groups: Store.groups(),
      contacts: Store.filteredContacts(),
      perspective: Store.perspective(),
      focusedId: FocusedContentStore.focusedId('contact'),
      keyboardCursorId: FocusedContentStore.keyboardCursorId('contact'),
    }),
  }
);

ContactDetail.displayName = 'ContactDetail';
(ContactDetail as any).containerStyles = {
  minWidth: 360,
  maxWidth: 100000,
};
