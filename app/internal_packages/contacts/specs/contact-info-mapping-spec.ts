import { Contact } from 'mailspring-exports';
import { apply, parse } from '../lib/ContactInfoMapping';
import { vcfContactAsGraphContact, vcfStringToContacts } from '../lib/VCFImportExport';

const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'UID:abc',
  'N:Smith;Jane;;;',
  'FN:Jane Smith',
  'TITLE:Engineer',
  'EMAIL;TYPE=work:jane@work.com',
  'TEL;TYPE=cell:555-1234',
  'END:VCARD',
  '',
].join('\r\n');

function vcfContact() {
  return new Contact({
    id: 'c1',
    accountId: 'a1',
    source: 'carddav',
    name: 'Jane Smith',
    email: 'jane@work.com',
    info: { vcf: VCF, href: '' },
  });
}

function googleContact() {
  return new Contact({
    id: 'c2',
    accountId: 'a1',
    source: 'gpeople',
    name: 'Jane Smith',
    email: 'jane@work.com',
    info: {
      resourceName: 'people/1',
      etag: '',
      names: [{ givenName: 'Jane', familyName: 'Smith', displayName: 'Jane Smith' } as any],
      emailAddresses: [{ value: 'jane@work.com', type: 'work' } as any],
      photos: [
        { default: true, url: 'https://example.com/monogram.png' } as any,
        { default: false, url: 'https://example.com/real.png' } as any,
      ],
    },
  });
}

// As the sync engine stores it, from what an Office 365 tenant returned on 2026-11-11.
function graphContact() {
  return new Contact({
    id: 'c3',
    accountId: 'a1',
    source: 'graph',
    name: 'Dr. Ada K Lovelace Jr.',
    email: 'ada@example.com',
    info: {
      id: 'AAkALg=',
      changeKey: 'EQAAABYA',
      displayName: 'Dr. Ada K Lovelace Jr.',
      givenName: 'Ada',
      middleName: 'K',
      surname: 'Lovelace',
      title: 'Dr.',
      generation: 'Jr.',
      nickName: 'Countess',
      emailAddresses: [
        { name: 'Ada Lovelace', address: 'ada@example.com' },
        { name: 'Ada (work)', address: 'ada.work@example.org' },
      ],
      businessPhones: ['+1 555 0100'],
      homePhones: ['+1 555 0101'],
      mobilePhone: '+1 555 0102',
      jobTitle: 'Analyst',
      companyName: 'Analytical Engines',
      homeAddress: {
        street: '1 St James Sq\nFlat 2',
        city: 'London',
        state: '',
        postalCode: 'SW1',
        countryOrRegion: 'UK',
      },
      businessAddress: {},
      otherAddress: {},
      businessHomePage: 'https://example.com/ada',
      birthday: '1815-12-10T11:59:00Z',
      personalNotes: 'First programmer.',
      spouseName: 'William',
      children: ['Byron', 'Anne'],
    },
  });
}

