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
  | '1week'
  /** A reminder the event already had that none of the options describes. */
  | 'custom';

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

// Each timing's TRIGGER, as getAlarmTrigger normalizes one: an offset before DTSTART (RFC 5545
// section 3.8.6.3).
const ALERT_TRIGGERS: Record<Exclude<AlertTiming, 'none' | 'custom'>, string> = {
  '5min': '-PT5M',
  '10min': '-PT10M',
  '15min': '-PT15M',
  '30min': '-PT30M',
  '1hour': '-PT1H',
  '2hours': '-PT2H',
  '1day': '-P1D',
  '2days': '-P2D',
  '1week': '-P1W',
};

/** The TRIGGER to write for a timing, or null for none. */
export function alertTrigger(alert: AlertTiming): string | null {
  return alert === 'none' || alert === 'custom' ? null : ALERT_TRIGGERS[alert];
}

/** The timing an event's first reminder reads as; see ICSEventHelpers.getAlarmTrigger. */
export function alertForTrigger(trigger: string | null): AlertTiming {
  if (!trigger) return 'none';
  const match = Object.keys(ALERT_TRIGGERS).find((k) => ALERT_TRIGGERS[k] === trigger);
  return (match as AlertTiming) || 'custom';
}

/** A relative reminder on an all-day event goes off at midnight, so a new one starts with none. */
export function defaultAlert(isAllDay: boolean): AlertTiming {
  return isAllDay ? 'none' : '10min';
}

export const AlertSelector: React.FC<AlertSelectorProps> = ({ value, onChange }) => {
  return (
    <EventPropertyRow label={localized('alert:')}>
      <select
        className="alert-select"
        value={value}
        onChange={(e) => onChange(e.target.value as AlertTiming)}
      >
        {ALERT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {value === 'custom' && (
          <option value="custom" disabled>
            {localized('Custom')}
          </option>
        )}
      </select>
    </EventPropertyRow>
  );
};
