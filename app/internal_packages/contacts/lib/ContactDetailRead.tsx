import React from 'react';
import { Contact, AccountStore, ContactGroup, localized } from 'mailspring-exports';
import { ContactProfilePhoto } from 'mailspring-component-kit';
import * as Icons from './SVGIcons';
import { Store } from './Store';
import { ContactBase, ContactInteractorMetadata } from './ContactInfoMapping';
import { displayNameForContact } from './ContactDisplayName';

function formatBirthday(date: ContactBase['birthdays'][0]['date'] | undefined) {
  if (!date || !date.month || !date.day) return '';
  if (date.year) {
    return new Date(date.year, date.month - 1, date.day).toLocaleDateString(undefined, {
      dateStyle: 'long',
    });
  }
  return new Date(2000, date.month - 1, date.day).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

const DetailRow = ({
  icon,
  type,
  children,
}: {
  icon: React.ReactNode;
  type?: string;
  children: React.ReactNode;
}) => (
  <div className="contact-detail-row">
    <span className="contact-detail-row-icon" aria-hidden="true">
      {icon}
    </span>
    <div className="contact-detail-row-value">
      {children}
      {type && <span className="type">{type}</span>}
    </div>
  </div>
);

const QuickAction = ({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) => (
  <a className="contact-quick-action" href={href} title={label}>
    <span className="contact-quick-action-icon" aria-hidden="true">
      {icon}
    </span>
    {label}
  </a>
);

export const ContactDetailRead = ({
  data,
  groups,
  contact,
  metadata,
}: {
  data: ContactBase;
  groups: ContactGroup[];
  contact: Contact;
  metadata: ContactInteractorMetadata;
}) => {
  const account = AccountStore.accountForId(contact.accountId);
  const emails = (data.emailAddresses || []).filter((e) => e.value);
  const phones = (data.phoneNumbers || []).filter((p) => p.value);
  const urls = (data.urls || []).filter((u) => u.value);
  const addresses = (data.addresses || []).filter((a) => a.formattedValue);
  const birthdays = (data.birthdays || []).map((b) => formatBirthday(b.date)).filter(Boolean);
  const relations = (data.relations || []).filter((r) => r.person);
  const nicknames = (data.nicknames || []).filter((n) => n.value);
  const subtitle = [data.title, data.company].filter(Boolean).join(' · ');
  const hasDetails =
    emails.length + phones.length + urls.length + addresses.length + birthdays.length > 0 ||
    relations.length > 0;

  return (
    <div className="contact-detail-content-wrap">
      <div className="contact-hero">
        <ContactProfilePhoto contact={contact} loading={false} avatar={data.photoURL} />
        <div className="contact-hero-text">
          <h1>{data.name.displayName || displayNameForContact(contact)}</h1>
          {subtitle && <div className="contact-hero-subtitle">{subtitle}</div>}
          {nicknames.length > 0 && (
            <div className="contact-hero-nicknames">
              {nicknames.map((n) => `“${n.value}”`).join(', ')}
            </div>
          )}
        </div>
      </div>

      {(emails.length > 0 || phones.length > 0 || urls.length > 0) && (
        <div className="contact-quick-actions">
          {emails.length > 0 && (
            <QuickAction
              href={`mailto:${emails[0].value}`}
              icon={<Icons.Envelope />}
              label={localized('Email')}
            />
          )}
          {phones.length > 0 && (
            <QuickAction
              href={`tel:${phones[0].value}`}
              icon={<Icons.Phone />}
              label={localized('Call')}
            />
          )}
          {urls.length > 0 && (
            <QuickAction href={urls[0].value} icon={<Icons.Link />} label={localized('Website')} />
          )}
        </div>
      )}

      {contact.contactGroups.length > 0 && (
        <div className="contact-group-memberships">
          {contact.contactGroups.map((gid) => {
            const group = groups.find((g) => g.id === gid);
            const label = group ? group.name : gid;
            return (
              <button
                key={gid}
                className="group-membership"
                onClick={() => {
                  Store.setPerspective({
                    label,
                    accountId: contact.accountId,
                    groupId: gid,
                    type: 'group',
                  });
                }}
              >
                <Icons.Tag />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {hasDetails && (
        <section className="contact-card">
          <h2>{localized('Contact Details')}</h2>
          {emails.map((item, idx) => (
            <DetailRow key={`e${idx}`} icon={<Icons.Envelope />} type={item.type}>
              <a href={`mailto:${item.value}`} title={localized('Send email...')}>
                {item.value}
              </a>
            </DetailRow>
          ))}
          {phones.map((item, idx) => (
            <DetailRow key={`p${idx}`} icon={<Icons.Phone />} type={item.type}>
              <a href={`tel:${item.value}`} title={localized('Call...')}>
                {item.value}
              </a>
            </DetailRow>
          ))}
          {addresses.map((item, idx) => (
            <DetailRow key={`a${idx}`} icon={<Icons.Map />} type={item.type}>
              <a
                className="address"
                href={`https://maps.google.com/?q=${encodeURIComponent(item.formattedValue)}`}
              >
                {item.formattedValue}
              </a>
            </DetailRow>
          ))}
          {birthdays.map((text, idx) => (
            <DetailRow key={`b${idx}`} icon={<Icons.Crown />} type={localized('Birthday')}>
              {text}
            </DetailRow>
          ))}
          {relations.map((item, idx) => (
            <DetailRow key={`r${idx}`} icon={<Icons.People />} type={item.type}>
              {item.person}
            </DetailRow>
          ))}
          {urls.map((item, idx) => (
            <DetailRow key={`u${idx}`} icon={<Icons.Link />} type={item.type}>
              <a href={item.value} title={localized('Visit website...')}>
                {item.value}
              </a>
            </DetailRow>
          ))}
        </section>
      )}

      {data.notes && (
        <section className="contact-card">
          <h2>{localized('Notes')}</h2>
          <div className="contact-notes">{data.notes}</div>
        </section>
      )}

      <div className="contact-origin">
        {`${metadata.origin} · ${account ? account.label : localized('Unknown Account')}`}
      </div>
    </div>
  );
};
