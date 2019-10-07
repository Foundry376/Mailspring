import vCard from 'vcf';
import { ContactInfoGoogle, ContactInfoVCF, Contact, Utils } from 'mailspring-exports';
import * as VCFHelpers from './VCFHelpers';

export interface ContactBase {
  name: {
    displayName: string;
    familyName: string;
    givenName: string;
    honorificPrefix: string;
    honorificSuffix: string;
  };
  photoURL?: string;
  nicknames?: { value: string }[];
  company: string;
  title: string;
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

function safeParseVCF(vcf: string) {
  // normalize \n line endings to \r\n
  vcf = vcf.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

  // ensure the VERSION line is the first line after BEGIN.
  // FastMail (and maybe others) do not honor the spec's order.
  const version = vcf.match(/\r\nVERSION:[ \d.]+\r\n/)[0];
  vcf = vcf.replace(/\r\nVERSION:[ \d.]+\r\n/, '\r\n');
  vcf = vcf.replace(`BEGIN:VCARD\r\n`, `BEGIN:VCARD${version}`);
  return new vCard().parse(vcf);
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
      title: '',
      company: '',
      name: {
        displayName: name,
        givenName: nameParts[0],
        familyName: nameParts.slice(1).join(' '),
        honorificPrefix: '',
        honorificSuffix: '',
      },
    },
  };
}

export function fromVCF(info: ContactInfoVCF): ContactParseResult {
  const card = safeParseVCF(info.vcf);
  const name = VCFHelpers.asSingle(card.get('n'));
  const org = VCFHelpers.asSingle(card.get('org'));
  const photo = VCFHelpers.asSingle(card.get('photo'));
  const title = VCFHelpers.asSingle(card.get('title'));
  const nicknames = VCFHelpers.asArray(card.get('nickname'));
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
        givenName: nameParts[1] || '',
        familyName: nameParts[0] || '',
        honorificPrefix: nameParts[3] || '',
        honorificSuffix: nameParts[4] || '',
        displayName: `${nameParts[3] || ''} ${nameParts[1]} ${nameParts[0]} ${nameParts[4] ||
          ''}`.trim(),
      },
      nicknames: VCFHelpers.parseValueAndTypeCollection(nicknames),
      title: title ? VCFHelpers.removeRandomSemicolons(title._data) : '',
      company: org ? org._data.split(';')[0] : '',
      phoneNumbers: VCFHelpers.parseValueAndTypeCollection(tels),
      emailAddresses: VCFHelpers.parseValueAndTypeCollection(emails),
      urls: VCFHelpers.parseValueAndTypeCollection(urls),
      addresses: adrs.length > 0 && adrs.map(item => VCFHelpers.parseAddress(item)),
      birthdays:
        bday && (!bday.value || bday.value === 'date')
          ? [{ date: VCFHelpers.parseBirthday(bday._data) }]
          : undefined,
    },
  };
}

export function applyToVCF(contact: Contact, changes: Partial<ContactBase>) {
  if (!('vcf' in contact.info)) {
    throw new Error('applyToVCF invoked with wrong contact type.');
  }
  const card = safeParseVCF(contact.info.vcf);
  for (const key of Object.keys(changes)) {
    if (key === 'name') {
      const name = card.get('n');
      const nameParts = (name ? name._data : ';;;;').split(';');
      nameParts[0] = changes.name.familyName;
      nameParts[1] = changes.name.givenName;
      card.set('n', nameParts.join(';'));

      const displayName = `${changes.name.givenName} ${changes.name.familyName}`;
      card.set('fn', displayName);
      contact.name = displayName;
    } else if (key === 'title') {
      card.add('title', changes.title);
    } else if (key === 'company') {
      const org = VCFHelpers.asSingle(card.get('org')) as any;
      if (org) {
        const parts = org._data.split(';');
        parts[0] = changes.company;
        org._data = parts.join(';');
      } else {
        card.set('org', changes.company);
      }
    } else if (key === 'nicknames') {
      VCFHelpers.setArray('nickname', card, changes.nicknames);
    } else if (key === 'phoneNumbers' || key === 'emailAddresses' || key === 'urls') {
      const attr = { phoneNumbers: 'tel', emailAddresses: 'email', urls: 'url' }[key];
      VCFHelpers.setArray(attr, card, changes[key]);
    } else if (key === 'birthdays') {
      VCFHelpers.setArray('bday', card, changes.birthdays.map(VCFHelpers.serializeBirthday));
    } else if (key === 'addresses') {
      VCFHelpers.setArray('adr', card, changes[key].map(VCFHelpers.serializeAddress));
    } else {
      console.log(`Unsure of how to apply changes to ${key}`);
    }
  }
  contact.info = Object.assign(contact.info, { vcf: card.toString().replace(/\n/g, '\r\n') });
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

export function applyToGoogle(contact: Contact, changes: Partial<ContactBase>) {
  if (!('resourceName' in contact.info)) {
    throw new Error('applyToGoogle invoked with wrong contact type.');
  }
  for (const key of Object.keys(changes)) {
    if (key === 'name') {
      Object.assign(contact.info.names[0], changes.name);
    } else {
      contact.info[key] = changes[key];
    }
  }
}

export function parse(contact: Contact): ContactParseResult {
  try {
    return !contact.info
      ? fromContact(contact)
      : 'vcf' in contact.info
      ? fromVCF(contact.info)
      : fromGoogle(contact.info);
  } catch (err) {
    console.warn(`Parsing of contact ${contact.email} failed: ${err.toString()}`);
    return fromContact(contact);
  }
}

export function apply(contact: Contact, nextData: ContactBase) {
  const originalData = parse(contact).data;
  const changedData: Partial<ContactBase> = {};

  for (const key of Object.keys(nextData)) {
    if (Utils.isEqual(nextData[key], originalData[key])) continue;
    changedData[key] = nextData[key];
  }

  const next = contact.clone();
  try {
    if (!contact.info) {
      // readonly
    } else if ('vcf' in contact.info) {
      applyToVCF(next, changedData);
    } else {
      applyToGoogle(next, changedData);
    }
  } catch (err) {
    console.warn(`Applying changes to contact ${contact.email} failed: ${err.toString()}`);
  }
  return next;
}
