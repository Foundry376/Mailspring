import vCard from 'vcf';
import { ContactInfoGoogle, ContactInfoVCF, Contact } from 'mailspring-exports';
import * as VCFHelpers from './VCFHelpers';

export interface ContactBase {
  name: {
    displayName: string;
    familyName?: string;
    givenName?: string;
    honorificPrefix?: string;
    honorificSuffix?: string;
  };
  photoURL?: string;
  nicknames?: { value: string }[];
  organizations?: { title?: string; name: string }[];
  phoneNumbers?: { value: string; formattedType?: string }[];
  emailAddresses?: { value: string; formattedType?: string }[];
  urls?: { value: string; formattedType?: string }[];
  relations?: { person: string; formattedType?: string }[];
  addresses?: {
    formattedValue: string;
    formattedType?: string;
    city: string;
    country: string;
    postalCode: string;
    region: string;
    streetAddress: string;
    extendedAddress: string;
  }[];
  birthdays?: { date: { year: number; month: number; day: number } }[];
}

export interface ContactInteractorMetadata {
  origin: string;
  readonly: boolean;
}

export interface ContactParseResult {
  metadata: ContactInteractorMetadata;
  data: ContactBase;
}

export function fromContact({ name, email }: Contact): ContactParseResult {
  const nameParts = name.split(' ');

  return {
    metadata: {
      origin: 'Found in Sent Mail',
      readonly: true,
    },
    data: {
      emailAddresses: [{ value: email }],
      name: {
        displayName: name,
        givenName: nameParts[0],
        familyName: nameParts.slice(1).join(' '),
      },
    },
  };
}

export function fromVCF(info: ContactInfoVCF): ContactParseResult {
  const card = new vCard().parse(info.vcf);
  const name = VCFHelpers.asSingle(card.get('n'));
  const org = VCFHelpers.asSingle(card.get('org'));
  const photo = VCFHelpers.asSingle(card.get('photo'));
  const title = VCFHelpers.asSingle(card.get('title'));
  const adrs = VCFHelpers.asArray(card.get('adr'));
  const tels = VCFHelpers.asArray(card.get('tel'));
  const emails = VCFHelpers.asArray(card.get('email'));
  const urls = VCFHelpers.asArray(card.get('url'));
  const bday = VCFHelpers.asSingle(card.get('bday'));

  let photoURL = photo ? photo._data : undefined;
  if (photoURL && new URL(photoURL).host.endsWith('contacts.icloud.com')) {
    // connecting to iCloud for contact photos requires authentication
    // and it's difficult to reach from here.
    photoURL = undefined;
  }

  let nameParts = (name ? name._data : '').split(';');

  return {
    metadata: {
      origin: 'CardDAV',
      readonly: false,
    },
    data: {
      name: {
        givenName: nameParts[0],
        familyName: nameParts.slice(1).join(' '),
        displayName: nameParts.join(' '),
      },
      photoURL,
      organizations: org
        ? [
            {
              name: VCFHelpers.removeRandomSemicolons(org._data),
              title: title ? VCFHelpers.removeRandomSemicolons(title._data) : undefined,
            },
          ]
        : undefined,
      phoneNumbers: VCFHelpers.parseValueAndTypeCollection(tels),
      emailAddresses: VCFHelpers.parseValueAndTypeCollection(emails),
      urls: VCFHelpers.parseValueAndTypeCollection(urls),
      addresses: adrs.length > 0 && adrs.map(item => VCFHelpers.parseAddress(item)),
      birthdays:
        bday && bday.value === 'date'
          ? [{ date: VCFHelpers.parseBirthday(bday._data) }]
          : undefined,
    },
  };
}

export function fromGoogle(info: ContactInfoGoogle): ContactParseResult {
  return {
    metadata: {
      origin: 'Google Contacts',
      readonly: false,
    },
    data: Object.assign({
      name: info.names[0],
      ...info,
    }),
  };
}

export function parse(contact: Contact): ContactParseResult {
  return !contact.info
    ? fromContact(contact)
    : 'vcf' in contact.info
    ? fromVCF(contact.info)
    : fromGoogle(contact.info);
}
