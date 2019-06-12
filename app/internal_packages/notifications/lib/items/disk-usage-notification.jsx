import { SystemInfoStore, React, PropTypes, Actions } from 'mailspring-exports';
import { Notification, ListensToFluxStore } from 'mailspring-component-kit';

const availableThreshHoldInBytes = 1024 * 1024 * 1024; // 1 GB
const notificationIntervalThreshHold = 5 * 60 * 1000; // 5 min

function DiskUsageNotification({ diskStats, lastChecked = 0 }) {
  if (diskStats.totalInBytes === 0 || diskStats.availableInBytes > availableThreshHoldInBytes) {
    return false;
  }
  if (Date.now() - lastChecked < notificationIntervalThreshHold && lastChecked !== 0) {
    return false;
  }
  const subtitle = 'Disk space running low, certain features might become unstable.';

  return (
    <Notification
      className="offline"
      title="System disk space low"
      subtitle={subtitle}
      priority="5"
      icon="volstead-offline.png"
      actions={[
        {
          label: 'OK',
          fn: () => {
            Actions.updateLastSystemInfoCheck({ source: 'diskUsage' });
          },
        },
      ]}
    />
  );
}

DiskUsageNotification.displayName = 'DiskUsageNotification';
DiskUsageNotification.propTypes = {
  isOnline: PropTypes.bool,
};

export default ListensToFluxStore(DiskUsageNotification, {
  stores: [SystemInfoStore],
  getStateFromStores() {
    return {
      diskStats: SystemInfoStore.diskStats(),
      lastChecked: SystemInfoStore.lastChecked('diskUsage'),
    };
  },
});
