import { OnlineStatusStore, React, PropTypes } from 'mailspring-exports';
import { Notification, ListensToFluxStore } from 'mailspring-component-kit';

function OfflineNotification({ isOnline }) {
  if (isOnline) {
    return false;
  }
  const subtitle = 'Please check your network connection.';

  return (
    <Notification
      className="offline"
      title="Edison Mail is offline"
      subtitle={subtitle}
      priority="5"
      icon="volstead-offline.png"
    />
  );
}
OfflineNotification.displayName = 'OfflineNotification';
OfflineNotification.propTypes = {
  isOnline: PropTypes.bool,
};

export default ListensToFluxStore(OfflineNotification, {
  stores: [OnlineStatusStore],
  getStateFromStores() {
    return {
      isOnline: OnlineStatusStore.isOnline(),
    };
  },
});
