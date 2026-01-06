import React from 'react';
import { localized, DateUtils } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';
import moment from 'moment-timezone';

export interface TimeZoneSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

// Common time zones - a curated list of frequently used zones
const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
];

function formatTimezone(tz: string): string {
  const abbr = moment.tz(tz).format('z');
  const offset = moment.tz(tz).format('Z');
  // Convert "America/New_York" to "New York"
  const name = tz.split('/').pop().replace(/_/g, ' ');
  return `${abbr} (${offset}) ${name}`;
}

export const TimeZoneSelector: React.FC<TimeZoneSelectorProps> = ({ value, onChange }) => {
  // Ensure current value is in the list
  const timezones = COMMON_TIMEZONES.includes(value)
    ? COMMON_TIMEZONES
    : [value, ...COMMON_TIMEZONES];

  return (
    <EventPropertyRow label={localized('time zone:')}>
      <select
        className="timezone-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {timezones.map(tz => (
          <option key={tz} value={tz}>
            {formatTimezone(tz)}
          </option>
        ))}
      </select>
    </EventPropertyRow>
  );
};
