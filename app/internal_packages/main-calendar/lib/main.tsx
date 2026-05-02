import React from 'react';
import { WorkspaceStore, ComponentRegistry, localized } from 'mailspring-exports';
import { QuickEventButton } from './quick-event-button';
import { MailspringCalendar } from './core/mailspring-calendar';
import { EventSearchBar } from './core/event-search-bar';

const Notice = () =>
  AppEnv.inDevMode() ? (
    <span />
  ) : (
    <div className="preview-notice">
      Calendar is launching later this year! This preview is read-only and only supports Google
      calendar.
    </div>
  );

Notice.displayName = 'Notice';

function adjustMenus() {
  const calendarMenu: (typeof AppEnv.menu.template)[0] = {
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

  const template = AppEnv.menu.template.filter(
    (item) => item.id !== 'Thread' && item.id !== 'View'
  );
  const editIndex = template.findIndex((item) => item.id === 'Edit');
  template.splice(editIndex + 1, 0, calendarMenu);

  AppEnv.menu.template = template;
  AppEnv.menu.update();
}

export function activate() {
  adjustMenus();

  ComponentRegistry.register(MailspringCalendar, {
    location: WorkspaceStore.Location.Center,
  });
  ComponentRegistry.register(Notice, {
    location: WorkspaceStore.Sheet.Main.Header,
  });
  ComponentRegistry.register(QuickEventButton, {
    location: WorkspaceStore.Location.Center.Toolbar,
  });
  ComponentRegistry.register(EventSearchBar, {
    location: WorkspaceStore.Location.Center.Toolbar,
  });
}

export function deactivate() {
  ComponentRegistry.unregister(MailspringCalendar);
  ComponentRegistry.unregister(QuickEventButton);
  ComponentRegistry.unregister(EventSearchBar);
}
