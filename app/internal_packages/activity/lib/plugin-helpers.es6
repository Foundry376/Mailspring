export const OPEN_TRACKING_ID = 'open-tracking';
export const LINK_TRACKING_ID = 'link-tracking';

export function pluginFor(id) {
  if (id === OPEN_TRACKING_ID) {
    return {
      name: 'open',
      predicate: 'opened',
      iconName: 'icon-activity-mailopen.png',
      notificationInterval: 600000, // 10 minutes in ms
    };
  }
  if (id === LINK_TRACKING_ID) {
    return {
      name: 'link',
      predicate: 'clicked',
      iconName: 'icon-activity-linkopen.png',
      notificationInterval: 10000, // 10 seconds in ms
    };
  }
  return undefined;
}
