import React from 'react';
import { Actions, PropTypes, localized } from 'mailspring-exports';

function SyncingListState(props) {
  let message = localized('Looking for more messages');
  if (props.empty) {
    message = localized('Loading Messages');
  }
  return (
    <div className="syncing-list-state" style={{ width: '100%', textAlign: 'center' }}>
      {message}&hellip;
      <br />
      <a onClick={Actions.expandSyncState}>{localized('Show Progress')}</a>
    </div>
  );
}

SyncingListState.propTypes = {
  empty: PropTypes.bool,
};

export default SyncingListState;
