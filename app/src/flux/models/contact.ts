/* eslint global-require: 0 */
import _str from 'underscore.string';
import { Model, AttributeValues } from './model';
import Attributes from '../attributes';
import * as Utils from './utils';
import RegExpUtils from '../../regexp-utils';
import { AccountStore } from '../stores/account-store';
import { localized } from '../../intl';
import { ContactGroup } from './contact-group';

let FocusedPerspectiveStore = null; // Circular Dependency

export interface ContactInfoVCF {
  vcf: string;
  href: string;
}

export interface ContactInfoGoogle {
  resourceName: string;
  etag: string;

  birthdays?: {
    date: {
      day: number;
      month: number;
      year: number;
    };
    metadata: {
      primary: boolean;
    };
    text: string;
  }[];
  addresses: {
    city: string;
    country: string;
    countryCode: string;
    extendedAddress: string;
    formattedType: string;
    formattedValue: string;
    metadata: {
      primary: boolean;
    };
    postalCode: string;
    region: string;
    streetAddress: string;
    type: string;
  }[];
  organizations?: [
    {
      metadata: {
        primary: boolean;
      };
      name: string;
      title: string;
    }
  ];
  relations?: [
    {
      formattedType: string;
      metadata: {
        primary: boolean;
      };
      person: string;
      type: string;
    }
  ];
  emailAddresses?: {
    formattedType: string;
    metadata: {
      primary: boolean;
    };
    type: string;
    value: string;
  }[];
  names?: {
    displayName: string;
    displayNameLastFirst: string;
    familyName: string;
    givenName: string;
    metadata: {
      primary: boolean;
    };
  }[];
  nicknames?: {
    metadata: {
      primary: true;
    };
    value: string;
  }[];
  phoneNumbers?: {
    formattedType: string;
    metadata: {
      primary: boolean;
    };
    type: string;
    value: string;
  }[];
  photos?: {
    default: boolean;
    metadata: {
      primary: boolean;
    };
    url: string;
  }[];
  urls?: {
    formattedType: string;
    metadata: {
      primary: boolean;
    };
    type: string;
    value: string;
  }[];
}

const namePrefixes = {};
const nameSuffixes = {};

[
  '2dlt',
  '2lt',
  '2nd lieutenant',
  'adm',
  'administrative',
  'admiral',
  'amb',
  'ambassador',
  'attorney',
  'atty',
  'baron',
  'baroness',
  'bishop',
  'br',
  'brig gen or bg',
  'brigadier general',
  'brnss',
  'brother',
  'capt',
  'captain',
  'chancellor',
  'chaplain',
  'chapln',
  'chief petty officer',
  'cmdr',
  'cntss',
  'coach',
  'col',
  'colonel',
  'commander',
  'corporal',
  'count',
  'countess',
  'cpl',
  'cpo',
  'cpt',
  'doctor',
  'dr',
  'dr and mrs',
  'drs',
  'duke',
  'ens',
  'ensign',
  'estate of',
  'father',
  'father',
  'fr',
  'frau',
  'friar',
  'gen',
  'general',
  'gov',
  'governor',
  'hon',
  'honorable',
  'judge',
  'justice',
  'lieutenant',
  'lieutenant colonel',
  'lieutenant commander',
  'lieutenant general',
  'lieutenant junior grade',
  'lord',
  'lt',
  'ltc',
  'lt cmdr',
  'lt col',
  'lt gen',
  'ltg',
  'lt jg',
  'm',
  'madame',
  'mademoiselle',
  'maj',
  'maj',
  'master sergeant',
  'master sgt',
  'miss',
  'miss',
  'mlle',
  'mme',
  'monsieur',
  'monsignor',
  'monsignor',
  'mr',
  'mr',
  'mr & dr',
  'mr and dr',
  'mr & mrs',
  'mr and mrs',
  'mrs & mr',
  'mrs and mr',
  'ms',
  'ms',
  'msgr',
  'msgr',
  'ofc',
  'officer',
  'president',
  'princess',
  'private',
  'prof',
  'prof & mrs',
  'professor',
  'pvt',
  'rabbi',
  'radm',
  'rear admiral',
  'rep',
  'representative',
  'rev',
  'reverend',
  'reverends',
  'revs',
  'right reverend',
  'rtrev',
  's sgt',
  'sargent',
  'sec',
  'secretary',
  'sen',
  'senator',
  'senor',
  'senora',
  'senorita',
  'sergeant',
  'sgt',
  'sgt',
  'sheikh',
  'sir',
  'sister',
  'sister',
  'sr',
  'sra',
  'srta',
  'staff sergeant',
  'superintendent',
  'supt',
  'the hon',
  'the honorable',
  'the venerable',
  'treas',
  'treasurer',
  'trust',
  'trustees of',
  'vadm',
  'vice admiral',
].forEach(prefix => {
  namePrefixes[prefix] = true;
});

