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
});
