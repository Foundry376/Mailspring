import { Contact } from 'mailspring-exports';
import { apply, parse } from '../lib/ContactInfoMapping';

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
  });
});