[
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  'cfx',
  'cnd',
  'cpa',
  'csb',
  'csc',
  'csfn',
  'csj',
  'dc',
  'dds',
  'esq',
  'esquire',
  'first',
  'fs',
  'fsc',
  'ihm',
  'jd',
  'jr',
  'md',
  'ocd',
  'ofm',
  'op',
  'osa',
  'osb',
  'osf',
  'phd',
  'pm',
  'rdc',
  'ret',
  'rsm',
  'second',
  'sj',
  'sm',
  'snd',
  'sp',
  'sr',
  'ssj',
  'us army',
  'us army ret',
  'usa',
  'usa ret',
  'usaf',
  'usaf ret',
  'usaf us air force',
  'usmc us marine corp',
  'usmcr us marine reserves',
  'usn',
  'usn ret',
  'usn us navy',
  'vm',
].forEach(suffix => {
  nameSuffixes[suffix] = true;
});

/*
Public: The Contact model represents a Contact object.

Attributes

`name`: {AttributeString} The name of the contact. Queryable.

`email`: {AttributeString} The email address of the contact. Queryable.

We also have "normalized" optional data for each contact. This list may
grow as the needs of a contact become more complex.

This class also inherits attributes from {Model}

Section: Models
*/

export class Contact extends Model {
  static attributes = {
    ...Model.attributes,

    name: Attributes.String({
      modelKey: 'name',
    }),

    hidden: Attributes.Boolean({
      queryable: true,
      modelKey: 'hidden',
      jsonKey: 'h',
    }),

    source: Attributes.String({
      queryable: true,
      modelKey: 'source',
      jsonKey: 's',
    }),

    email: Attributes.String({
      queryable: true,
      modelKey: 'email',
    }),

    contactGroups: Attributes.Collection({
      queryable: true,
      modelKey: 'contactGroups',
      jsonKey: 'gis',
      joinOnField: 'id',
      joinTableName: 'ContactContactGroup',
    }),

    refs: Attributes.Number({
      queryable: true,
      modelKey: 'refs',
    }),

    info: Attributes.Object({
      modelKey: 'info',
    }),
  };

  static searchable = true;

  static searchFields = ['content'];

  static sortOrderAttribute = () => {
    return Contact.attributes.id;
  };

  static naturalSortOrder = () => {
    return Contact.sortOrderAttribute().descending();
  };

  static fromString(string, { accountId }: { accountId?: string } = {}) {
    const emailRegex = RegExpUtils.emailRegex();
    const match = emailRegex.exec(string);
    if (emailRegex.exec(string)) {
      throw new Error(
        'Error while calling Contact.fromString: string contains more than one email'
      );
    }
    const email = match[0];
    let name = string.substr(0, match.index - 1);
    if (name.endsWith('<') || name.endsWith('(')) {
      name = name.substr(0, name.length - 1);
    }
    return new Contact({
      // used to give them random strings, let's try for something consistent
      id: `local-${accountId}-${email}`,
      accountId: accountId,
      name: name.trim(),
      email: email,
    });
  }

  public name: string;
  public email: string;
  public refs: number;
  public source: string;
  public hidden: boolean;
  public contactGroups: string[];
  public info?: ContactInfoGoogle | ContactInfoVCF;

  constructor(data: AttributeValues<typeof Contact.attributes>) {
    super(data);
    if (!this.contactGroups) {
      this.contactGroups = [];
    }
  }

  // Public: Returns a string of the format `Full Name <email@address.com>` if
  // the contact has a populated name, just the email address otherwise.
  toString() {
    // Note: This is used as the drag-drop text of a Contact token, in the
    // creation of message bylines "From Ben Gotow <ben@mailspring>", and several other
    // places. Change with care.
    return this.name && this.name !== this.email ? `${this.name} <${this.email}>` : this.email;
  }

  fromJSON(json) {
    // to ensure that old contact data is inflated properly
    // and we can compare hidden === false.
    if (json && !('s' in json)) {
      json['s'] = 'mail';
    }
    if (json && !('h' in json)) {
      json['h'] = false;
    }
    super.fromJSON(json);
    this.name = this.name || this.email;
    return json;
  }

  // Public: Returns true if the contact provided is a {Contact} instance and
  // contains a properly formatted email address.
  isValid() {
    if (!this.email) {
      return false;
    }

    // The email regexp must match the /entire/ email address
    const result = RegExpUtils.emailRegex().exec(this.email);
    return result && result instanceof Array ? result[0] === this.email : false;
  }

  // Public: Returns true if the contact is the current user, false otherwise.
  // You should use this method instead of comparing the user's email address to
  // the account email, since it is case-insensitive and future-proof.
  isMe() {
    return !!AccountStore.accountForEmail(this.email);
  }

  hasSameDomainAsMe() {
    for (const myEmail of AccountStore.emailAddresses()) {
      if (Utils.emailsHaveSameDomain(this.email, myEmail)) {
        return true;
      }
    }
    return false;
  }

