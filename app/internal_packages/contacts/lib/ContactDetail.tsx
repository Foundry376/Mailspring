import React from 'react';
import vCard from 'vcf';
import {
  Account,
  Contact,
  ContactInfoGoogle,
  ContactInfoVCF,
  AccountStore,
} from 'mailspring-exports';
import {
  ContactProfilePhoto,
  FocusContainer,
  ListensToFluxStore,
  ScrollRegion,
} from 'mailspring-component-kit';
import { Store } from './Store';
import * as Icons from './icons';

interface ContactController {
  photoURL?: string;
  nicknames?: { value: string }[];
  organizations?: { title?: string; name: string }[];
  phoneNumbers?: { value: string; formattedType?: string }[];
  emailAddresses?: { value: string; formattedType?: string }[];
  urls?: { value: string; formattedType?: string }[];
  relations?: { person: string; formattedType?: string }[];
  addresses?: { formattedValue: string; formattedType?: string }[];
  birthdays?: { date: { year: number; month: number; day: number } }[];

  origin: string;
  // onChange, etc. goes here, mutates underlying info model
}

function GenericController(email: string): ContactController {
  return {
    origin: 'Found in Sent Mail',
    emailAddresses: [{ value: email }],
  };
}

function VCFContactController(info: ContactInfoVCF): ContactController {
  const card = new vCard().parse(info.vcf);
  console.log(card);

  const asArray = (obj: any | Array<any>) => {
    if (obj instanceof Array) return obj;
    return obj ? [obj] : [];
  };

  const asSingle = (obj: any | Array<any>) => {
    if (obj instanceof Array) return obj[0];
    return obj;
  };

  const parseBirthday = (date: string) => {
    const [year, month, day] = [...date.split('-'), -1, -1, -1];
    return { year: Number(year), month: Number(month), day: Number(day) };
  };

  const removeRandomSemicolons = (value: string) => {
    return value
      .replace(/;/g, ' ')
      .replace(/  +/g, ' ')
      .trim();
  };

  const parseAddress = (value: string) => {
    const [A, AddrLine1, AddrLine2, City, State, Zip, Country] = [
      ...value.split(';'),
      ...'       '.split(' '),
    ];
    return [
      [A, AddrLine1].filter(a => a.length).join(' '),
      [AddrLine2].join(' '),
      [City, State, Zip].filter(a => a.length).join(' '),
      [Country].join(' '),
    ]
      .filter(l => l.length)
      .join('\n')
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',');
  };

  const parseFormattedType = (value: string) => {
    return asArray(value).filter(v => v !== 'internet' && v !== 'pref')[0];
  };

  const org = asSingle(card.get('org'));
  const photo = asSingle(card.get('photo'));
  const title = asSingle(card.get('title'));
  const adrs = asArray(card.get('adr'));
  const tels = asArray(card.get('tel'));
  const emails = asArray(card.get('email'));
  const urls = asArray(card.get('url'));
  const bday = asSingle(card.get('bday'));

  let photoURL = photo ? photo._data : undefined;
  if (photoURL && new URL(photoURL).host.endsWith('contacts.icloud.com')) {
    // connecting to iCloud for contact photos requires authentication
    // and it's difficult to reach from here.
    photoURL = undefined;
  }

  return {
    origin: 'CardDAV',
    photoURL,
    organizations: org
      ? [
          {
            name: removeRandomSemicolons(org._data),
            title: title ? removeRandomSemicolons(title._data) : undefined,
          },
        ]
      : undefined,
    phoneNumbers:
      tels.length > 0 &&
      tels.map(item => ({
        value: item._data,
        formattedType: parseFormattedType(item.type),
      })),
    emailAddresses:
      emails.length > 0 &&
      emails.map(item => ({
        value: item._data,
        formattedType: parseFormattedType(item.type),
      })),
    addresses:
      adrs.length > 0 &&
      adrs.map(item => ({
        formattedValue: item.label ? item.label : parseAddress(item._data),
        formattedType: parseFormattedType(item.type),
      })),
    urls:
      urls.length > 0 &&
      urls.map(item => ({
        value: item._data,
        formattedType: parseFormattedType(item.type),
      })),
    birthdays: bday && bday.value === 'date' ? [{ date: parseBirthday(bday._data) }] : undefined,
  };
}

function GoogleContactController(info: ContactInfoGoogle): ContactController {
  return Object.assign({ origin: 'Google Contacts' }, info);
}

