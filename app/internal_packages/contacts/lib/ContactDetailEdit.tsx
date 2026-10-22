import React from 'react';
import { AccountStore, Contact, localized } from 'mailspring-exports';
import { ContactProfilePhoto } from 'mailspring-component-kit';
import { ContactBase } from './ContactInfoMapping';
import { BirthdayInput } from './BirthdayInput';
import { ListEditor } from './ListEditor';
import { TypeaheadFreeInput } from './TypeaheadFreeInput';
import { ContactField, ContactTextField } from './ContactField';
import * as Icons from './SVGIcons';

const BaseTypes = ['Home', 'Work', 'Other'];

const PhoneTypes = [
  'Home',
  'Work',
  'Other',
  'Mobile',
  'Main',
  'Home Fax',
  'Work Fax',
  'Google Voice',
  'Pager',
];

const WebTypes = ['Profile', 'Blog', 'Home Page', 'Work'];

const RelationTypes = [
  'Spouse',
  'Child',
  'Mother',
  'Father',
  'Parent',
  'Brother',
  'Sister',
  'Friend',
  'Relative',
  'Manager',
  'Assistant',
  'Reference',
  'Partner',
  'Domestic Partner',
];

const EditSection = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="contact-edit-section">
    <div className="contact-edit-section-icon" aria-hidden="true">
      {icon}
    </div>
    <div className="contact-edit-section-content">{children}</div>
  </div>
);

const TypeField = ({
  value,
  suggestions,
  onChange,
}: {
  value: string | undefined;
  suggestions: string[];
  onChange: (value: string) => void;
}) => (
  <ContactField label={localized('Label')} className="type">
    <TypeaheadFreeInput
      suggestions={suggestions}
      value={value || ''}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  </ContactField>
);

