import MailspringStore from 'mailspring-store';
import { Contact } from '../models/contact';
import RegExpUtils from '../../regexp-utils';
import DatabaseStore from './database-store';
import { AccountStore } from './account-store';
import ComponentRegistry from '../../registries/component-registry';
import { ContactGroup } from 'mailspring-exports';

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

    // Note that we ask for LIMIT * accountCount because we want to
    // return contacts with distinct email addresses, and the same contact
    // could exist in every account. Rather than make SQLite do a SELECT DISTINCT
    // (which is very slow), we just ask for more items.
    const query = DatabaseStore.findAll<Contact>(Contact)
      .search(search)
      .limit(limit * accountCount)
      .where(Contact.attributes.refs.greaterThan(0))
      .where(Contact.attributes.hidden.equal(false))
      .order(Contact.attributes.refs.descending());

    return (query.then(async _results => {
      let results = this._distinctByEmail(this._omitFindInMailDisabled(_results));
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
      .where(Contact.attributes.refs.greaterThan(0))
      .where(Contact.attributes.hidden.equal(false))
      .order(Contact.attributes.refs.descending())
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
