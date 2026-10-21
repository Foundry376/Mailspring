import Rx from 'rx-lite';
import {
  DatabaseStore,
  Contact,
  ContactGroup,
  ContactBook,
  MutableQuerySubscription,
  localized,
} from 'mailspring-exports';
import MailspringStore from 'mailspring-store';
import { ListTabular } from 'mailspring-component-kit';
import { displayNameForContact } from './ContactDisplayName';

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

      this._contactsSubscription = new MutableQuerySubscription<Contact>(
        this._queryForPerspective(this._perspective)
      );

      Rx.Observable.fromNamedQuerySubscription('contacts', this._contactsSubscription).subscribe(
        (contacts) => {
          this._contacts = contacts as Contact[];
          this._filtered = null;
          this.repopulate();
        }
      );

      Rx.Observable.fromQuery(DatabaseStore.findAll<ContactGroup>(ContactGroup)).subscribe(
        (groups) => {
          this._groups = groups;
          this._syncGroupPerspective();
          this.trigger();
        }
      );

      Rx.Observable.fromQuery(DatabaseStore.findAll<ContactBook>(ContactBook)).subscribe(
        (books) => {
          this._books = books;
          this.trigger();
        }
      );
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
    return this._filtered || [];
  }

  editing() {
    return this._editing;
  }

  setEditing(editing: string | 'new' | false) {
    this._editing = editing;
    this.trigger();
  }

  /** "All Contacts", unified or per-account, means address book entries. Addresses
  harvested from sent mail number in the thousands and carry whatever display name the
  sending client wrote, so they only appear under each account's "Found in Mail". */
  _queryForPerspective(perspective: ContactsPerspective) {
    const q = DatabaseStore.findAll<Contact>(Contact)
      .where(Contact.attributes.refs.greaterThan(0))
      .where(Contact.attributes.hidden.equal(false));

    if (perspective.type === 'all' || perspective.type === 'unified') {
      q.where(Contact.attributes.source.not('mail'));
    }
    if (perspective.type === 'group') {
      q.where(Contact.attributes.contactGroups.contains(perspective.groupId));
    }
    return q;
  }

  setPerspective(perspective: ContactsPerspective) {
    const q = this._queryForPerspective(perspective);

    this._filtered = null;
    this._perspective = perspective;
    this._search = '';

    if (q.sql() !== this._contactsSubscription.query().sql()) {
      this._contacts = [];
      this._contactsSubscription.replaceQuery(q);
    }
    this.repopulate();
  }

  /** Keeps the selected group's label current after a rename and leaves the group
  once it's been deleted, since the perspective holds a copy of the group's name. */
  _syncGroupPerspective() {
    const perspective = this._perspective;
    if (perspective.type !== 'group') return;

    const group = this._groups.find((g) => g.id === perspective.groupId);
    if (!group) {
      this.setPerspective({
        type: 'all',
        accountId: perspective.accountId,
        label: localized('All Contacts'),
      });
    } else if (group.name !== perspective.label) {
      this._perspective = { ...perspective, label: group.name };
    }
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
      filtered = filtered.filter((c) => {
        if (c.accountId !== perspective.accountId) return false;
        if (c.source !== 'mail' && perspective.type === 'found-in-mail') return false;
        if (c.source === 'mail' && perspective.type !== 'found-in-mail') return false;
        return true;
      });
    }
    if (this._search) {
      const isearch = this._search.toLowerCase();
      filtered = filtered.filter(
        (c) => c.name.toLowerCase().includes(isearch) || c.email.toLowerCase().includes(isearch)
      );
    }

    // note we do this in JS because in SQLite the order is not locale aware.
    const sortKeys = new Map(filtered.map((c) => [c, displayNameForContact(c)]));
    this._filtered = filtered.sort((a, b) => sortKeys.get(a).localeCompare(sortKeys.get(b)));
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
