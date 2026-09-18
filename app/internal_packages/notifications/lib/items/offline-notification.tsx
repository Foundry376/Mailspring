import React from 'react';
import { localized, AccountStore, OnlineStatusStore } from 'mailspring-exports';
import { Notification, ListensToFluxStore } from 'mailspring-component-kit';

function OfflineNotification({ offlineAccountIds }: { offlineAccountIds: string[] }) {
  if (offlineAccountIds.length === 0) {
    return false;
  }

  // Naming the account matters: with several accounts connected, a generic banner
  // gives no way to tell which mailbox is actually failing.
  const names = offlineAccountIds
    .map((id) => AccountStore.accountForId(id))
    .filter(Boolean)
    .map((a) => a.emailAddress);

  let title = localized('One or more accounts are having connection issues.');
  if (names.length === 1) {
    title = localized('%@ is having connection issues.', names[0]);
  } else if (names.length > 1) {
    title = localized('%@ are having connection issues.', names.join(', '));
  }

  return (
    <Notification
      className="offline"
      title={title}
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

export default ListensToFluxStore(OfflineNotification, {
  stores: [OnlineStatusStore],
  getStateFromStores() {
    return {
      offlineAccountIds: OnlineStatusStore.offlineAccountIds(),
    };
  },
});
