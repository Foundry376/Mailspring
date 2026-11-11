import React from 'react';
import { localized, CalendarUtils, DateUtils } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';
import moment from 'moment-timezone';

export interface TimeZoneSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

// Friendly display names for common timezones
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
export const COMMON_TIMEZONES = Object.keys(TIMEZONE_DISPLAY_NAMES);

/**
 * The zone's name; given `atUnix`, led by its offset then, "(GMT+9) Japan Standard Time", since
 * DST moves it. A zone tzdata doesn't know keeps its name alone.
 */
export function formatTimezone(tz: string, atUnix?: number): string {
  const name = TIMEZONE_DISPLAY_NAMES[tz] ?? tz.split('/').pop().replace(/_/g, ' ');
  const zone = atUnix === undefined ? null : CalendarUtils.resolveIanaZone(tz);
  if (!zone) return name;
  const minutes = moment.tz(atUnix * 1000, zone).utcOffset();
  const hours = `${minutes < 0 ? '-' : '+'}${Math.floor(Math.abs(minutes) / 60)}`;
  const rest = Math.abs(minutes) % 60;
  return `(GMT${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}) ${name}`;
}

export const TimeZoneSelector: React.FC<TimeZoneSelectorProps> = ({ value, onChange }) => {
  // Ensure current value is in the list
  const timezones = COMMON_TIMEZONES.includes(value)
    ? COMMON_TIMEZONES
    : [value, ...COMMON_TIMEZONES];

  return (
    <EventPropertyRow label={localized('time zone:')}>
      <select className="timezone-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {timezones.map((tz) => (
          <option key={tz} value={tz}>
            {formatTimezone(tz)}
          </option>
        ))}
      </select>
    </EventPropertyRow>
  );
};
