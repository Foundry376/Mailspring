import Rx from 'rx-lite';
import { DatabaseStore, Contact, ContactGroup, MutableQuerySubscription } from 'mailspring-exports';
import MailspringStore from 'mailspring-store';

class ContactsWindowStore extends MailspringStore {
  _selectedSource: ContactSource | null = null;
  _contacts: Contact[] = [];
  _contactsSubscription: MutableQuerySubscription<Contact>;
  _groups: ContactGroup[] = [];
  _search: string = '';

  constructor() {
    super();

    setTimeout(() => {
      const contacts = DatabaseStore.findAll<Contact>(Contact)
        .where(Contact.attributes.refs.greaterThan(0))
        .where(Contact.attributes.hidden.equal(false));
      this._contactsSubscription = new MutableQuerySubscription<Contact>(contacts);
      this._contactsSubscription.addCallback(contacts => {
        this._contacts = contacts;
        this.trigger();
      });

      const groups = Rx.Observable.fromQuery(DatabaseStore.findAll<ContactGroup>(ContactGroup));
      groups.subscribe(groups => {
        this._groups = groups;
        this.trigger();
      });
    }, 100);
  }

  groups() {
    return this._groups;
  }

  selectedSource() {
    return this._selectedSource;
  }

  setSelectedSource(selectedSource: ContactSource | null) {
    let q = DatabaseStore.findAll<Contact>(Contact)
      .where(Contact.attributes.refs.greaterThan(0))
      .where(Contact.attributes.hidden.equal(false));

    if (selectedSource && selectedSource.type === 'all') {
      q.where(Contact.attributes.source.not('mail'));
    }
    if (selectedSource && selectedSource.type === 'group') {
      q.where(Contact.attributes.contactGroups.contains(selectedSource.groupId));
    }

    this._contacts = [];
    this._selectedSource = selectedSource;
    this._contactsSubscription.replaceQuery(q);
    this.trigger();
  }

  search() {
    return this._search;
  }

  setSearch(str: string) {
    this._search = str;
    this.trigger();
  }

  filteredContacts() {
    let filtered = this._contacts;

    if (this._selectedSource) {
      filtered = filtered.filter(c => {
        if (c.accountId !== this._selectedSource.accountId) return false;
        if (c.source !== 'mail' && this._selectedSource.type === 'found-in-mail') return false;
        if (c.source === 'mail' && this._selectedSource.type !== 'found-in-mail') return false;
        return true;
      });
    }
    if (this._search) {
      const isearch = this._search.toLowerCase();
      filtered = filtered.filter(
        c => c.name.toLowerCase().includes(isearch) || c.email.toLowerCase().includes(isearch)
      );
    }

    // note we do this in JS because in SQLite the order is not locale aware.
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }
}

export type ContactSource =
  | {
      label: string;
      accountId: string;
      type: 'all';
    }
  | {
      label: string;
      accountId: string;
      type: 'found-in-mail';
    }
  | {
      label: string;
      accountId: string;
      groupId: string;
      type: 'group';
    };

export const Store = new ContactsWindowStore();
