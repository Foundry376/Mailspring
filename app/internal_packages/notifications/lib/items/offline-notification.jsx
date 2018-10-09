import { localized, OnlineStatusStore, React, PropTypes, Actions } from 'mailspring-exports';
import { Notification, ListensToFluxStore } from 'mailspring-component-kit';

function OfflineNotification({ isOnline, retryingInSeconds }) {
  if (isOnline) {
    return false;
  }
  const subtitle = retryingInSeconds
    ? retryingInSeconds > 1
      ? localized(`Retrying in %@ seconds`, retryingInSeconds)
      : localized(`Retrying in 1 second`)
    : localized(`Retrying now...`);

  return (
    <Notification
      className="offline"
      title={localized('Mailspring is offline')}
      subtitle={subtitle}
      priority="5"
      icon="volstead-offline.png"
      actions={[
        {
          id: 'try_now',
          label: localized('Try now'),
          fn: () => Actions.checkOnlineStatus(),
        },
      ]}
    />
  );
}
OfflineNotification.displayName = 'OfflineNotification';
OfflineNotification.propTypes = {
  isOnline: PropTypes.bool,
  retryingInSeconds: PropTypes.number,
};

export default ListensToFluxStore(OfflineNotification, {
  stores: [OnlineStatusStore],
  getStateFromStores() {
    return {
      isOnline: OnlineStatusStore.isOnline(),
      retryingInSeconds: OnlineStatusStore.retryingInSeconds(),
    };
  },
});
