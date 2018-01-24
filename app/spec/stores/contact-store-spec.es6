const _ = require('underscore');
const Contact = require('../../src/flux/models/contact').default;
const ContactStore = require('../../src/flux/stores/contact-store').default;

xdescribe('ContactStore', function() {
  beforeEach(function() {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    ContactStore._contactCache = [];
    ContactStore._fetchOffset = 0;
    ContactStore._accountId = null;
  });

  describe('when searching for a contact', function() {
    beforeEach(function() {
      this.c1 = new Contact({ name: '', email: '1test@nylas.com', refs: 7 });
      this.c2 = new Contact({ name: 'First', email: '2test@nylas.com', refs: 6 });
      this.c3 = new Contact({ name: 'First Last', email: '3test@nylas.com', refs: 5 });
      this.c4 = new Contact({ name: 'Fit', email: 'fit@nylas.com', refs: 4 });
      this.c5 = new Contact({ name: 'Fins', email: 'fins@nylas.com', refs: 3 });
      this.c6 = new Contact({ name: 'Fill', email: 'fill@nylas.com', refs: 2 });
      this.c7 = new Contact({ name: 'Fin', email: 'fin@nylas.com', refs: 1 });
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
      expect(ContactStore.isValidContact({ name: 'Ben', email: 'ben@nylas.com' })).toBe(false));

    it("returns false if we're not passed a contact", () =>
      expect(ContactStore.isValidContact()).toBe(false));
  });

  describe('parseContactsInString', function() {
    const testCases = {
      // Single contact test cases
      'evan@nylas.com': [new Contact({ name: 'evan@nylas.com', email: 'evan@nylas.com' })],
      'Evan Morikawa': [],
      "'evan@nylas.com'": [new Contact({ name: 'evan@nylas.com', email: 'evan@nylas.com' })],
      '"evan@nylas.com"': [new Contact({ name: 'evan@nylas.com', email: 'evan@nylas.com' })],
      "'evan@nylas.com": [new Contact({ name: "'evan@nylas.com", email: "'evan@nylas.com" })],
      'Evan Morikawa <evan@nylas.com>': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@nylas.com' }),
      ],
      'Evan Morikawa (evan@nylas.com)': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@nylas.com' }),
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
      'Evan (evan@nylas.com)': [new Contact({ name: 'Evan', email: 'evan@nylas.com' })],
      '"Michael" (mg@nylas.com)': [new Contact({ name: 'Michael', email: 'mg@nylas.com' })],
      'announce-uc.1440659566.kankcagcmaacemjlnoma-security=nylas.com@lists.openwall.com': [
        new Contact({
          name: 'announce-uc.1440659566.kankcagcmaacemjlnoma-security=nylas.com@lists.openwall.com',
          email:
            'announce-uc.1440659566.kankcagcmaacemjlnoma-security=nylas.com@lists.openwall.com',
        }),
      ],

      // Multiple contact test cases
      'Evan Morikawa <evan@nylas.com>, Ben <ben@nylas.com>': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@nylas.com' }),
        new Contact({ name: 'Ben', email: 'ben@nylas.com' }),
      ],
      'Evan Morikawa <evan@nylas.com>; Ben <ben@nylas.com>': [
        new Contact({ name: 'Evan Morikawa', email: 'evan@nylas.com' }),
        new Contact({ name: 'Ben', email: 'ben@nylas.com' }),
      ],
      'mark@nylas.com\nGleb (gleb@nylas.com)\rEvan Morikawa <evan@nylas.com>, spang (Christine Spang) <noreply+phabricator@nilas.com>': [
        new Contact({ name: '', email: 'mark@nylas.com' }),
        new Contact({ name: 'Gleb', email: 'gleb@nylas.com' }),
        new Contact({ name: 'Evan Morikawa', email: 'evan@nylas.com' }),
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
