import React from 'react';
import { localized } from 'mailspring-exports';
import { ContactField } from './ContactField';

interface BirthdayDate {
  year: number;
  month: number;
  day: number;
}

// Both Google People and our vCard serializer treat a zero year as "year unknown".
export const BirthdayInput = ({
  value,
  onChange,
}: {
  // Google People birthdays can carry only a free-form `text` and no `date`.
  value: BirthdayDate | undefined;
  onChange: (date: BirthdayDate) => void;
}) => {
  const date = value || { year: null, month: null, day: null };
  const update = (changes: Partial<BirthdayDate>) => onChange({ ...date, ...changes });
  const toNumber = (str: string) => (str ? Number(str) : null);

  return (
    <div className="contact-field-row">
      <ContactField label={localized('Month')} className="birthday-month">
        <select
          value={date.month || ''}
          onChange={(e) => update({ month: toNumber(e.currentTarget.value) })}
        >
          <option value="" />
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' })}
            </option>
          ))}
        </select>
      </ContactField>
      <ContactField label={localized('Day')} className="birthday-day">
        <input
          type="number"
          min={1}
          max={31}
          value={date.day || ''}
          onChange={(e) => update({ day: toNumber(e.currentTarget.value) })}
        />
      </ContactField>
      <ContactField label={localized('Year (optional)')} className="birthday-year">
        <input
          type="number"
          value={date.year || ''}
          onChange={(e) => update({ year: toNumber(e.currentTarget.value) })}
        />
      </ContactField>
    </div>
  );
};
