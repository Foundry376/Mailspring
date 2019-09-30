import React from 'react';
import { Account, Contact, AccountStore } from 'mailspring-exports';
import { ContactProfilePhoto } from 'mailspring-component-kit';
import * as Icons from './icons';
import { ContactBase, ContactInteractorMetadata } from './ContactController';

export const ContactDetailRead = ({
  data,
  contact,
  metadata,
}: {
  data: ContactBase;
  contact: Contact;
  metadata: ContactInteractorMetadata;
}) => {
  return (
    <div className="contact-detail-content-wrap">
      <div className="contact-hero">
        <ContactProfilePhoto contact={contact} loading={false} avatar={data.photoURL} />
        <h3>{data.name.displayName}</h3>
      </div>
      {
        <ContactAttributes
          data={data}
          origin={metadata.origin}
          account={AccountStore.accountForId(contact.accountId)}
        />
      }
    </div>
  );
};

const ContactAttributes = ({
  data,
  origin,
  account,
}: {
  data: ContactBase;
  origin: string;
  account: Account;
}) => (
  <div className="contact-attributes">
    {data.nicknames && (
      <div className="contact-attributes-section">
        {data.nicknames.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label></label>
            <div>{`“${item.value}”`}</div>
          </div>
        ))}
      </div>
    )}
    {data.organizations && (
      <div className="contact-attributes-section">
        {data.organizations.map((item, idx) => (
          <div className="contact-attribute" key={idx}>
            <label>
              <Icons.Briefcase />
            </label>
            <div>{`${item.title ? `${item.title}, ` : ''}${item.name}`}</div>
          </div>
        ))}
      </div>
    )}
    {data.emailAddresses && (
      <div className="contact-attributes-section">
        {data.emailAddresses.map((item, idx) => (
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
    {data.phoneNumbers && (
      <div className="contact-attributes-section">
        {data.phoneNumbers.map((item, idx) => (
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
    {data.addresses && (
      <div className="contact-attributes-section">
        {data.addresses.map((item, idx) => (
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
    {data.birthdays && (
      <div className="contact-attributes-section">
        {data.birthdays.map((item, idx) => (
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
    {data.relations && (
      <div className="contact-attributes-section">
        {data.relations.map((item, idx) => (
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
    {data.urls && (
      <div className="contact-attributes-section">
        {data.urls.map((item, idx) => (
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
      <div>{`${origin} (${account ? account.label : 'Unknown Account'})`}</div>
    </div>
  </div>
);
