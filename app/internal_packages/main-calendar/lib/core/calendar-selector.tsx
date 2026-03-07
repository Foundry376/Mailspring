import React from 'react';
import { Calendar, Account } from 'mailspring-exports';
import { calcColor, getEditableCalendars } from './calendar-helpers';

interface CalendarSelectorProps {
  calendars: Calendar[];
  accounts: Account[];
  disabledCalendars: string[];
  selectedCalendarId: string;
  onChange: (calendarId: string, accountId: string) => void;
}

export function CalendarSelector({
  calendars,
  accounts,
  disabledCalendars,
  selectedCalendarId,
  onChange,
}: CalendarSelectorProps) {
  const editableCalendars = getEditableCalendars(calendars, disabledCalendars);

  // Group by account
  const calsByAccountId: Record<string, Calendar[]> = {};
  for (const cal of editableCalendars) {
    (calsByAccountId[cal.accountId] ??= []).push(cal);
  }

  const selectedColor = calcColor(selectedCalendarId);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const calendarId = e.target.value;
    const calendar = calendars.find((c) => c.id === calendarId);
    if (calendar) {
      onChange(calendar.id, calendar.accountId);
    }
  };

  return (
    <div className="calendar-selector">
      <div className="calendar-selector-dot" style={{ backgroundColor: selectedColor }} />
      <select value={selectedCalendarId} onChange={handleChange}>
        {Object.keys(calsByAccountId).map((accountId) => {
          const cals = calsByAccountId[accountId];
          const account = accounts.find((a) => a.id === accountId);
          const accountLabel = account ? account.label : accountId;

          return (
            <optgroup key={accountId} label={accountLabel}>
              {cals.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
CalendarSelector.displayName = 'CalendarSelector';
