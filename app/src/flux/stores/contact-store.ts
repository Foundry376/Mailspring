import MailspringStore from 'mailspring-store';
import { Contact } from '../models/contact';
import RegExpUtils from '../../regexp-utils';
import DatabaseStore from './database-store';
import { AccountStore } from './account-store';
import ComponentRegistry from '../../registries/component-registry';
import { ContactGroup, Matcher } from 'mailspring-exports';
import { parse as parseContactInfo } from '../../../internal_packages/contacts/lib/ContactInfoMapping';

/** Match mail-derived contacts (refs) and address-book rows (CardDAV / Google) for composer lookup. */
const contactQueryableForComposer = new Matcher.Or([
  Contact.attributes.refs.greaterThan(0),
  Contact.attributes.source.in(['carddav', 'gpeople']),
]);

/**
Public: ContactStore provides convenience methods for searching contacts and
formatting contacts. When Contacts become editable, this store will be expanded
with additional actions.

Section: Stores
*/
class ContactStore extends MailspringStore {
  async searchContactGroups(_search: string) {
    const search = _search.toLowerCase();

    if (!search || search.length === 0) {
      return [];
    }

    const groups = await DatabaseStore.findAll<ContactGroup>(ContactGroup);
    return groups.filter(g => g.name.toLowerCase().startsWith(search)).slice(0, 4);
  }

