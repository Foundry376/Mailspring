import React from 'react';
import {
  Actions,
  Utils,
  FolderSyncProgressStore,
  TaskQueue,
  SendDraftTask,
} from 'mailspring-exports';

import SyncActivity from './sync-activity';
import SyncbackActivity from './syncback-activity';

const SEND_TASK_CLASSES = [SendDraftTask];

export default class ActivitySidebar extends React.Component {
  static displayName = 'ActivitySidebar';

  static containerRequired = false;

  static containerStyles = {
    minWidth: 165,
    maxWidth: 400,
  };

  constructor(props) {
    super(props);
    this.state = Object.assign({ expanded: false }, this._getStateFromStores(false));
  }

  _onDataChanged = () => {
    this.setState(this._getStateFromStores(this.state.expanded));
  };

  _getStateFromStores = isExpanded => {
    return {
      tasks: TaskQueue.queue(),

      // Sync state changes often and isn't rendered unless we're expanded.
      // To keep updates infrequent we only set it when expanded and use SCU.
      syncSummary: FolderSyncProgressStore.getSummary(),
      syncState: isExpanded ? FolderSyncProgressStore.getSyncState() : {},
    };
  };

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextState, this.state);
  }

  componentDidMount() {
    this._unlisteners = [
      TaskQueue.listen(this._onDataChanged),
      FolderSyncProgressStore.listen(this._onDataChanged),
      Actions.expandSyncState.listen(this._onExpand),
    ];
  }

  _onExpand = () => {
    this.setState(Object.assign({ expanded: true }, this._getStateFromStores(true)));
    Actions.expandChatPanelFiller(false);
  };

  _onCollapse = () => {
    this.setState(Object.assign({ expanded: false, syncState: {} }));
    Actions.expandChatPanelFiller(true);
  };

  componentWillUnmount() {
    for (const unlisten of this._unlisteners) {
      unlisten();
    }
  }

  render() {
    const { tasks, syncSummary, syncState, expanded } = this.state;

    const sendTasks = [];
    const nonSendTasks = [];
    tasks.forEach(task => {
      if (SEND_TASK_CLASSES.some(klass => task instanceof klass)) {
        sendTasks.push(task);
      } else {
        nonSendTasks.push(task);
      }
    });

    return (
      <div className="sidebar-activity-floating-container">
        <div className="sidebar-activity">
          {sendTasks.length ? <SyncbackActivity tasks={sendTasks} /> : null}
          {nonSendTasks.length || syncSummary.phrase ? (
            <div
              className="item"
              onClick={() => (expanded ? this._onCollapse() : this._onExpand())}
            >
              <div
                className="inner clickable"
                style={{ whiteSpace: 'nowrap', display: 'flex', flexDirection: 'row' }}
              >
                <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', flex: 1 }}>
                  {syncSummary.phrase || 'Syncing your mailbox'}
                  <span className={`ellipsis1`}>.</span>
                  <span className={`ellipsis2`}>.</span>
                  <span className={`ellipsis3`}>.</span>
                </div>
                {this.state.expanded && (
                  <a onClick={this.onCollapse} style={{ paddingLeft: 5 }}>
                    Hide
                  </a>
                )}
              </div>

              {this.state.expanded && (
                <div>
                  <SyncbackActivity tasks={nonSendTasks} />
                  <SyncActivity syncState={syncState} />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}
