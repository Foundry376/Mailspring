import React from 'react';
import { MiniMonthView } from 'mailspring-component-kit';
import { CalendarSidebar } from '../internal_packages/main-calendar/lib/core/calendar-sidebar';
import { CalendarSourceList } from '../internal_packages/main-calendar/lib/core/calendar-source-list';

describe('CalendarSidebar', function () {
  it('shows the mini month above the Calendars list', function () {
    const sections = React.Children.toArray(
      new CalendarSidebar({}).render().props.children
    ) as React.ReactElement[];
    expect(sections[0].props.children.type).toBe(MiniMonthView);
    expect(sections[1].props.children.type).toBe(CalendarSourceList);
  });
});
