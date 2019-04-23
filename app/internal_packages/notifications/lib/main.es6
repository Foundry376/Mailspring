/* eslint no-unused-vars:0 */

import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import ActivitySidebar from './sidebar/activity-sidebar';
import NotifWrapper from './notif-wrapper';

import AccountErrorNotification from './items/account-error-notif';
import DefaultClientNotification from './items/default-client-notif';
import UnstableChannelNotification from './items/unstable-channel-notif';
import DevModeNotification from './items/dev-mode-notif';
import PleaseSubscribeNotification from './items/please-subscribe-notif';
import DisabledMailRulesNotification from './items/disabled-mail-rules-notif';
import OfflineNotification from './items/offline-notification';
import UpdateNotification from './items/update-notification';

const notifications = [
  AccountErrorNotification,
  DefaultClientNotification,
  UnstableChannelNotification,
  DevModeNotification,
  PleaseSubscribeNotification,
  DisabledMailRulesNotification,
  OfflineNotification,
  UpdateNotification,
];

export function activate() {
  if(AppEnv.inDevMode()){
    ComponentRegistry.register(ActivitySidebar, { location: WorkspaceStore.Location.RootSidebar });
  }
  ComponentRegistry.register(NotifWrapper, { location: WorkspaceStore.Sheet.Global.Footer });

  for (const notification of notifications) {
    ComponentRegistry.register(notification, { role: 'RootSidebar:Notifications' });
  }
}

export function serialize() { }

export function deactivate() {
  if(AppEnv.inDevMode()){
    ComponentRegistry.unregister(ActivitySidebar);
  }
  ComponentRegistry.unregister(NotifWrapper);

  for (const notification of notifications) {
    ComponentRegistry.unregister(notification);
  }
}
