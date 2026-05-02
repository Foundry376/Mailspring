import React from 'react';
import { localized } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';

export type RepeatOption = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RepeatSelectorProps {
  value: RepeatOption;
  onChange: (value: RepeatOption) => void;
}

const REPEAT_OPTIONS: { value: RepeatOption; label: string }[] = [
  { value: 'none', label: localized('None') },
  { value: 'daily', label: localized('Every Day') },
  { value: 'weekly', label: localized('Every Week') },
  { value: 'monthly', label: localized('Every Month') },
  { value: 'yearly', label: localized('Every Year') },
];

export const RepeatSelector: React.FC<RepeatSelectorProps> = ({ value, onChange }) => {
  return (
    <EventPropertyRow label={localized('repeat:')}>
      <select
        className="repeat-select"
        value={value}
        onChange={(e) => onChange(e.target.value as RepeatOption)}
      >
        {REPEAT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </EventPropertyRow>
  );
};
