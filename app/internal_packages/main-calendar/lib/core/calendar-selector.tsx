import React from 'react';
import { Calendar, Account, localized } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';
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
    calsByAccountId[cal.accountId] = calsByAccountId[cal.accountId] || [];
    calsByAccountId[cal.accountId].push(cal);
  }

  const selectedColor = calcColor(selectedCalendarId);
  const selected = calendars.find((c) => c.id === selectedCalendarId);
  const accountLabelFor = (accountId: string) =>
    accounts.find((a) => a.id === accountId)?.label || accountId;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const calendarId = e.target.value;
    const calendar = calendars.find((c) => c.id === calendarId);
    if (calendar) {
      onChange(calendar.id, calendar.accountId);
    }
  };

  // Accounts often each have a calendar named "Calendar", so the closed control names the account
  // too. The select lies invisibly over that text, keeping the native menu and its account groups.
  return (
    <div className="calendar-selector">
      <div className="calendar-selector-dot" style={{ backgroundColor: selectedColor }} />
      <div className="calendar-selector-value" aria-hidden="true">
        <span className="calendar-selector-name">{selected?.name}</span>
        {selected && selected.name !== accountLabelFor(selected.accountId) && (
          <span className="calendar-selector-account">{accountLabelFor(selected.accountId)}</span>
        )}
        <span className="calendar-selector-chevron">
          <SVGIcons.ChevronDown />
        </span>
      </div>
      <select value={selectedCalendarId} onChange={handleChange} aria-label={localized('Calendar')}>
        {Object.keys(calsByAccountId).map((accountId) => {
          const cals = calsByAccountId[accountId];
          return (
            <optgroup key={accountId} label={accountLabelFor(accountId)}>
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
