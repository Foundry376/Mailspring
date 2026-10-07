import React from 'react';
import { ipcRenderer } from 'electron';
import {
  Actions,
  WorkspaceStore,
  ComponentRegistry,
  DatabaseStore,
  Event,
  localized,
} from 'mailspring-exports';
import { NavRailItem } from 'mailspring-component-kit';
import { QuickEventButton } from './quick-event-button';
import { MailspringCalendar } from './core/mailspring-calendar';
import { CalendarSidebar } from './core/calendar-sidebar';
import { EventSearchBar } from './core/event-search-bar';
import { focusedEventInfoForEvents } from './core/calendar-data-source';

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
    {
      label: localized('Agenda'),
      command: 'calendar:view-agenda',
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

// Thread and View act on a thread list that's unmounted while the calendar shows, so they're
// swapped for the Calendar menu and restored at their old positions on the way out.
let _hiddenMenus: { index: number; item: MenuItem }[] | null = null;

function updateMenus() {
  const showing = WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Calendar;
  if (showing === (_hiddenMenus !== null)) return;

  let template = AppEnv.menu.template;
  if (showing) {
    _hiddenMenus = [];
    template.forEach((item, index) => {
      if (item.id === 'Thread' || item.id === 'View') _hiddenMenus.push({ index, item });
    });
    template = template.filter((item) => item.id !== 'Thread' && item.id !== 'View');
    template.splice(template.findIndex((item) => item.id === 'Edit') + 1, 0, calendarMenu);
  } else {
    template = template.filter((item) => item !== calendarMenu);
    for (const { index, item } of _hiddenMenus) template.splice(index, 0, item);
    _hiddenMenus = null;
  }
  AppEnv.menu.template = template;
  AppEnv.menu.update();
}

// Sent by the main process for application:show-calendar, from the Window menu or from an
// invitation's "View in Calendar" link in any window.
async function onShowCalendar(
  _event: Electron.IpcRendererEvent,
  focus?: { icsuid: string; accountId: string; recurrenceIdStart?: number }
) {
  if (WorkspaceStore.rootSheet() !== WorkspaceStore.Sheet.Calendar) {
    Actions.selectRootSheet(WorkspaceStore.Sheet.Calendar);
  } else if (WorkspaceStore.topSheet() === WorkspaceStore.Sheet.Preferences) {
    Actions.popSheet();
  }
  if (!focus) return;
  const { icsuid, accountId, recurrenceIdStart } = focus;
  const events = await DatabaseStore.findAll<Event>(Event).where({ icsuid, accountId });
  const info = focusedEventInfoForEvents(events, Date.now() / 1000, recurrenceIdStart);
  if (info) {
    Actions.focusCalendarEvent(info);
  }
}

const CalendarNavRailItem = () => (
  <NavRailItem
    label={localized('Calendar')}
    iconName="ic-calendar-month.png"
    command="application:show-calendar"
    isActive={() => WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Calendar}
  />
);
CalendarNavRailItem.displayName = 'CalendarNavRailItem';

let _unlistenWorkspace: (() => void) | null = null;

export function activate() {
  WorkspaceStore.defineSheet(
    'Calendar',
    { root: true },
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
  ComponentRegistry.register(EventSearchBar, {
    location: WorkspaceStore.Location.CalendarContent.Toolbar,
  });
  ComponentRegistry.register(CalendarNavRailItem, { role: 'NavRail:Item' });

  _unlistenWorkspace = WorkspaceStore.listen(updateMenus);
  ipcRenderer.on('show-calendar', onShowCalendar);
}

export function deactivate() {
  ComponentRegistry.unregister(CalendarSidebar);
  ComponentRegistry.unregister(MailspringCalendar);
  ComponentRegistry.unregister(QuickEventButton);
  ComponentRegistry.unregister(EventSearchBar);
  ComponentRegistry.unregister(CalendarNavRailItem);

  _unlistenWorkspace?.();
  ipcRenderer.removeListener('show-calendar', onShowCalendar);
}
