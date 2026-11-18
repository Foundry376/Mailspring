import React from 'react';
import { ipcRenderer } from 'electron';
import { Actions, WorkspaceStore, ComponentRegistry, localized } from 'mailspring-exports';
import { NavRailItem } from 'mailspring-component-kit';
import { QuickEventButton } from './quick-event-button';
import { MailspringCalendar } from './core/mailspring-calendar';
import { CalendarSidebar } from './core/calendar-sidebar';
import { CalendarHeader } from './core/calendar-header';
import {
  EventRef,
  focusedOccurrenceForIcsuid,
  occurrenceStartUnix,
} from './core/calendar-data-source';
import { SidebarCalendarPanel } from './sidebar-calendar-panel';

type MenuItem = (typeof AppEnv.menu.template)[0];

const calendarMenu: MenuItem = {
  id: 'Calendar',
  label: localized('Calendar'),
  submenu: [
    {
      label: localized('New Event'),
      command: 'core:add-item',
    },
    { type: 'separator' },
    {
      label: localized('Delete Event'),
      command: 'core:delete-item',
    },
    { type: 'separator' },
    {
      label: localized('By Day'),
      command: 'calendar:view-day',
    },
    {
      label: localized('By Week'),
      command: 'calendar:view-week',
    },
    {
      label: localized('By Month'),
      command: 'calendar:view-month',
    },
    { type: 'separator' },
    {
      label: localized('Go to Today'),
      command: 'calendar:go-to-today',
    },
    {
      label: localized('Next'),
      command: 'calendar:navigate-next',
    },
    {
      label: localized('Previous'),
      command: 'calendar:navigate-previous',
    },
    { type: 'separator' },
    {
      label: localized('Find Events') + '...',
      command: 'core:focus-search',
    },
    { type: 'separator' },
    {
      label: localized('Refresh Calendars'),
      command: 'calendar:refresh-calendars',
    },
  ],
};

// Sent by the main process for application:show-calendar, from the Window menu or from an
// invitation's "View in Calendar" link in any window.
async function onShowCalendar(_event: Electron.IpcRendererEvent, focus?: EventRef) {
  if (WorkspaceStore.rootSheet() !== WorkspaceStore.Sheet.Calendar) {
    Actions.selectRootSheet(WorkspaceStore.Sheet.Calendar);
  }
  if (!focus) return;
  const occurrence = await focusedOccurrenceForIcsuid(focus, []);
  if (occurrence) {
    Actions.focusCalendarEvent({ id: occurrence.id, start: occurrenceStartUnix(occurrence) });
  }
}

const CalendarNavRailItem = () => (
  <NavRailItem
    label={localized('Calendar')}
    iconName="ic-calendar-month.png"
    order={2}
    command="application:show-calendar"
    isActive={() => WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Calendar}
  />
);
CalendarNavRailItem.displayName = 'CalendarNavRailItem';

export function activate() {
  WorkspaceStore.defineSheet(
    'Calendar',
    { root: true, menu: calendarMenu },
    { list: ['CalendarSidebar', 'CalendarContent'] }
  );

  ComponentRegistry.register(CalendarSidebar, {
    location: WorkspaceStore.Location.CalendarSidebar,
  });
  ComponentRegistry.register(MailspringCalendar, {
    location: WorkspaceStore.Location.CalendarContent,
  });
  ComponentRegistry.register(QuickEventButton, {
    location: WorkspaceStore.Location.CalendarSidebar.Toolbar,
  });
  ComponentRegistry.register(CalendarHeader, {
    location: WorkspaceStore.Location.CalendarContent.Toolbar,
  });
  ComponentRegistry.register(CalendarNavRailItem, { role: 'NavRail:Item' });
  ComponentRegistry.register(SidebarCalendarPanel, { role: 'MessageListSidebar:Panel' });

  ipcRenderer.on('show-calendar', onShowCalendar);
}

export function deactivate() {
  ComponentRegistry.unregister(CalendarSidebar);
  ComponentRegistry.unregister(MailspringCalendar);
  ComponentRegistry.unregister(QuickEventButton);
  ComponentRegistry.unregister(CalendarHeader);
  ComponentRegistry.unregister(CalendarNavRailItem);
  ComponentRegistry.unregister(SidebarCalendarPanel);

  ipcRenderer.removeListener('show-calendar', onShowCalendar);
}
