import Rx from 'rx-lite';
import {
  DatabaseStore,
  Contact,
  ContactGroup,
  ContactBook,
  MutableQuerySubscription,
} from 'mailspring-exports';
import MailspringStore from 'mailspring-store';
import { ListTabular } from 'mailspring-component-kit';

class ContactsWindowStore extends MailspringStore {
  _perspective: ContactsPerspective = { type: 'unified' };
  _listSource = new ListTabular.DataSource.DumbArrayDataSource<Contact>();

  _contacts: Contact[] = [];
  _contactsSubscription: MutableQuerySubscription<Contact>;
  _groups: ContactGroup[] = [];
  _books: ContactBook[] = [];
  _search = '';
  _filtered: Contact[] | null = null;
  _editing: string | 'new' | false = false;

  constructor() {
    super();

    window.requestAnimationFrame(() => {
      AppEnv.displayWindow();

      const contacts = DatabaseStore.findAll<Contact>(Contact)
        .where(Contact.attributes.refs.greaterThan(0))
        .where(Contact.attributes.hidden.equal(false));
      this._contactsSubscription = new MutableQuerySubscription<Contact>(contacts);

      Rx.Observable.fromNamedQuerySubscription('contacts', this._contactsSubscription).subscribe(
        contacts => {
          this._contacts = contacts as Contact[];
          this._filtered = null;
          this.repopulate();
        }
      );

      Rx.Observable.fromQuery(DatabaseStore.findAll<ContactGroup>(ContactGroup)).subscribe(
        groups => {
          this._groups = groups;
          this.trigger();
        }
      );

      Rx.Observable.fromQuery(DatabaseStore.findAll<ContactBook>(ContactBook)).subscribe(books => {
        this._books = books;
        this.trigger();
      });
    });
  }

  books() {
    return this._books;
  }

  groups() {
    return this._groups;
  }

  listSource() {
    return this._listSource;
  }

  perspective() {
    return this._perspective;
  }

  filteredContacts() {
    return this._filtered;
  }

  editing() {
    return this._editing;
  }

  setEditing(editing: string | 'new' | false) {
    this._editing = editing;
    this.trigger();
  }

  setPerspective(perspective: ContactsPerspective) {
    const q = DatabaseStore.findAll<Contact>(Contact)
      .where(Contact.attributes.refs.greaterThan(0))
      .where(Contact.attributes.hidden.equal(false));

    if (perspective.type === 'all') {
      q.where(Contact.attributes.source.not('mail'));
    }
    if (perspective.type === 'group') {
      q.where(Contact.attributes.contactGroups.contains(perspective.groupId));
    }

    this._filtered = null;
    this._perspective = perspective;
    this._search = '';

    if (q.sql() !== this._contactsSubscription.query().sql()) {
      this._contacts = [];
      this._contactsSubscription.replaceQuery(q);
    }
    this.repopulate();
  }

  search() {
    return this._search;
  }

  setSearch(str: string) {
    this._search = str;
    this.repopulate();
  }

  repopulate() {
    const perspective = this._perspective;
    let filtered = [...this._contacts];

    if (perspective.type !== 'unified') {
      filtered = filtered.filter(c => {
        if (c.accountId !== perspective.accountId) return false;
        if (c.source !== 'mail' && perspective.type === 'found-in-mail') return false;
        if (c.source === 'mail' && perspective.type !== 'found-in-mail') return false;
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
    this._filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));
    this._listSource.setItems(this._filtered);
    this.trigger();
  }
}

export type ContactsPerspectiveForGroup = {
  label: string;
  accountId: string;
  groupId: string;
  type: 'group';
};

export type ContactsPerspective =
  | { type: 'unified' }
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
  | ContactsPerspectiveForGroup;

export const Store = new ContactsWindowStore();
