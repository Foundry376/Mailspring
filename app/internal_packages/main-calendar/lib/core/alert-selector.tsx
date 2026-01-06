import React from 'react';
import { localized } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';

export type AlertTiming =
  | 'none'
  | '5min'
  | '10min'
  | '15min'
  | '30min'
  | '1hour'
  | '2hours'
  | '1day'
  | '2days'
  | '1week';

interface AlertSelectorProps {
  value: AlertTiming;
  onChange: (value: AlertTiming) => void;
}

const ALERT_OPTIONS: { value: AlertTiming; label: string }[] = [
  { value: 'none', label: localized('None') },
  { value: '5min', label: localized('5 minutes before') },
  { value: '10min', label: localized('10 minutes before') },
  { value: '15min', label: localized('15 minutes before') },
  { value: '30min', label: localized('30 minutes before') },
  { value: '1hour', label: localized('1 hour before') },
  { value: '2hours', label: localized('2 hours before') },
  { value: '1day', label: localized('1 day before') },
  { value: '2days', label: localized('2 days before') },
  { value: '1week', label: localized('1 week before') },
];

export const AlertSelector: React.FC<AlertSelectorProps> = ({ value, onChange }) => {
  return (
    <EventPropertyRow label={localized('alert:')}>
      <select
        className="alert-select"
        value={value}
        onChange={e => onChange(e.target.value as AlertTiming)}
      >
        {ALERT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </EventPropertyRow>
  );
};