  // Public: Search the user's contact list for the given search term.
  // This method compares the `search` string against each Contact's
  // `name` and `email`.
  //
  // - `search` {String} A search phrase, such as `ben@n` or `Ben G`
  // - `options` (optional) {Object} If you will only be displaying a few results,
  //   you should pass a limit value. {::searchContacts} will return as soon
  //   as `limit` matches have been found.
  //
  // Returns an {Array} of matching {Contact} models
  //
  searchContacts(_search: string, options: { limit?: number } = {}) {
    const limit = Math.max(options.limit ? options.limit : 5, 0);
    const search = _search.toLowerCase();

    const accountCount = AccountStore.accounts().length;
    const extensions = ComponentRegistry.findComponentsMatching({
      role: 'ContactSearchResults',
    });

    if (!search || search.length === 0) {
      return Promise.resolve([]);
    }

    // FTS uses `ContactSearch` and works when the index is up to date. The `Contact`
    // table does not expose `name` / `email` as SQLite columns (they live in JSON),
    // so we cannot use SQL LIKE on those fields — filter inflated models in memory.
    const fetchCap = limit * accountCount;
    const matchesText = (c: Contact) => {
      const name = (c.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      if (name.includes(search) || email.includes(search)) {
        return true;
      }
      // CardDAV rows often keep FN/EMAIL only inside `info.vcf`; top-level name/email may be empty.
      try {
        const { data } = parseContactInfo(c);
        const display = (data.name?.displayName || '').toLowerCase();
        if (display.includes(search)) return true;
        const given = (data.name?.givenName || '').toLowerCase();
        const family = (data.name?.familyName || '').toLowerCase();
        if (given.includes(search) || family.includes(search)) return true;
        for (const ea of data.emailAddresses || []) {
          if ((ea.value || '').toLowerCase().includes(search)) return true;
        }
      } catch (_err) {
        // ignore parse failures
      }
      return false;
    };

    const ftsPromise = Promise.resolve(
      DatabaseStore.findAll<Contact>(Contact)
        .search(search)
        .limit(fetchCap)
        .where(contactQueryableForComposer)
        .where(Contact.attributes.hidden.equal(false))
        .order(Contact.attributes.refs.descending())
    ).catch((): Contact[] => []);

    // By-refs scan: good for mail-derived contacts with refs > 0.
    const scanLimit = Math.min(2500, Math.max(fetchCap * 40, 400));
    const scanQuery = DatabaseStore.findAll<Contact>(Contact)
      .limit(scanLimit)
      .where(contactQueryableForComposer)
      .where(Contact.attributes.hidden.equal(false))
      .order([Contact.attributes.refs.descending(), Contact.attributes.id.descending()])
      .then(rows => rows.filter(matchesText));

    // New CardDAV / Google contacts keep refs === 0 until used in mail; the refs-ordered
    // scan above never reaches them when the limit cuts off the tail. Scan recent
    // address-book rows by id so created contacts appear in To/CC autocomplete.
    const addressBookScanLimit = Math.min(1500, Math.max(fetchCap * 30, 300));
    const addressBookScan = DatabaseStore.findAll<Contact>(Contact)
      .limit(addressBookScanLimit)
      .where(Contact.attributes.source.in(['carddav', 'gpeople']))
      .where(Contact.attributes.hidden.equal(false))
      .order(Contact.attributes.id.descending())
      .then(rows => rows.filter(matchesText));

    return (Promise.all([ftsPromise, scanQuery, addressBookScan]).then(
      async ([ftsResults, scanResults, addressBookResults]) => {
      const merged = new Map<string, Contact>();
      for (const c of ftsResults) {
        merged.set(c.id, c);
      }
      for (const c of scanResults) {
        merged.set(c.id, c);
      }
      for (const c of addressBookResults) {
        merged.set(c.id, c);
      }
      let results = Array.from(merged.values());
      results.sort((a, b) => (b.refs || 0) - (a.refs || 0));
      results = this._distinctByEmail(this._omitFindInMailDisabled(results));
      for (const ext of extensions) {
        results = await ext.findAdditionalContacts(search, results);
      }
      if (results.length > limit) {
        results.length = limit;
      }
      return results;
    }) as any) as Promise<Contact[]>;
  }

  topContacts({ limit = 5 } = {}) {
    const accountCount = AccountStore.accounts().length;
    return DatabaseStore.findAll<Contact>(Contact)
      .limit(limit * accountCount)
      .where(contactQueryableForComposer)
      .where(Contact.attributes.hidden.equal(false))
      .order([Contact.attributes.refs.descending(), Contact.attributes.id.descending()])
      .then(async _results => {
        const results = this._distinctByEmail(this._omitFindInMailDisabled(_results));
        if (results.length > limit) {
          results.length = limit;
        }
        return results;
      });
  }

  isValidContact(contact) {
    return contact instanceof Contact ? contact.isValid() : false;
  }

  parseContactsInString(contactString, { skipNameLookup }: { skipNameLookup?: boolean } = {}) {
    const detected: Contact[] = [];
    const emailRegex = RegExpUtils.emailRegex();
    let lastMatchEnd = 0;
    let match = null;

    while ((match = emailRegex.exec(contactString))) {
      let email = match[0];
      let name = null;

      const startsWithQuote = ["'", '"'].includes(email[0]);
      const hasTrailingQuote = ["'", '"'].includes(contactString[match.index + email.length]);
      if (startsWithQuote && hasTrailingQuote) {
        email = email.slice(1, email.length - 1);
      }

      const hasLeadingParen = ['(', '<'].includes(contactString[match.index - 1]);
      const hasTrailingParen = [')', '>'].includes(contactString[match.index + email.length]);

      if (hasLeadingParen && hasTrailingParen) {
        let nameStart = lastMatchEnd;
        for (const char of [',', ';', '\n', '\r']) {
          const i = contactString.lastIndexOf(char, match.index);
          if (i + 1 > nameStart) {
            nameStart = i + 1;
          }
        }
        name = contactString.substr(nameStart, match.index - 1 - nameStart).trim();
      }

      // The "nameStart" for the next match must begin after lastMatchEnd
      lastMatchEnd = match.index + email.length;
      if (hasTrailingParen) {
        lastMatchEnd += 1;
      }

      if (!name || name.length === 0) {
        name = email;
      }

      // If the first and last character of the name are quotation marks, remove them
      if (['"', "'"].includes(name[0]) && ['"', "'"].includes(name[name.length - 1])) {
        name = name.slice(1, name.length - 1);
      }

      detected.push(new Contact({ email, name }));
    }

    if (skipNameLookup) {
      return Promise.resolve(detected);
    }

    return Promise.all<Contact>(
      detected.map(contact => {
        if (contact.name !== contact.email) {
          return contact;
        }
        return this.searchContacts(contact.email, { limit: 1 }).then(([smatch]) =>
          smatch && smatch.email === contact.email ? smatch : contact
        );
      })
    );
  }

  _omitFindInMailDisabled(results: Contact[]) {
    // remove results that the user has asked not to see. (Cheaper to do this in JS
    // than construct a WHERE clause that makes SQLite's index selection non-obvious.)
    const findInMailDisabled = AppEnv.config.get('core.contacts.findInMailDisabled');
    return results.filter(r => !(r.source === 'mail' && findInMailDisabled.includes(r.accountId)));
  }

  _distinctByEmail(contacts: Contact[]) {
    // remove query results that are duplicates, prefering ones that have names
    const uniq: { [email: string]: Contact } = {};
    for (const contact of contacts) {
      if (!contact.email) {
        continue;
      }
      const key = contact.email.toLowerCase();
      const existing = uniq[key];
      if (!existing || (!existing.name || existing.name === existing.email)) {
        uniq[key] = contact;
      }
    }
    return Object.values(uniq);
  }
}

export default new ContactStore();
