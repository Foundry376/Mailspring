import React from 'react';
import { InjectedComponentSet } from 'mailspring-component-kit';
import { WorkspaceStore } from 'mailspring-exports';

class ThreadListVertical extends React.Component<{}, { style: string; syncing: boolean }> {
  static displayName = 'ThreadListVertical';
  static containerRequired = false;

  render() {
    return (
      <>
        <div style={{ height: '40%', width: '100%' }}>
          <InjectedComponentSet
            matching={{ location: WorkspaceStore.Location.ThreadList, modes: ['split'] }}
          />
        </div>
        <div style={{ height: '60%', width: '100%', borderTop: '0.5px solid #dddddd' }}>
          <div className="sheet-toolbar" style={{ borderBottom: '0' }}>
            <InjectedComponentSet
              matching={{ location: WorkspaceStore.Location.MessageList.Toolbar, modes: ['split'] }}
            />
          </div>
          <InjectedComponentSet
            matching={{ location: WorkspaceStore.Location.MessageList, modes: ['split'] }}
          />
        </div>
      </>
    );
  }
}

export default ThreadListVertical;
