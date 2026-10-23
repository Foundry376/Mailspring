import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MiniMonthView } from 'mailspring-component-kit';
import { Account } from '../src/flux/models/account';
import { Calendar } from '../src/flux/models/calendar';
import { CalendarSidebar } from '../internal_packages/main-calendar/lib/core/calendar-sidebar';
import { CalendarSourceList } from '../internal_packages/main-calendar/lib/core/calendar-source-list';

describe('CalendarSidebar', function () {
  it('shows the mini month above the Calendars list, with up and down arrows', function () {
    const sections = React.Children.toArray(
      new CalendarSidebar({}).render().props.children
    ) as React.ReactElement[];
    expect(sections[0].props.children.type).toBe(MiniMonthView);
    expect(sections[0].props.children.props.arrows).toBe('vertical');
    expect(sections[1].props.children.type).toBe(CalendarSourceList);
  });
});

describe('CalendarSourceList', function () {
  const work = new Account({ id: 'work', label: 'Work' } as any);
  const home = new Account({ id: 'home', label: 'Home' } as any);
  const calendar = (id: string, accountId: string) =>
    new Calendar({ id, accountId, name: id } as any);
  const calendars = [
    calendar('team', 'work'),
    calendar('holidays', 'work'),
    calendar('family', 'home'),
  ];

  const rowsUnder = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.outline-view')).map((section) => [
      section.querySelector('.heading .text').textContent,
      Array.from(section.querySelectorAll('.toggle-wrap label')).map((l) => l.textContent),
    ]);

  beforeEach(function () {
    AppEnv.savedState.calendarAccountsCollapsed = undefined;
  });
  afterEach(cleanup);

  it("heads one account's calendars with its name, with nothing to collapse", function () {
    AppEnv.savedState.calendarAccountsCollapsed = { work: true };
    const { container } = render(
      <CalendarSourceList
        accounts={[work, home]}
        calendars={calendars.filter((c) => c.accountId === 'work')}
        disabledCalendars={[]}
      />
    );
    expect(rowsUnder(container)).toEqual([['Work', ['team', 'holidays']]]);
    expect(container.querySelector('.collapse-button')).toBe(null);
  });

  it('folds each account away on its own once there are two, and remembers it', function () {
    const { container } = render(
      <CalendarSourceList accounts={[work, home]} calendars={calendars} disabledCalendars={[]} />
    );
    const carets = container.querySelectorAll('.collapse-button');
    expect(carets.length).toBe(2);

    fireEvent.click(carets[0]);
    expect(rowsUnder(container)).toEqual([
      ['Work', []],
      ['Home', ['family']],
    ]);
    expect(AppEnv.savedState.calendarAccountsCollapsed).toEqual({ work: true });

    fireEvent.click(carets[1]);
    expect(rowsUnder(container)).toEqual([
      ['Work', []],
      ['Home', []],
    ]);
    expect(AppEnv.savedState.calendarAccountsCollapsed).toEqual({ work: true, home: true });

    cleanup();
    const reopened = render(
      <CalendarSourceList accounts={[work, home]} calendars={calendars} disabledCalendars={[]} />
    );
    expect(rowsUnder(reopened.container)).toEqual([
      ['Work', []],
      ['Home', []],
    ]);

    fireEvent.click(reopened.container.querySelectorAll('.collapse-button')[0]);
    expect(rowsUnder(reopened.container)).toEqual([
      ['Work', ['team', 'holidays']],
      ['Home', []],
    ]);
  });
});
