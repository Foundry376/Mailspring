import _ from 'underscore';
import { Contact } from '../../src/flux/models/contact';
import ContactStore from '../../src/flux/stores/contact-store';

xdescribe('ContactStore', function() {
  beforeEach(function() {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    ContactStore._contactCache = [];
    ContactStore._fetchOffset = 0;
    ContactStore._accountId = null;
  });

  describe('when searching for a contact', function() {
    beforeEach(function() {
      this.c1 = new Contact({ name: '', email: '1test@mailspring.com', refs: 7 });
      this.c2 = new Contact({ name: 'First', email: '2test@mailspring.com', refs: 6 });
      this.c3 = new Contact({ name: 'First Last', email: '3test@mailspring.com', refs: 5 });
      this.c4 = new Contact({ name: 'Fit', email: 'fit@mailspring.com', refs: 4 });
      this.c5 = new Contact({ name: 'Fins', email: 'fins@mailspring.com', refs: 3 });
      this.c6 = new Contact({ name: 'Fill', email: 'fill@mailspring.com', refs: 2 });
      this.c7 = new Contact({ name: 'Fin', email: 'fin@mailspring.com', refs: 1 });
    });

    it('can find by first name', function() {
      waitsForPromise(() => {
        return ContactStore.searchContacts('First').then(results => {
          expect(results.length).toBe(2);
          expect(results[0]).toBe(this.c2);
          expect(results[1]).toBe(this.c3);
        });
      });
    });

    it('can find by last name', function() {
      waitsForPromise(() => {
        return ContactStore.searchContacts('Last').then(results => {
          expect(results.length).toBe(1);
          expect(results[0]).toBe(this.c3);
        });
      });
    });

    it('can find by email', function() {
      waitsForPromise(() => {
        return ContactStore.searchContacts('1test').then(results => {
          expect(results.length).toBe(1);
          expect(results[0]).toBe(this.c1);
        });
      });
    });

    it('is case insensitive', function() {
      waitsForPromise(() => {
        return ContactStore.searchContacts('FIrsT').then(results => {
          expect(results.length).toBe(2);
          expect(results[0]).toBe(this.c2);
          expect(results[1]).toBe(this.c3);
        });
      });
    });

    it('only returns the number requested', function() {
      waitsForPromise(() => {
        return ContactStore.searchContacts('FIrsT', { limit: 1 }).then(results => {
          expect(results.length).toBe(1);
          expect(results[0]).toBe(this.c2);
        });
      });
    });

    it('returns no more than 5 by default', () =>
      waitsForPromise(() => {
        return ContactStore.searchContacts('fi').then(results => {
          expect(results.length).toBe(5);
        });
      }));

    it('can return more than 5 if requested', () =>
      waitsForPromise(() => {
        return ContactStore.searchContacts('fi', { limit: 6 }).then(results => {
          expect(results.length).toBe(6);
        });
      }));
  });

  describe('isValidContact', function() {
    it('should call contact.isValid', function() {
      const contact = new Contact();
      spyOn(contact, 'isValid').andReturn(true);
      expect(ContactStore.isValidContact(contact)).toBe(true);
    });

    it('should return false for non-Contact objects', () =>
      expect(ContactStore.isValidContact({ name: 'Ben', email: 'ben@mailspring.com' })).toBe(false));

    it("returns false if we're not passed a contact", () =>
      expect(ContactStore.isValidContact()).toBe(false));
  });

  describe('parseContactsInString', function() {
    const testCases = {
      // Single contact test cases
      'evan@mailspring.com': [new Contact({ name: 'evan@mailspring.com', email: 'evan@mailspring.com' })],
      'Evan Morikawa': [],
      "'evan@mailspring.com'": [new Contact({ name: 'evan@mailspring.com', email: 'evan@mailspring.com' })],
      '"evan@mailspring.com"': [new Contact({ name: 'evan@mailspring.com', email: 'evan@mailspring.com' })],
      "'evan@mailspring.com": [new Contact({ name: "'evan@mailspring.com", email: "'evan@mailspring.com" })],
      'Evan Morikawa <evan@mailspring.com>': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@mailspring.com' }),
      ],
      'Evan Morikawa (evan@mailspring.com)': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@mailspring.com' }),
      ],
      'spang (Christine Spang) <noreply+phabricator@nilas.com>': [
        new Contact({ name: 'spang (Christine Spang)', email: 'noreply+phabricator@nilas.com' }),
      ],
      "spang 'Christine Spang' <noreply+phabricator@nilas.com>": [
        new Contact({ name: "spang 'Christine Spang'", email: 'noreply+phabricator@nilas.com' }),
      ],
      'spang "Christine Spang" <noreply+phabricator@nilas.com>': [
        new Contact({ name: 'spang "Christine Spang"', email: 'noreply+phabricator@nilas.com' }),
      ],
      'Evan (evan@mailspring.com)': [new Contact({ name: 'Evan', email: 'evan@mailspring.com' })],
      '"Michael" (mg@mailspring.com)': [new Contact({ name: 'Michael', email: 'mg@mailspring.com' })],
      'announce-uc.1440659566.kankcagcmaacemjlnoma-security=mailspring.com@lists.openwall.com': [
        new Contact({
          name: 'announce-uc.1440659566.kankcagcmaacemjlnoma-security=mailspring.com@lists.openwall.com',
          email:
            'announce-uc.1440659566.kankcagcmaacemjlnoma-security=mailspring.com@lists.openwall.com',
        }),
      ],

      // Multiple contact test cases
      'Evan Morikawa <evan@mailspring.com>, Ben <ben@mailspring.com>': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@mailspring.com' }),
        new Contact({ name: 'Ben', email: 'ben@mailspring.com' }),
      ],
      'Evan Morikawa <evan@mailspring.com>; Ben <ben@mailspring.com>': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@mailspring.com' }),
        new Contact({ name: 'Ben', email: 'ben@mailspring.com' }),
      ],
      'mark@mailspring.com\nGleb (gleb@mailspring.com)\rEvan Morikawa <evan@mailspring.com>, spang (Christine Spang) <noreply+phabricator@nilas.com>': [
        new Contact({ name: '', email: 'mark@mailspring.com' }),
        new Contact({ name: 'Gleb', email: 'gleb@mailspring.com' }),
        new Contact({ name: 'Evan Morikawa', email: 'evan@mailspring.com' }),
        new Contact({ name: 'spang (Christine Spang)', email: 'noreply+phabricator@nilas.com' }),
      ],
    };

    _.forEach(testCases, (value, key) =>
      it(`works for ${key}`, () =>
        waitsForPromise(() =>
          ContactStore.parseContactsInString(key).then(function(contacts) {
            contacts = contacts.map(c => c.toString());
            const expectedContacts = value.map(c => c.toString());
            expect(contacts).toEqual(expectedContacts);
          })
        ))
    );
  });
});