  isMePhrase({
    includeAccountLabel,
    forceAccountLabel,
  }: { includeAccountLabel?: boolean; forceAccountLabel?: boolean } = {}) {
    const account = AccountStore.accountForEmail(this.email);
    if (!account) {
      return null;
    }

    if (includeAccountLabel) {
      FocusedPerspectiveStore =
        FocusedPerspectiveStore || require('../stores/focused-perspective-store').default;
      if (
        account &&
        (FocusedPerspectiveStore.current().accountIds.length > 1 || forceAccountLabel)
      ) {
        return `You (${account.label})`;
      }
    }
    return localized('You');
  }

  // Returns a {String} display name.
  // - "You" if the contact is the current user or an alias for the current user.
  // - `name` if the contact has a populated name
  // - `email` in all other cases.

  // You can pass several options to customize the name:
  // - includeAccountLabel: If the contact represents the current user, include
  //   the account label after "You"
  // - forceAccountLabel: Always include the account label
  // - compact: If the contact has a name, make the name as short as possible
  //   (generally returns just the first name.)
  displayName(
    options: { includeAccountLabel?: boolean; forceAccountLabel?: boolean; compact?: boolean } = {}
  ) {
    let includeAccountLabel = options.includeAccountLabel;
    const forceAccountLabel = options.forceAccountLabel;
    const compact = options.compact || false;

    if (includeAccountLabel === undefined) {
      includeAccountLabel = !compact;
    }

    const fallback = compact ? this.firstName() : this.fullName();
    return this.isMePhrase({ forceAccountLabel, includeAccountLabel }) || fallback;
  }

  fullName() {
    return this._nameParts().join(' ');
  }

  firstName() {
    const exclusions = ['a', 'the', 'dr.', 'mrs.', 'mr.', 'mx.', 'prof.', 'ph.d.'];
    return this._nameParts().find(p => !exclusions.includes(p.toLowerCase())) || '';
  }

  lastName() {
    return (
      this._nameParts()
        .slice(1)
        .join(' ') || ''
    );
  }

  nameAbbreviation() {
    const c1 = (this.firstName()[0] || '').toUpperCase();
    const c2 = (this.lastName()[0] || '').toUpperCase();
    if (c2 === '(' || c2 === '[') {
      return c1; // eg: "Susana (Airbnb)"
    }
    return c1 + c2;
  }

  guessCompanyFromEmail(email = this.email) {
    if (Utils.emailHasCommonDomain(email)) {
      return '';
    }
    const domain = email
      .toLowerCase()
      .trim()
      .split('@')
      .pop();
    const domainParts = domain.split('.');
    if (domainParts.length >= 2) {
      return _str.titleize(_str.humanize(domainParts[domainParts.length - 2]));
    }
    return '';
  }

  _nameParts() {
    let name = this.name;

    // At this point, if the name is empty we'll use the email address
    if (!name || name.length === 0) {
      name = this.email || '';

      // If the phrase has an '@', use everything before the @ sign
      // Unless there that would result in an empty string.
      if (name.indexOf('@') > 0) {
        name = name.split('@').shift();
      }
    }

    // If the name is in single or double quotes, strip the quotes off
    if (
      (name.startsWith("'") && name.endsWith("'")) ||
      (name.startsWith('"') && name.endsWith('"'))
    ) {
      name = name.substr(1, name.length - 2);
    }

    // Take care of phrases like "Mike Kaylor via LinkedIn" that should be displayed
    // as the contents before the separator word. Do not break "Olivia"
    name = name.split(/(\svia\s)/i).shift();

    // Take care of whitespace
    name = name.trim();

    // Handle last name, first name
    let parts = this._parseReverseNames(name);

    // Split the name into words and remove parts that are prefixes and suffixes
    if (parts.join('').length === 0) {
      parts = [];
      parts = name.split(/\s+/);
      if (parts.length > 0 && namePrefixes[parts[0].toLowerCase().replace(/\./, '')]) {
        parts = parts.slice(1);
      }
      if (
        parts.length > 0 &&
        nameSuffixes[parts[parts.length - 1].toLowerCase().replace(/\./, '')]
      ) {
        parts = parts.slice(0, parts.length - 1);
      }
    }

    // If we've removed all the parts, just return the whole name
    if (parts.join('').length === 0) {
      parts = [name];
    }

    // If all that failed, fall back to email
    if (parts.join('').length === 0) {
      parts = [this.email];
    }

    return parts;
  }

  _parseReverseNames(name) {
    const parts = [];
    const [lastName, remainder] = name.split(', ');
    if (remainder) {
      const [firstName, description] = remainder.split('(');

      parts.push(firstName.trim());
      parts.push(lastName.trim());
      if (description) {
        parts.push(`(${description.trim()}`);
      }
    }
    return parts;
  }
}
