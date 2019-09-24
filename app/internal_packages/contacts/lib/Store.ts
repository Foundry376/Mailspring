import Rx from 'rx-lite';
import { DatabaseStore, Contact } from 'mailspring-exports';
import MailspringStore from 'mailspring-store';

class ContactsWindowStore extends MailspringStore {
  _selectedGroup: ContactSource | null = null;
  _contacts: Contact[] = [];
  _search: string = '';

  constructor() {
    super();

    const contacts = Rx.Observable.fromQuery(
      DatabaseStore.findAll<Contact>(Contact)
        .where(Contact.attributes.refs.greaterThan(0))
        .where(Contact.attributes.hidden.equal(false))
    );
    contacts.subscribe(contacts => {
      this._contacts = contacts;
      this.trigger();
    });
  }

  selectedGroup() {
    return this._selectedGroup;
  }

  setSelectedGroup(selectedGroup: ContactSource | null) {
    this._selectedGroup = selectedGroup;
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

    if (this._selectedGroup) {
      filtered = filtered.filter(c => c.accountId === this._selectedGroup.accountId);
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

export interface ContactSource {
  accountId: string;
  type: string;
  label: string;
}

export const Store = new ContactsWindowStore();
