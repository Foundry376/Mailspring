import React from 'react';
import { localized, OnlineStatusStore, PropTypes } from 'mailspring-exports';
import { Notification, ListensToFluxStore } from 'mailspring-component-kit';

function OfflineNotification({ isOnline }) {
  if (isOnline) {
    return false;
  }

  return (
    <Notification
      className="offline"
      title={localized('One or more accounts are having connection issues.')}
      subtitle={localized(`Retrying...`)}
      priority="5"
      icon="volstead-offline.png"
      actions={[
        {
          id: 'try_now',
          label: localized('Try now'),
          fn: () => AppEnv.mailsyncBridge.sendSyncMailNow(),
        },
      ]}
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
