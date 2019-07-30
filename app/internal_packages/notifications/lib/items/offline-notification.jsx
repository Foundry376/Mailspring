import { Component } from 'react';
import { OnlineStatusStore, React, PropTypes } from 'mailspring-exports';
import { RetinaImg, ListensToFluxStore } from 'mailspring-component-kit';

class OfflineNotification extends Component {
  componentDidMount = () => {
    // set offline notification left position
    this._resetLeftPosition();
  }
  componentDidUpdate = () => {
    // set offline notification left position
    this._resetLeftPosition();
  }
  _resetLeftPosition() {
    // set offline notification left position
    const offlineNotifs = document.querySelectorAll('.network-offline');
    if (offlineNotifs) {
      const columnEl = document.querySelector('.column-RootSidebar');
      for (const notif of offlineNotifs) {
        notif.style.left = `${columnEl.offsetWidth}px`;
      }
    }
  }
  render() {
    const { isOnline } = this.props;
    if (isOnline) {
      return false;
    }
    return (
      <div className="network-offline email-offline">
        <RetinaImg name={'no-network.svg'}
          style={{ width: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
        <span>Edison Mail is offline. Please check your network connection.</span>
      </div>
    );
  }
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
