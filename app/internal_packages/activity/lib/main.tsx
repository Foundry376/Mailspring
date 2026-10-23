import React from 'react';
import { ipcRenderer } from 'electron';
import { localized, ComponentRegistry, WorkspaceStore, Actions } from 'mailspring-exports';
import { HasTutorialTip, NavRailItem, RetinaImg } from 'mailspring-component-kit';

import ActivityEventStore from './activity-event-store';
import ActivityListButton from './list/activity-list-button';
import Root from './root';

const ActivityListButtonWithTutorialTip = HasTutorialTip(ActivityListButton, {
  title: localized('Open and link tracking'),
  instructions: localized(
    "If you've enabled link tracking or read receipts, those events will appear here!"
  ),
});

// Sent by the main process for application:show-activity, from the rail, the Window menu or
// the shortcut.
function onShowActivity() {
  if (WorkspaceStore.rootSheet() !== WorkspaceStore.Sheet.Activity) {
    Actions.selectRootSheet(WorkspaceStore.Sheet.Activity);
  }
}

// The toolbar's pulse, drawn smaller: at its own size it's wider than the rail's other icons.
const ActivityNavRailItem = () => (
  <NavRailItem
    label={localized('Activity')}
    icon={
      <RetinaImg
        name="icon-toolbar-activity.png"
        mode={RetinaImg.Mode.ContentIsMask}
        style={{ width: 20, height: 15, WebkitMaskSize: 'contain' }}
      />
    }
    command="application:show-activity"
    isActive={() => WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Activity}
  />
);
ActivityNavRailItem.displayName = 'ActivityNavRailItem';

// Added by the plugin so it goes when the plugin is disabled. Spliced in after Calendar, since
// AppEnv.menu.add appends to the end of the Window menu.
const windowMenuItem = { label: localized('Activity'), command: 'application:show-activity' };

function windowMenu() {
  return AppEnv.menu.template.find((item) => item.id === 'Window');
}

function addWindowMenuItem() {
  const items = windowMenu().submenu;
  const calendarIdx = items.findIndex((item) => item.command === 'application:show-calendar');
  items.splice(calendarIdx + 1, 0, windowMenuItem);
  AppEnv.menu.update();
}

function removeWindowMenuItem() {
  const menu = windowMenu();
  menu.submenu = menu.submenu.filter((item) => item !== windowMenuItem);
  AppEnv.menu.update();
}

export function activate() {
  // summary view
  WorkspaceStore.defineSheet('Activity', { root: true }, { list: ['ActivityContent'] });

  ComponentRegistry.register(Root, {
    location: WorkspaceStore.Location.ActivityContent,
  });
  ComponentRegistry.register(ActivityNavRailItem, { role: 'NavRail:Item' });
  ipcRenderer.on('show-activity', onShowActivity);
  addWindowMenuItem();

  // list view in the mail and calendar toolbars, beside compose / new event
  ComponentRegistry.register(ActivityListButtonWithTutorialTip, {
    locations: [
      WorkspaceStore.Location.RootSidebar.Toolbar,
      WorkspaceStore.defineLocation('CalendarSidebar').Toolbar,
    ],
  });
  ActivityEventStore.activate();
}

export function deactivate() {
  // summary view
  ComponentRegistry.unregister(Root);
  ComponentRegistry.unregister(ActivityNavRailItem);
  ipcRenderer.removeListener('show-activity', onShowActivity);
  removeWindowMenuItem();

  // list view in top left
  ComponentRegistry.unregister(ActivityListButtonWithTutorialTip);
}
