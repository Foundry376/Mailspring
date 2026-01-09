import React from 'react';
import { localized } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';

export type ShowAsOption = 'busy' | 'free' | 'tentative';

const SHOW_AS_OPTIONS: { value: ShowAsOption; label: string }[] = [
  { value: 'busy', label: localized('Busy') },
  { value: 'free', label: localized('Free') },
  { value: 'tentative', label: localized('Tentative') },
];

interface ShowAsSelectorProps {
  value: ShowAsOption;
  onChange: (value: ShowAsOption) => void;
}

export const ShowAsSelector: React.FC<ShowAsSelectorProps> = ({ value, onChange }) => {
  return (
    <EventPropertyRow label={localized('show as:')}>
      <select
        className="show-as-select"
        value={value}
        onChange={(e) => onChange(e.target.value as ShowAsOption)}
      >
        {SHOW_AS_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </EventPropertyRow>
  );
};
