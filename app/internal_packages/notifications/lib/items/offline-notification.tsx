import React from 'react';
import { localized, Actions, AccountStore, OnlineStatusStore } from 'mailspring-exports';
import { ListensToFluxStore } from 'mailspring-component-kit';

// Losing the network (usually a sleeping laptop) is expected and resolves on its own,
// so this is a quiet status line rather than a prominent Notification. Problems the user
// must act on - auth failures, crash loops - surface through AccountErrorNotification.
// It carries no data-priority so NotifWrapper never lets it hide those notifications.
function OfflineNotification({
  offlineEmails,
  allOffline,
}: {
  offlineEmails: string[];
  allOffline: boolean;
}) {
  if (offlineEmails.length === 0) {
    return false;
  }

  let label = localized('Offline');
  if (!allOffline) {
    label =
      offlineEmails.length === 1
        ? localized('%@ is offline', offlineEmails[0])
        : localized('%@ accounts are offline', offlineEmails.length);
  }

  return (
    <div className="offline-indicator" title={offlineEmails.join('\n')}>
      <span
        className="offline-indicator-label"
        onClick={() => {
          Actions.switchPreferencesTab('Accounts');
          Actions.openPreferences();
        }}
      >
        <span className="offline-indicator-dot" />
        {label}
      </span>
      <span
        className="offline-indicator-retry"
        onClick={() => AppEnv.mailsyncBridge.sendSyncMailNow()}
      >
        {localized('Try now')}
      </span>
    </div>
  );
}

OfflineNotification.displayName = 'OfflineNotification';

export default ListensToFluxStore(OfflineNotification, {
  stores: [OnlineStatusStore, AccountStore],
  getStateFromStores() {
    // Accounts in an error state have a dedicated notification, and their exited
    // process can no longer report connectivity.
    const syncingAccounts = AccountStore.accounts().filter((a) => !a.hasSyncStateError());
    const offlineEmails = syncingAccounts
      .filter((a) => !OnlineStatusStore.isAccountOnline(a.id))
      .map((a) => a.emailAddress);
    return { offlineEmails, allOffline: offlineEmails.length === syncingAccounts.length };
  },
});
