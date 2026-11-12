import vCard from 'vcf';
import {
  ContactInfoGoogle,
  ContactInfoGraph,
  ContactInfoGraphAddress,
  ContactInfoVCF,
  Contact,
  ContactBook,
  AccountStore,
  Utils,
} from 'mailspring-exports';
import * as VCFHelpers from './VCFHelpers';
import { displayNameForContact } from './ContactDisplayName';

/**
This file contains business logic that maps the "contact.info" formats (vCard, Google
People, Microsoft Graph) onto a shared "ContactBase" interface. This sucks, but it's much
easier to implement in JS than in the sync engine, and necessary because Google's CardDav
support is very bad and Microsoft has none, so we use their "Google People" and Graph APIs.
*/
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
  phoneNumbers?: { value: string; type?: string }[];
  emailAddresses?: { value: string; type?: string }[];
  urls?: { value: string; type?: string }[];
  relations?: { person: string; type?: string }[];
  addresses?: {
    formattedValue: string;
    type?: string;
    city: string;
    country: string;
    postalCode: string;
    region: string;
    streetAddress: string;
    extendedAddress: string;
  }[];
  birthdays?: { date: { year: number; month: number; day: number } }[];
  notes?: string;
}

export interface ContactInteractorMetadata {
  origin: string;
  readonly: boolean;
  /** The most entries the service stores in each list; the editor offers no more. */
  limits?: Partial<Record<keyof ContactBase, number>>;
  /** Labels the service can tell apart, suggested in place of the editor's own. */
  types?: { phoneNumbers?: string[] };
  /** The only labels the service stores for a list, each with the most entries it takes;
   the editor offers a choice of these in place of a free label. */
  fixedTypes?: { relations?: { [type: string]: number } };
}

export interface ContactParseResult {
  metadata: ContactInteractorMetadata;
  data: ContactBase;
}

function safeParseVCard(vcard: string) {
  // normalize \n line endings to \r\n
  vcard = vcard.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

  // ensure the VERSION line is the first line after BEGIN.
  // FastMail (and maybe others) do not honor the spec's order.
  const versionMatch = vcard.match(/\r\nVERSION:[ \d.]+\r\n/);
  if (versionMatch) {
    vcard = vcard.replace(/\r\nVERSION:[ \d.]+\r\n/, '\r\n');
    vcard = vcard.replace(`BEGIN:VCARD\r\n`, `BEGIN:VCARD${versionMatch[0]}`);
  }
  return new vCard().parse(vcard);
}

