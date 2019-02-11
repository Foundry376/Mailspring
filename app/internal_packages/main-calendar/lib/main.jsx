import React from 'react';
import { WorkspaceStore, ComponentRegistry } from 'mailspring-exports';
import CalendarWrapper from './calendar-wrapper';
import QuickEventButton from './quick-event-button';

const Notice = () => (
  <div className="preview-notice">
    Calendar is launching later this year! This preview is read-only and only supports Google
    calendar.
  </div>
);
Notice.displayName = 'Notice';

export function activate() {
  ComponentRegistry.register(CalendarWrapper, {
    location: WorkspaceStore.Location.Center,
  });
  ComponentRegistry.register(Notice, {
    location: WorkspaceStore.Sheet.Main.Header,
  });
  ComponentRegistry.register(QuickEventButton, {
    location: WorkspaceStore.Location.Center.Toolbar,
  });
}

export function deactivate() {
  ComponentRegistry.unregister(CalendarWrapper);
  ComponentRegistry.unregister(QuickEventButton);
}
