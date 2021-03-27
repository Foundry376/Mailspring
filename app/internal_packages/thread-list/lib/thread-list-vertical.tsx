import React from 'react';
import { InjectedComponentSet } from 'mailspring-component-kit';
import { WorkspaceStore } from 'mailspring-exports';
import { ResizableRegion, ResizableHandle } from '../../../src/components/resizable-region';

class ThreadListVertical extends React.Component<{}, { style: string; syncing: boolean }> {
  static displayName = 'ThreadListVertical';
  static containerRequired = false;

  render() {
    const minHeight = 100;
    const initialHeight = AppEnv.getThreadListVerticalHeight() || 400;
    return (
      <>
        <ResizableRegion
          minHeight={minHeight}
          initialHeight={initialHeight}
          handle={ResizableHandle.Bottom}
          onResize={h => this._onResize(h)}
        >
          <InjectedComponentSet
            matching={{ location: WorkspaceStore.Location.ThreadList, modes: ['split'] }}
          />
        </ResizableRegion>
        <ResizableRegion>
          <div style={{ height: '100%', width: '100%', borderTop: '0.5px solid #dddddd' }}>
            <div className="sheet-toolbar" style={{ borderBottom: '0' }}>
              <InjectedComponentSet
                matching={{ location: WorkspaceStore.Location.MessageList.Toolbar, modes: ['split'] }}
              />
            </div>
            <InjectedComponentSet
              matching={{ location: WorkspaceStore.Location.MessageList, modes: ['split'] }}
            />
          </div>
        </ResizableRegion>
      </>
    );
  }

  _onResize = (height) => {
    AppEnv.storeThreadListVerticalHeight(height);
  };

}

export default ThreadListVertical;
