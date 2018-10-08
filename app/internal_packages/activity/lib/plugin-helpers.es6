import { localized } from 'mailspring-exports';

export const OPEN_TRACKING_ID = 'open-tracking';
export const LINK_TRACKING_ID = 'link-tracking';

export function configForPluginId(id) {
  if (id === OPEN_TRACKING_ID) {
    return {
      name: 'open',
      verb: localized('open'),
      predicate: localized('Opened').toLocaleLowerCase(),
      iconName: 'icon-activity-mailopen.png',
      notificationInterval: 600000, // 60 minutes in ms
    };
  }
  if (id === LINK_TRACKING_ID) {
    return {
      name: 'link',
      verb: localized('click'),
      predicate: localized('Clicked').toLocaleLowerCase(),
      iconName: 'icon-activity-linkopen.png',
      notificationInterval: 10000, // 10 seconds in ms
    };
  }
  return undefined;
}
