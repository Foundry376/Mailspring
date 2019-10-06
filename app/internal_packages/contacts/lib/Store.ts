import Rx from 'rx-lite';
import { DatabaseStore, Contact, ContactGroup, MutableQuerySubscription } from 'mailspring-exports';
import MailspringStore from 'mailspring-store';
import { ListTabular } from 'mailspring-component-kit';

class ContactsWindowStore extends MailspringStore {
  _perspective: ContactsPerspective | null = null;
  _listSource = new ListTabular.DataSource.DumbArrayDataSource<Contact>();

  _contacts: Contact[] = [];
  _contactsSubscription: MutableQuerySubscription<Contact>;
  _groups: ContactGroup[] = [];
  _search: string = '';
  _filtered: Contact[] | null = null;
  _editing: boolean;

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

      const groups = Rx.Observable.fromQuery(DatabaseStore.findAll<ContactGroup>(ContactGroup));
      groups.subscribe(groups => {
        this._groups = groups;
        this.trigger();
      });
    });
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

  setEditing(editing: boolean) {
    this._editing = editing;
    this.trigger();
  }

  setPerspective(perspective: ContactsPerspective | null) {
    let q = DatabaseStore.findAll<Contact>(Contact)
      .where(Contact.attributes.refs.greaterThan(0))
      .where(Contact.attributes.hidden.equal(false));

    if (perspective && perspective.type === 'all') {
      q.where(Contact.attributes.source.not('mail'));
    }
    if (perspective && perspective.type === 'group') {
      q.where(Contact.attributes.contactGroups.contains(perspective.groupId));
    }

    this._filtered = null;
    this._perspective = perspective;

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
    let filtered = [...this._contacts];

    if (this._perspective) {
      filtered = filtered.filter(c => {
        if (c.accountId !== this._perspective.accountId) return false;
        if (c.source !== 'mail' && this._perspective.type === 'found-in-mail') return false;
        if (c.source === 'mail' && this._perspective.type !== 'found-in-mail') return false;
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

export type ContactsPerspective =
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