/** Parse a Contact with no `info` into the shared details format. */
export function fromContact(contact: Contact): ContactParseResult {
  const { email } = contact;
  const displayName = displayNameForContact(contact);
  const name = displayName === email ? '' : displayName;
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

/** Parse a Contact with a CardDAV VCard (v3 or v4) into the shared details format. 
  This takes a considerable amount of work because VCards allow many properties to
  be defined more than once, and the parser we use just silently exposes things as
  either an array or a single value.
*/
export function fromVCF(info: ContactInfoVCF): ContactParseResult {
  const card = safeParseVCard(info.vcf);
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
  const note = VCFHelpers.asSingle(card.get('note'));

  let photoURL = photo ? photo._data : undefined;
  if (photoURL) {
    try {
      if (new URL(photoURL).host.endsWith('contacts.icloud.com')) {
        // connecting to iCloud for contact photos requires authentication
        // and it's difficult to reach from here. No photos for now :(
        photoURL = undefined;
      }
    } catch {
      // malformed or non-http URL (e.g. data: URI) — not an iCloud URL, keep as-is
    }
  }

  return {
    metadata: {
      origin: 'CardDAV',
      readonly: false,
    },
    data: {
      name: VCFHelpers.parseName(name),
      company: org ? org._data.split(';')[0] : '',
      nicknames: VCFHelpers.parseValueAndTypeCollection(nicknames),
      title: title ? VCFHelpers.removeRandomSemicolons(title._data) : '',
      phoneNumbers: VCFHelpers.parseValueAndTypeCollection(tels),
      emailAddresses: VCFHelpers.parseValueAndTypeCollection(emails),
      urls: VCFHelpers.parseValueAndTypeCollection(urls),
      addresses: adrs.length > 0 && adrs.map((item) => VCFHelpers.parseAddress(item)),
      birthdays:
        bday && (!bday.value || bday.value === 'date')
          ? [{ date: VCFHelpers.parseBirthday(bday._data) }]
          : undefined,
      notes: note ? note._data.replace(/\\n/g, '\n') : undefined,
    },
  };
}

/** Apply the changes from the UI back to a Contact with it's info in the VCard format.
Note that we only "set" fields that are changed to avoid smashing data you didn't even
touch in the UI, just in case we do it in a lossy way.
*/
export function applyToVCF(contact: Contact, changes: Partial<ContactBase>) {
  if (contact.source !== 'carddav' || !('vcf' in contact.info)) {
    throw new Error('applyToVCF invoked with wrong contact type.');
  }
  const card = safeParseVCard(contact.info.vcf);

  for (const key of Object.keys(changes)) {
    if (key === 'name') {
      const name = card.get('n');
      const nameParts = (name ? name._data : ';;;;').split(';');
      nameParts[0] = changes.name.familyName;
      nameParts[1] = changes.name.givenName;
      card.set('n', nameParts.join(';'));
      card.set('fn', VCFHelpers.formatDisplayName(changes.name));
      contact.name = VCFHelpers.formatDisplayName(changes.name);
    } else if (key === 'title') {
      if (changes.title) {
        card.set('title', changes.title);
      } else {
        delete card.data['title'];
      }
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
      if (key === 'emailAddresses') {
        contact.email = changes.emailAddresses[0]?.value || '';
      }
    } else if (key === 'birthdays') {
      VCFHelpers.setArray('bday', card, changes.birthdays.map(VCFHelpers.serializeBirthday));
    } else if (key === 'addresses') {
      VCFHelpers.setArray('adr', card, changes[key].map(VCFHelpers.serializeAddress));
    } else if (key === 'notes') {
      if (changes.notes) {
        // VCard NOTE: encode literal newlines as \n per the spec
        card.set('note', changes.notes.replace(/\n/g, '\\n'));
      } else {
        delete card.data['note'];
      }
    } else {
      console.log(`Unsure of how to apply changes to ${key}`);
    }
  }
  contact.info = Object.assign(contact.info, { vcf: card.toString().replace(/\n/g, '\r\n') });
}

/* Parse a Contact with Google People info into the shared details format. 
 We don't support multipl names or multiple organizations, but otherwise mostly
 a pass-through. */
export function fromGoogle(info: ContactInfoGoogle): ContactParseResult {
  return {
    metadata: {
      origin: 'Google Contacts',
      readonly: false,
    },
    data: Object.assign({
      name: info.names[0] || {
        givenName: '',
        familyName: '',
        honorificPrefix: '',
        honorificSuffix: '',
        displayName: '',
      },
      title: ((info.organizations || [])[0] || {}).title || '',
      company: ((info.organizations || [])[0] || {}).name || '',
      notes: ((info.biographies || [])[0] || {}).value || undefined,
      // Google returns a generated monogram flagged `default` when there's no real photo.
      photoURL: (info.photos || []).find((p) => !p.default)?.url,
      ...info,
    }),
  };
}

/** applyToGoogle: Apply the changes from the UI back to a Contact with it's
 * info in the Google People format. Note we only modify changed parts of the
 * JSON.
 */
export function applyToGoogle(contact: Contact, changes: Partial<ContactBase>) {
  const { info, source } = contact;

  if (source !== 'gpeople' || !('names' in info)) {
    throw new Error('applyToGoogle invoked with wrong contact type.');
  }
  const metadata = { primary: true };

  for (const key of Object.keys(changes)) {
    const val = changes[key];

    if (key === 'name') {
      if ('displayName' in val) {
        // UI only edits surname + given name so we sync the full string
        // to the new values here if Google provided us with one initially.
        val.displayName = VCFHelpers.formatDisplayName(val);
      }
      if (!info.names || info.names.length === 0) {
        info.names = [Object.assign({ metadata }, val)];
      } else {
        Object.assign(info.names[0], val);
      }
      contact.name = VCFHelpers.formatDisplayName(changes.name);
    } else if (key === 'emailAddresses') {
      info[key] = val;
      contact.email = val[0]?.value || '';
    } else if (key === 'title') {
      if (!info.organizations || info.organizations.length === 0) {
        info.organizations = [{ title: '', name: '', metadata }];
      }
      info.organizations[0].title = val;
    } else if (key === 'company') {
      if (!info.organizations || info.organizations.length === 0) {
        info.organizations = [{ title: '', name: '', metadata }];
      }
      info.organizations[0].name = val;
    } else if (key === 'addresses') {
      info.addresses = val.map((address) => ({
        ...address,
        formattedValue: VCFHelpers.formatAddress(address),
      }));
    } else if (key === 'notes') {
      if (!info.biographies || info.biographies.length === 0) {
        info.biographies = [{ value: val, contentType: 'TEXT_PLAIN', metadata: { primary: true } }];
      } else {
        info.biographies[0].value = val;
      }
    } else {
      info[key] = val;
    }
  }
}

/* Outlook's fixed slots: three emails, two business and two home phones and one mobile, one
 address each of home, business and other, one web page and one birthday. Graph refuses more
 (ErrorInvalidProperty "exceeds the max allowed value"). */
const GRAPH_LIMITS: ContactInteractorMetadata['limits'] = {
  emailAddresses: 3,
  phoneNumbers: 5,
  addresses: 3,
  urls: 1,
  nicknames: 1,
  birthdays: 1,
};
const GRAPH_PHONE_SLOTS = { Mobile: 1, Work: 2, Home: 2 };
const GRAPH_ADDRESS_SLOTS: { [type: string]: keyof ContactInfoGraph } = {
  Home: 'homeAddress',
  Work: 'businessAddress',
  Other: 'otherAddress',
};
const GRAPH_RELATIONS: { [type: string]: 'spouseName' | 'manager' | 'assistantName' } = {
  Spouse: 'spouseName',
  Manager: 'manager',
  Assistant: 'assistantName',
};
// Graph has a field for each of these relations and nowhere to keep any other.
const GRAPH_RELATION_LIMITS = { Spouse: 1, Child: Infinity, Manager: 1, Assistant: 1 };
// Outlook stores a birthday without a year in 1604, and every birthday at 11:59 UTC.
const GRAPH_NO_YEAR = 1604;

function graphAddressToBase(
  address: ContactInfoGraphAddress,
  type: string
): ContactBase['addresses'][0] {
  const [streetAddress, ...rest] = (address.street || '').split(/\r?\n/);
  const result = {
    type,
    formattedValue: '',
    streetAddress: streetAddress || '',
    extendedAddress: rest.join(' '),
    city: address.city || '',
    region: address.state || '',
    postalCode: address.postalCode || '',
    country: address.countryOrRegion || '',
  };
  result.formattedValue = VCFHelpers.formatAddress(result);
  return result;
}

/* Parse a Contact with Microsoft Graph info into the shared details format. Graph has a fixed
 slot for each kind of phone and address, which become their labels. */
export function fromGraph(info: ContactInfoGraph): ContactParseResult {
  const addresses = Object.entries(GRAPH_ADDRESS_SLOTS)
    .filter(([, key]) => Object.keys(info[key] || {}).length > 0)
    .map(([type, key]) => graphAddressToBase(info[key] as ContactInfoGraphAddress, type));

  const birthday = /^(\d{4})-(\d{2})-(\d{2})/.exec(info.birthday || '');
  const year = birthday && Number(birthday[1]);

  return {
    metadata: {
      origin: 'Outlook Contacts',
      readonly: false,
      limits: GRAPH_LIMITS,
      types: { phoneNumbers: Object.keys(GRAPH_PHONE_SLOTS) },
      fixedTypes: { relations: GRAPH_RELATION_LIMITS },
    },
    data: {
      name: {
        displayName: info.displayName || '',
        givenName: info.givenName || '',
        familyName: info.surname || '',
        honorificPrefix: info.title || '',
        honorificSuffix: info.generation || '',
      },
      nicknames: info.nickName ? [{ value: info.nickName }] : [],
      company: info.companyName || '',
      title: info.jobTitle || '',
      emailAddresses: (info.emailAddresses || []).map((e) => ({ value: e.address })),
      phoneNumbers: [
        ...(info.mobilePhone ? [{ value: info.mobilePhone, type: 'Mobile' }] : []),
        ...(info.businessPhones || []).map((value) => ({ value, type: 'Work' })),
        ...(info.homePhones || []).map((value) => ({ value, type: 'Home' })),
      ],
      addresses,
      urls: info.businessHomePage ? [{ value: info.businessHomePage, type: 'Work' }] : [],
      birthdays: birthday
        ? [
            {
              date: {
                year: year === GRAPH_NO_YEAR ? null : year,
                month: Number(birthday[2]),
                day: Number(birthday[3]),
              },
            },
          ]
        : [],
      relations: [
        ...Object.entries(GRAPH_RELATIONS)
          .filter(([, key]) => info[key])
          .map(([type, key]) => ({ person: info[key] as string, type })),
        ...(info.children || []).map((person) => ({ person, type: 'Child' })),
      ],
      notes: info.personalNotes || undefined,
    },
  };
}

/** Puts each item in the slot its label names, then the rest in whichever slots are free,
 in `slots` order. Items beyond the slots are dropped; the editor offers no more. */
function assignToSlots<T extends { type?: string }>(
  items: T[],
  slots: { [type: string]: number }
): { [type: string]: T[] } {
  const result: { [type: string]: T[] } = {};
  const free = (type: string) => (result[type] || []).length < slots[type];
  const slotFor = (label: string) =>
    Object.keys(slots).find((type) => type.toLowerCase() === (label || '').trim().toLowerCase());
  const unplaced: T[] = [];
  for (const item of items) {
    const type = slotFor(item.type);
    if (type && free(type)) {
      result[type] = [...(result[type] || []), item];
    } else {
      unplaced.push(item);
    }
  }
  for (const item of unplaced) {
    const type = Object.keys(slots).find(free);
    if (type) result[type] = [...(result[type] || []), item];
  }
  return result;
}

/** applyToGraph: Apply the changes from the UI back to a Contact with its info in the
 * Microsoft Graph format. Only the fields behind changed parts are rewritten, and the
 * engine PATCHes only the fields that differ.
 */
export function applyToGraph(contact: Contact, changes: Partial<ContactBase>) {
  if (contact.source !== 'graph' || !contact.info) {
    throw new Error('applyToGraph invoked with wrong contact type.');
  }
  const info = { ...(contact.info as ContactInfoGraph) };

  for (const key of Object.keys(changes)) {
    if (key === 'name') {
      info.givenName = changes.name.givenName;
      info.surname = changes.name.familyName;
      info.displayName = VCFHelpers.formatDisplayName(changes.name);
      contact.name = info.displayName;
    } else if (key === 'nicknames') {
      info.nickName = changes.nicknames[0]?.value || null;
    } else if (key === 'company') {
      info.companyName = changes.company;
    } else if (key === 'title') {
      info.jobTitle = changes.title;
    } else if (key === 'emailAddresses') {
      // Graph keeps a display name beside each address; keep the one an address already had.
      const names = new Map((info.emailAddresses || []).map((e) => [e.address, e.name]));
      info.emailAddresses = changes.emailAddresses
        .filter((e) => e.value)
        .slice(0, GRAPH_LIMITS.emailAddresses)
        .map((e) => ({
          address: e.value,
          name: names.get(e.value) || info.displayName || e.value,
        }));
      contact.email = info.emailAddresses[0]?.address || '';
    } else if (key === 'phoneNumbers') {
      const slots = assignToSlots(
        changes.phoneNumbers.filter((p) => p.value),
        GRAPH_PHONE_SLOTS
      );
      info.mobilePhone = (slots.Mobile || [])[0]?.value || null;
      info.businessPhones = (slots.Work || []).map((p) => p.value);
      info.homePhones = (slots.Home || []).map((p) => p.value);
    } else if (key === 'addresses') {
      const slots = assignToSlots(changes.addresses, { Home: 1, Work: 1, Other: 1 });
      for (const [type, field] of Object.entries(GRAPH_ADDRESS_SLOTS)) {
        const address = (slots[type] || [])[0];
        (info as any)[field] = address
          ? {
              street: [address.streetAddress, address.extendedAddress].filter(Boolean).join('\n'),
              city: address.city,
              state: address.region,
              postalCode: address.postalCode,
              countryOrRegion: address.country,
            }
          : {};
      }
    } else if (key === 'urls') {
      info.businessHomePage = changes.urls[0]?.value || null;
    } else if (key === 'birthdays') {
      const date = changes.birthdays[0]?.date;
      info.birthday =
        date && date.month && date.day
          ? `${
              VCFHelpers.serializeBirthday({ date: { ...date, year: date.year || GRAPH_NO_YEAR } })
                .value
            }T11:59:00Z`
          : null;
    } else if (key === 'relations') {
      const ofType = (type: string) =>
        changes.relations.filter(
          (r) => r.person && (r.type || '').trim().toLowerCase() === type.toLowerCase()
        );
      for (const [type, field] of Object.entries(GRAPH_RELATIONS)) {
        info[field] = ofType(type)[0]?.person || null;
      }
      info.children = ofType('Child').map((r) => r.person);
    } else if (key === 'notes') {
      info.personalNotes = changes.notes;
    } else {
      console.log(`Unsure of how to apply changes to ${key}`);
    }
  }
  contact.info = info;
}

/** The `source` of the account's address book: what a new contact in it is stored as. */
export function contactSourceForAccount(accountId: string, books: ContactBook[]): string {
  const book = books.find((b) => b.accountId === accountId);
  if (book) return book.source;
  return AccountStore.accountForId(accountId)?.provider === 'gmail' ? 'gpeople' : 'carddav';
}

export function emptyContactForAccount(accountId: string, source: string) {
  const info: Contact['info'] =
    source === 'gpeople'
      ? { names: [], resourceName: '', etag: '', addresses: [] }
      : source === 'graph'
        ? { displayName: '', emailAddresses: [] }
        : {
            vcf: `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${crypto.randomUUID()}\r\nEND:VCARD\r\n`,
            href: '',
          };
  return new Contact({ source, name: '', email: '', accountId, info });
}

export function parse(contact: Contact): ContactParseResult {
  try {
    return !contact.info || Object.keys(contact.info).length === 0
      ? fromContact(contact)
      : contact.source === 'graph'
        ? fromGraph(contact.info as ContactInfoGraph)
        : 'vcf' in contact.info
          ? fromVCF(contact.info)
          : fromGoogle(contact.info as ContactInfoGoogle);
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
    } else if (contact.source === 'graph') {
      applyToGraph(next, changedData);
    } else if ('vcf' in contact.info) {
      applyToVCF(next, changedData);
    } else {
      applyToGoogle(next, changedData);
    }
  } catch (err) {
    console.warn(`Applying changes to contact ${contact.email} failed: ${err.toString()}`, err);
  }
  return next;
}
