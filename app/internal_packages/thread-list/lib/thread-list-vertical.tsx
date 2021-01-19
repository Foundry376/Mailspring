import React from 'react';
import { InjectedComponentSet } from 'mailspring-component-kit';
import { WorkspaceStore } from 'mailspring-exports';

class ThreadListVertical extends React.Component<{}, { style: string; syncing: boolean }> {
  static displayName = 'ThreadListVertical';
  static containerRequired = false;

  render() {
    return (
      <>
        <div style={{ height: '50%', width: '100%', boxShadow: '0 0.5px 0 #dddddd' }}>
          <InjectedComponentSet
            matching={{ location: WorkspaceStore.Location.ThreadList, modes: ['split'] }}
          />
        </div>
        <div className="sheet-toolbar">
          <InjectedComponentSet
            matching={{ location: WorkspaceStore.Location.MessageList.Toolbar, modes: ['split'] }}
          />
        </div>
        <div style={{ height: '50%', width: '100%' }}>
          <InjectedComponentSet
            matching={{ location: WorkspaceStore.Location.MessageList, modes: ['split'] }}
          />
        </div>
      </>
    );
  }
}

export default ThreadListVertical;