describe('ContactInfoMapping', function () {
  describe('applyToVCF', () => {
    it('replaces the title instead of appending another TITLE line', () => {
      const contact = vcfContact();
      const { data } = parse(contact);
      const next = apply(contact, { ...data, title: 'Manager' });
      const vcf = (next.info as any).vcf as string;
      expect(vcf.match(/^TITLE/gm).length).toBe(1);
      expect(parse(next).data.title).toBe('Manager');
    });

    it('updates the contact email when the first email address changes', () => {
      const contact = vcfContact();
      const { data } = parse(contact);
      const next = apply(contact, { ...data, emailAddresses: [{ value: 'jane@new.com' }] });
      expect(next.email).toBe('jane@new.com');
    });

    it('removes every phone number when the list is emptied', () => {
      const contact = vcfContact();
      const { data } = parse(contact);
      const next = apply(contact, { ...data, phoneNumbers: [] });
      expect((next.info as any).vcf).not.toContain('TEL');
    });
  });

  describe('Google People', () => {
    it('uses the first non-default photo', () => {
      expect(parse(googleContact()).data.photoURL).toBe('https://example.com/real.png');
    });

    it('applies later changes when every email address is removed', () => {
      const contact = googleContact();
      const { data } = parse(contact);
      const next = apply(contact, { ...data, emailAddresses: [], title: 'Manager' });
      expect(next.email).toBe('');
      expect((next.info as any).organizations[0].title).toBe('Manager');
    });
  });

  describe('Microsoft Graph', () => {
    it('reads each Outlook slot as a labelled entry', () => {
      const { data, metadata } = parse(graphContact());
      expect(metadata.readonly).toBe(false);
      expect(metadata.limits.emailAddresses).toBe(3);
      expect(data.name).toEqual({
        displayName: 'Dr. Ada K Lovelace Jr.',
        givenName: 'Ada',
        familyName: 'Lovelace',
        honorificPrefix: 'Dr.',
        honorificSuffix: 'Jr.',
        middleName: 'K',
      });
      expect(data.emailAddresses.map((e) => e.value)).toEqual([
        'ada@example.com',
        'ada.work@example.org',
      ]);
      expect(data.phoneNumbers).toEqual([
        { value: '+1 555 0102', type: 'Mobile' },
        { value: '+1 555 0100', type: 'Work' },
        { value: '+1 555 0101', type: 'Home' },
      ]);
      expect(data.addresses.length).toBe(1);
      const [home] = data.addresses;
      expect([
        home.type,
        home.streetAddress,
        home.extendedAddress,
        home.city,
        home.country,
      ]).toEqual(['Home', '1 St James Sq', 'Flat 2', 'London', 'UK']);
      expect(data.birthdays).toEqual([{ date: { year: 1815, month: 12, day: 10 } }]);
      expect(data.relations).toEqual([
        { person: 'William', type: 'Spouse' },
        { person: 'Byron', type: 'Child' },
        { person: 'Anne', type: 'Child' },
      ]);
      expect(data.urls).toEqual([{ value: 'https://example.com/ada', type: 'Work' }]);
      expect(data.notes).toBe('First programmer.');
    });

    it('reads a birthday in 1604 as one without a year, as Outlook stores it', () => {
      const contact = graphContact();
      (contact.info as any).birthday = '1604-03-02T11:59:00Z';
      expect(parse(contact).data.birthdays).toEqual([{ date: { year: null, month: 3, day: 2 } }]);
    });

    it('rewrites only the fields behind the parts that changed', () => {
      const contact = graphContact();
      const before = JSON.parse(JSON.stringify(contact.info));
      const { data } = parse(contact);
      const next = apply(contact, { ...data, title: 'Programmer' });
      const changed = Object.keys(next.info).filter(
        (k) => JSON.stringify(next.info[k]) !== JSON.stringify(before[k])
      );
      expect(changed).toEqual(['jobTitle']);
      expect(contact.info).toEqual(before);
    });

    it("keeps each address's display name and sets the contact's email", () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, {
        ...data,
        emailAddresses: [{ value: 'ada.work@example.org' }, { value: 'new@example.com' }],
      });
      expect((next.info as any).emailAddresses).toEqual([
        { name: 'Ada (work)', address: 'ada.work@example.org' },
        { name: 'Dr. Ada K Lovelace Jr.', address: 'new@example.com' },
      ]);
      expect(next.email).toBe('ada.work@example.org');
    });

    it('puts phones in the slot their label names, and the rest in free slots', () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, {
        ...data,
        phoneNumbers: [
          { value: '1', type: 'home' },
          { value: '2', type: 'Pager' },
          { value: '3', type: 'Home' },
          { value: '4', type: 'Home' },
        ],
      });
      const info = next.info as any;
      expect(info.homePhones).toEqual(['1', '3']);
      expect(info.mobilePhone).toBe('2');
      expect(info.businessPhones).toEqual(['4']);
    });

    it('clears a removed address with an empty object, which is how Graph clears one', () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, {
        ...data,
        addresses: [{ ...data.addresses[0], type: 'Work', extendedAddress: '' }],
      });
      const info = next.info as any;
      expect(info.homeAddress).toEqual({});
      expect(info.businessAddress).toEqual({
        street: '1 St James Sq',
        city: 'London',
        state: '',
        postalCode: 'SW1',
        countryOrRegion: 'UK',
      });
    });

    it('writes a birthday without a year in 1604', () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, {
        ...data,
        birthdays: [{ date: { year: null, month: 7, day: 4 } }],
      });
      expect((next.info as any).birthday).toBe('1604-07-04T11:59:00Z');
    });

    it('maps relations to the spouse, manager, assistant and children fields', () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, {
        ...data,
        relations: [
          { person: 'Charles', type: 'Manager' },
          { person: 'Byron', type: 'Child' },
        ],
      });
      const info = next.info as any;
      expect(info.spouseName).toBe(null);
      expect(info.manager).toBe('Charles');
      expect(info.children).toEqual(['Byron']);
    });

    it('matches relation labels in any case and skips rows with no person', () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, {
        ...data,
        relations: [
          { person: 'Charles', type: 'manager' },
          { person: '', type: 'Spouse' },
          { person: 'Byron', type: 'child ' },
        ],
      });
      const info = next.info as any;
      expect(info.manager).toBe('Charles');
      expect(info.spouseName).toBe(null);
      expect(info.children).toEqual(['Byron']);
    });

    it('offers only the labels Graph has a field for, and none for emails and web pages', () => {
      expect(parse(graphContact()).metadata.fixedTypes).toEqual({
        phoneNumbers: { Mobile: 1, Work: 2, Home: 2 },
        addresses: { Home: 1, Work: 1, Other: 1 },
        relations: { Spouse: 1, Child: Infinity, Manager: 1, Assistant: 1 },
        emailAddresses: {},
        urls: {},
      });
    });

    it('reads a birthday another client stored at local midnight as its own date', () => {
      const contact = graphContact();
      (contact.info as any).birthday = '1980-01-14T23:00:00Z';
      expect(parse(contact).data.birthdays).toEqual([{ date: { year: 1980, month: 1, day: 15 } }]);
    });

    it('keeps the stored birthday instead of writing an impossible date', () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, {
        ...data,
        birthdays: [{ date: { year: 1990, month: 2, day: 30 } }],
      });
      expect((next.info as any).birthday).toBe('1815-12-10T11:59:00Z');
    });

    it('composes the display name from every name part, as Exchange does', () => {
      const contact = graphContact();
      const { data } = parse(contact);
      const next = apply(contact, { ...data, name: { ...data.name, givenName: 'Augusta' } });
      expect((next.info as any).displayName).toBe('Dr. Augusta K Lovelace Jr.');
      expect(next.name).toBe('Dr. Augusta K Lovelace Jr.');
      expect((next.info as any).middleName).toBe('K');
    });

    it('keeps a display name the user chose when a name part changes', () => {
      const contact = graphContact();
      (contact.info as any).displayName = 'Countess';
      const { data } = parse(contact);
      const next = apply(contact, { ...data, name: { ...data.name, familyName: 'King' } });
      expect((next.info as any).displayName).toBe('Countess');
      expect((next.info as any).surname).toBe('King');
    });

    it('imports a vCard without an address or birthday into an Outlook contact', () => {
      const [card] = vcfStringToContacts(
        'BEGIN:VCARD\nVERSION:3.0\nFN:Alan Turing\nN:Turing;Alan;;;\n' +
          'EMAIL:alan@example.com\nTEL;TYPE=CELL:+44 1234\nEND:VCARD\n',
        'acct'
      );
      const graph = vcfContactAsGraphContact(card, 'acct');
      const info = graph.info as any;
      expect(graph.source).toBe('graph');
      expect(info.displayName).toBe('Alan Turing');
      expect(info.givenName).toBe('Alan');
      expect(info.surname).toBe('Turing');
      expect(info.emailAddresses).toEqual([{ address: 'alan@example.com', name: 'Alan Turing' }]);
      expect(info.mobilePhone).toBe('+44 1234');
      expect(info.birthday).toBe(undefined);
      expect(info.homeAddress).toBe(undefined);
    });

    it("imports a vCard's escaped text, FN, basic-format birthday and CELL phone", () => {
      const [card] = vcfStringToContacts(
        [
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Acme\\, Inc.',
          'N:;;;;',
          'ORG:Acme\\, Inc.',
          'TITLE:Sales\\; Support',
          'NOTE:Line one\\nLine two',
          'ADR;TYPE=WORK:;;1 Main St\\, Suite 4;Springfield;IL;62701;USA',
          'BDAY;VALUE=DATE:19800115',
          'TEL;TYPE=HOME:1',
          'TEL;TYPE=HOME:2',
          'TEL;TYPE=HOME:3',
          'TEL;TYPE=CELL:4',
          'EMAIL:sales@acme.example',
          'END:VCARD',
          '',
        ].join('\n'),
        'acct'
      );
      const graph = vcfContactAsGraphContact(card, 'acct');
      const info = graph.info as any;
      expect(info.displayName).toBe('Acme, Inc.');
      expect(graph.name).toBe('Acme, Inc.');
      expect(info.companyName).toBe('Acme, Inc.');
      expect(info.jobTitle).toBe('Sales; Support');
      expect(info.personalNotes).toBe('Line one\nLine two');
      expect(info.businessAddress.street).toBe('1 Main St, Suite 4');
      expect(info.birthday).toBe('1980-01-15T11:59:00Z');
      expect(info.mobilePhone).toBe('4');
      expect(info.homePhones).toEqual(['1', '2']);
      expect(info.businessPhones).toEqual(['3']);
    });
  });
});
