import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { CalendarSelector } from '../internal_packages/main-calendar/lib/core/calendar-selector';

// Every account has a calendar named "Calendar", as Outlook, iCloud and Fastmail all create one.
const ACCOUNTS = [
  { id: 'a1', label: 'ben@outlook.com' },
  { id: 'a2', label: 'ben@icloud.com' },
] as any[];
const CALENDARS = [
  { id: 'c1', accountId: 'a1', name: 'Calendar', readOnly: false },
  { id: 'c2', accountId: 'a2', name: 'Calendar', readOnly: false },
  { id: 'c3', accountId: 'a2', name: 'Family', readOnly: false },
  { id: 'c4', accountId: 'a2', name: 'ben@icloud.com', readOnly: false },
] as any[];

describe('CalendarSelector', function () {
  afterEach(cleanup);

  const renderSelector = (selectedCalendarId: string) => {
    const onChange = jasmine.createSpy('onChange');
    const { container } = render(
      <CalendarSelector
        calendars={CALENDARS}
        accounts={ACCOUNTS}
        disabledCalendars={[]}
        selectedCalendarId={selectedCalendarId}
        onChange={onChange}
      />
    );
    return { onChange, container };
  };

  it('names the account of the calendar it shows', function () {
    const { container } = renderSelector('c2');
    expect(container.querySelector('.calendar-selector-name').textContent).toBe('Calendar');
    expect(container.querySelector('.calendar-selector-account').textContent).toBe(
      'ben@icloud.com'
    );
  });

  it('leaves the account off a calendar named after it', function () {
    const { container } = renderSelector('c4');
    expect(container.querySelector('.calendar-selector-account')).toBe(null);
  });

  it('lists the calendars under their accounts', function () {
    const { container } = renderSelector('c1');
    const groups = Array.from(container.querySelectorAll('optgroup')).map((g) => [
      g.label,
      Array.from(g.querySelectorAll('option')).map((o) => o.textContent),
    ]);
    expect(groups).toEqual([
      ['ben@outlook.com', ['Calendar']],
      ['ben@icloud.com', ['Calendar', 'Family', 'ben@icloud.com']],
    ]);
  });

  it('reports the calendar and account picked', function () {
    const { onChange, container } = renderSelector('c1');
    fireEvent.change(container.querySelector('select'), { target: { value: 'c3' } });
    expect(onChange).toHaveBeenCalledWith('c3', 'a2');
  });
});
