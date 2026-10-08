import React from 'react';
import { localized } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';

/** The event's TRANSP value, which is all iCalendar records about busy and free. */
export type ShowAsOption = 'OPAQUE' | 'TRANSPARENT';

const SHOW_AS_OPTIONS: { value: ShowAsOption; label: string }[] = [
  { value: 'OPAQUE', label: localized('Busy') },
  { value: 'TRANSPARENT', label: localized('Free') },
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
        {SHOW_AS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </EventPropertyRow>
  );
};
