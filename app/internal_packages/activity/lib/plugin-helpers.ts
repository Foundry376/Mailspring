import { localized } from 'mailspring-exports';

export const OPEN_TRACKING_ID = 'open-tracking';

export function configForPluginId(id: string) {
  if (id === OPEN_TRACKING_ID) {
    return {
      name: 'open',
      verb: localized('open'),
      predicate: localized('Opened').toLocaleLowerCase(),
      iconName: 'icon-activity-mailopen.png',
      notificationInterval: 600000, // 60 minutes in ms
    };
  }
  return undefined;
}
