import utf7 from 'utf7';
import React from 'react';
import { localized, AccountStore, PropTypes } from 'mailspring-exports';

interface SyncActivityProps {
  syncState: {
    [accountId: string]: {
      [folderId: string]: { bodyProgress: number; scanProgress: number; busy: boolean };
    };
  };
}
export class SyncActivity extends React.Component<SyncActivityProps> {
  static displayName = 'ExpandedSyncActivity';

  static propTypes = {
    syncState: PropTypes.object,
  };

  renderFolderProgress(folderPath, { bodyProgress, scanProgress, busy }) {
    let status = 'complete';
    let progressLabel = '';

    if (busy) {
      status = 'busy';
      if (scanProgress < 1) {
        progressLabel = localized(`Scanning`) + ` (${Math.round(scanProgress * 100)}%)`;
      } else if (bodyProgress < 1) {
        progressLabel = localized(`Caching mail`) + ` (${Math.round(bodyProgress * 100)}%)`;
      } else {
        progressLabel = localized(`Scanning`) + '...';
      }
    }

    const folderDisplayPath = utf7.imap.decode(folderPath);

    return (
      <div className={`folder-progress ${status}`} key={folderPath}>
        {folderDisplayPath} <span className="progress-label">{progressLabel}</span>
      </div>
    );
  }

  render() {
    let accountComponents: JSX.Element[] | JSX.Element = Object.entries(this.props.syncState).map(
      ([accountId, accountSyncState]) => {
        const account = AccountStore.accountForId(accountId);
        if (!account) {
          return null;
        }

        let folderComponents: JSX.Element[] | JSX.Element = Object.entries(accountSyncState).map(
          ([folderPath, folderState]) => {
            return this.renderFolderProgress(folderPath, folderState);
          }
        );

        if (folderComponents.length === 0) {
          folderComponents = <div>Gathering folders...</div>;
        }

        return (
          <div className="account" key={accountId}>
            <h2>{account.emailAddress}</h2>
            {folderComponents}
          </div>
        );
      }
    );

    if (accountComponents.length === 0) {
      accountComponents = (
        <div>
          <br />
          {localized('Looking for accounts...')}
        </div>
      );
    }

    return <div className="sync-activity">{accountComponents}</div>;
  }
}