export class ContactDetailEdit extends React.Component<{
  data: ContactBase;
  contact: Contact;
  onChange: (changes: Partial<ContactBase>) => void;
}> {
  render() {
    const { onChange, contact, data } = this.props;
    const account = AccountStore.accountForId(contact.accountId);

    return (
      <div className="contact-detail-content-wrap editing">
        <div className="contact-hero">
          <ContactProfilePhoto contact={contact} loading={false} avatar={data.photoURL} />
          <div className="contact-hero-text">
            <h1>{contact.id ? localized('Edit Contact') : localized('New Contact')}</h1>
            {account && <div className="contact-hero-subtitle">{account.label}</div>}
          </div>
        </div>

        <EditSection icon={<Icons.Person />}>
          <ContactTextField
            label={localized('First Name')}
            value={data.name.givenName}
            onChange={(givenName) => onChange({ name: { ...data.name, givenName } })}
          />
          <ContactTextField
            label={localized('Last Name')}
            value={data.name.familyName}
            onChange={(familyName) => onChange({ name: { ...data.name, familyName } })}
          />
          <ListEditor<ContactBase['nicknames'][0]>
            items={data.nicknames || []}
            itemTemplate={{ value: '' }}
            addLabel={localized('Add nickname')}
            onChange={(items) => onChange({ nicknames: items })}
          >
            {(item, onChange) => (
              <ContactTextField
                label={localized('Nickname')}
                value={item.value}
                onChange={(value) => onChange({ value })}
              />
            )}
          </ListEditor>
        </EditSection>

        <EditSection icon={<Icons.Briefcase />}>
          <ContactTextField
            label={localized('Company')}
            value={data.company}
            onChange={(company) => onChange({ company })}
          />
          <ContactTextField
            label={localized('Job Title')}
            value={data.title}
            onChange={(title) => onChange({ title })}
          />
        </EditSection>

        <EditSection icon={<Icons.Envelope />}>
          <ListEditor<ContactBase['emailAddresses'][0]>
            items={data.emailAddresses || []}
            itemTemplate={{ type: '', value: '' }}
            addLabel={localized('Add email')}
            onChange={(items) => onChange({ emailAddresses: items })}
          >
            {(item, onChange) => (
              <div className="contact-field-row">
                <ContactTextField
                  type="email"
                  label={localized('Email')}
                  value={item.value}
                  onChange={(value) => onChange({ value })}
                />
                <TypeField
                  value={item.type}
                  suggestions={BaseTypes}
                  onChange={(type) => onChange({ type })}
                />
              </div>
            )}
          </ListEditor>
        </EditSection>

        <EditSection icon={<Icons.Phone />}>
          <ListEditor<ContactBase['phoneNumbers'][0]>
            items={data.phoneNumbers || []}
            itemTemplate={{ type: '', value: '' }}
            addLabel={localized('Add phone')}
            onChange={(items) => onChange({ phoneNumbers: items })}
          >
            {(item, onChange) => (
              <div className="contact-field-row">
                <ContactTextField
                  type="tel"
                  label={localized('Phone')}
                  value={item.value}
                  onChange={(value) => onChange({ value })}
                />
                <TypeField
                  value={item.type}
                  suggestions={PhoneTypes}
                  onChange={(type) => onChange({ type })}
                />
              </div>
            )}
          </ListEditor>
        </EditSection>

        <EditSection icon={<Icons.Map />}>
          <ListEditor<ContactBase['addresses'][0]>
            items={data.addresses || []}
            itemTemplate={{
              type: '',
              formattedValue: '',
              city: '',
              country: '',
              postalCode: '',
              region: '',
              streetAddress: '',
              extendedAddress: '',
            }}
            addLabel={localized('Add address')}
            onChange={(items) => onChange({ addresses: items })}
          >
            {(item, onChange) => (
              <div className="contact-address-fields">
                <ContactTextField
                  label={localized('Street Address')}
                  value={item.streetAddress}
                  onChange={(streetAddress) => onChange({ streetAddress })}
                />
                <ContactTextField
                  label={localized('Street Address Line 2')}
                  value={item.extendedAddress}
                  onChange={(extendedAddress) => onChange({ extendedAddress })}
                />
                <div className="contact-field-row">
                  <ContactTextField
                    label={localized('City')}
                    value={item.city}
                    onChange={(city) => onChange({ city })}
                  />
                  <ContactTextField
                    label={localized('State / Region')}
                    value={item.region}
                    onChange={(region) => onChange({ region })}
                  />
                  <ContactTextField
                    label={localized('Postal Code')}
                    className="postal-code"
                    value={item.postalCode}
                    onChange={(postalCode) => onChange({ postalCode })}
                  />
                </div>
                <div className="contact-field-row">
                  <ContactTextField
                    label={localized('Country')}
                    value={item.country}
                    onChange={(country) => onChange({ country })}
                  />
                  <TypeField
                    value={item.type}
                    suggestions={BaseTypes}
                    onChange={(type) => onChange({ type })}
                  />
                </div>
              </div>
            )}
          </ListEditor>
        </EditSection>

        <EditSection icon={<Icons.Crown />}>
          <ListEditor<ContactBase['birthdays'][0]>
            items={data.birthdays || []}
            itemTemplate={{ date: { year: null, month: null, day: null } }}
            addLabel={localized('Add birthday')}
            onChange={(items) => onChange({ birthdays: items })}
          >
            {(item, onChange) => (
              <BirthdayInput value={item.date} onChange={(date) => onChange({ date })} />
            )}
          </ListEditor>
        </EditSection>

        {data.relations !== undefined && (
          <EditSection icon={<Icons.People />}>
            <ListEditor<ContactBase['relations'][0]>
              items={data.relations || []}
              itemTemplate={{ person: '', type: '' }}
              addLabel={localized('Add relationship')}
              onChange={(items) => onChange({ relations: items })}
            >
              {(item, onChange) => (
                <div className="contact-field-row">
                  <ContactTextField
                    label={localized('Relationship')}
                    value={item.person}
                    onChange={(person) => onChange({ person })}
                  />
                  <TypeField
                    value={item.type}
                    suggestions={RelationTypes}
                    onChange={(type) => onChange({ type })}
                  />
                </div>
              )}
            </ListEditor>
          </EditSection>
        )}

        <EditSection icon={<Icons.Link />}>
          <ListEditor<ContactBase['urls'][0]>
            items={data.urls || []}
            itemTemplate={{ value: '', type: '' }}
            addLabel={localized('Add website')}
            onChange={(items) => onChange({ urls: items })}
          >
            {(item, onChange) => (
              <div className="contact-field-row">
                <ContactTextField
                  type="url"
                  label={localized('Website')}
                  value={item.value}
                  onChange={(value) => onChange({ value })}
                />
                <TypeField
                  value={item.type}
                  suggestions={WebTypes}
                  onChange={(type) => onChange({ type })}
                />
              </div>
            )}
          </ListEditor>
        </EditSection>

        <EditSection icon={<Icons.Note />}>
          <ContactField label={localized('Notes')}>
            <textarea
              value={data.notes || ''}
              onChange={(e) => onChange({ notes: e.currentTarget.value })}
              rows={4}
            />
          </ContactField>
        </EditSection>
      </div>
    );
  }
}
