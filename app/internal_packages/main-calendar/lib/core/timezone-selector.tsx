import React from 'react';
import { localized, DateUtils } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';
import moment from 'moment-timezone';

export interface TimeZoneSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

// Friendly display names for common timezones (like Apple Calendar)
const TIMEZONE_DISPLAY_NAMES: { [key: string]: string } = {
  'America/New_York': 'Eastern Time',
  'America/Chicago': 'Central Time',
  'America/Denver': 'Mountain Time',
  'America/Los_Angeles': 'Pacific Time',
  'America/Anchorage': 'Alaska Time',
  'Pacific/Honolulu': 'Hawaii Time',
  'America/Toronto': 'Eastern Time (Toronto)',
  'America/Vancouver': 'Pacific Time (Vancouver)',
  'America/Mexico_City': 'Central Time (Mexico)',
  'America/Sao_Paulo': 'Brasilia Time',
  'Europe/London': 'Greenwich Mean Time',
  'Europe/Paris': 'Central European Time',
  'Europe/Berlin': 'Central European Time',
  'Europe/Moscow': 'Moscow Time',
  'Asia/Dubai': 'Gulf Standard Time',
  'Asia/Kolkata': 'India Standard Time',
  'Asia/Singapore': 'Singapore Time',
  'Asia/Hong_Kong': 'Hong Kong Time',
  'Asia/Tokyo': 'Japan Standard Time',
  'Asia/Seoul': 'Korea Standard Time',
  'Australia/Sydney': 'Australian Eastern Time',
  'Australia/Perth': 'Australian Western Time',
  'Pacific/Auckland': 'New Zealand Time',
};

// Common time zones - a curated list of frequently used zones
const COMMON_TIMEZONES = Object.keys(TIMEZONE_DISPLAY_NAMES);

function formatTimezone(tz: string): string {
  // Use friendly name if available, otherwise format from timezone ID
  if (TIMEZONE_DISPLAY_NAMES[tz]) {
    return TIMEZONE_DISPLAY_NAMES[tz];
  }
  // Fallback: Convert "America/New_York" to "New York"
  const name = tz.split('/').pop().replace(/_/g, ' ');
  return name;
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