interface ContactDetailProps {
  contacts: Contact[];
  focusedId?: string;
}

interface ContactDetailState {}

class ContactDetailWithFocus extends React.Component<ContactDetailProps, ContactDetailState> {
  render() {
    const { contacts, focusedId } = this.props;
    const contact = contacts.find(c => c.id === focusedId);

    if (!contact) {
      return (
        <div className="contact-detail-column">
          <div className="contacts-empty-state">
            <div className="message">No contact selected.</div>
          </div>
        </div>
      );
    }

    const controller = !contact.info
      ? GenericController(contact.email)
      : 'vcf' in contact.info
      ? VCFContactController(contact.info)
      : GoogleContactController(contact.info);

    return (
      <ScrollRegion className="contact-detail-column">
        <div className="contact-detail-content-wrap">
          <div className="contact-hero">
            <ContactProfilePhoto
              contact={contact}
              loading={false}
              avatar={controller && controller.photoURL}
            />
            <h3>{contact.name}</h3>
          </div>
          {
            <ContactAttributes
              controller={controller}
              account={AccountStore.accountForId(contact.accountId)}
            />
          }
        </div>
      </ScrollRegion>
    );
  }
}

const ContactAttributes = ({
  controller,
  account,
}: {
  controller: ContactController;
  account: Account;
}) => (
  <div className="contact-attributes">
    {controller.nicknames && (
      <div className="contact-attributes-section">
        {controller.nicknames.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label></label>
            <div>{`“${item.value}”`}</div>
          </div>
        ))}
      </div>
    )}
    {controller.organizations && (
      <div className="contact-attributes-section">
        {controller.organizations.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.Briefcase />
            </label>
            <div>{`${item.title ? `${item.title}, ` : ''}${item.name}`}</div>
          </div>
        ))}
      </div>
    )}
    {controller.emailAddresses && (
      <div className="contact-attributes-section">
        {controller.emailAddresses.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.Envelope />
            </label>
            <div>
              <a href={`mailto:${item.value}`} title="Send email...">
                {item.value}
              </a>
              {item.formattedType && <div className="type">{item.formattedType}</div>}
            </div>
          </div>
        ))}
      </div>
    )}
    {controller.phoneNumbers && (
      <div className="contact-attributes-section">
        {controller.phoneNumbers.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.Phone />
            </label>
            <div>
              <a href={`tel:${item.value}`} title="Call...">
                {item.value}
              </a>
              {item.formattedType && <div className="type">{item.formattedType}</div>}
            </div>
          </div>
        ))}
      </div>
    )}
    {controller.addresses && (
      <div className="contact-attributes-section">
        {controller.addresses.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.Map />
            </label>
            <div>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(item.formattedValue)}`}>
                {item.formattedValue}
              </a>
              {item.formattedType && <div className="type">{item.formattedType}</div>}
            </div>
          </div>
        ))}
      </div>
    )}
    {controller.birthdays && (
      <div className="contact-attributes-section">
        {controller.birthdays.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.Crown />
            </label>
            <div>
              {new Date(item.date.year, item.date.month, item.date.day).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    )}
    {controller.relations && (
      <div className="contact-attributes-section">
        {controller.relations.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.People />
            </label>
            <div>
              {item.person}
              {item.formattedType && <div className="type">{item.formattedType}</div>}
            </div>
          </div>
        ))}
      </div>
    )}
    {controller.urls && (
      <div className="contact-attributes-section">
        {controller.urls.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.Link />
            </label>
            <div>
              <a href={`${item.value}`} title="Visit website...">
                {item.value}
              </a>
              {item.formattedType && <div className="type">{item.formattedType}</div>}
            </div>
          </div>
        ))}
      </div>
    )}
    <div className="contact-origin">
      <div>{`${controller.origin} (${account ? account.label : 'Unknown Account'})`}</div>
    </div>
  </div>
);

export const ContactDetail: React.FunctionComponent<ContactDetailProps> = ListensToFluxStore(
  ({ contacts }) => (
    <FocusContainer collection="contact">
      <ContactDetailWithFocus contacts={contacts} />
    </FocusContainer>
  ),
  {
    stores: [Store],
    getStateFromStores: () => ({
      contacts: Store.filteredContacts(),
    }),
  }
);

ContactDetail.displayName = 'ContactDetail';
(ContactDetail as any).containerStyles = {
  minWidth: 360,
  maxWidth: 100000,
};
