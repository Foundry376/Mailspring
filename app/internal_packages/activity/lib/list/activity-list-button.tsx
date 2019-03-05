import React from 'react';
import { Actions, ReactDOM, localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

import ActivityList from './activity-list';
import ActivityEventStore from '../activity-event-store';

class ActivityListButton extends React.Component<{}, { unreadCount: number | string }> {
  static displayName = 'ActivityListButton';

  _unsub: () => void;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this._unsub = ActivityEventStore.listen(this._onDataChanged);
  }

  componentWillUnmount() {
    this._unsub();
  }

  onClick = () => {
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(<ActivityList />, { originRect: buttonRect, direction: 'down' });
  };

  _onDataChanged = () => {
    this.setState(this._getStateFromStores());
  };

  _getStateFromStores() {
    return {
      unreadCount: ActivityEventStore.unreadCount(),
    };
  }

  render() {
    let unreadCountClass = 'unread-count';
    let iconClass = 'activity-toolbar-icon';
    if (this.state.unreadCount) {
      unreadCountClass += ' active';
      iconClass += ' unread';
    }
    return (
      <div
        tabIndex={-1}
        className="toolbar-activity"
        title={localized('View activity')}
        onClick={this.onClick}
      >
        <div className={unreadCountClass}>{this.state.unreadCount}</div>
        <RetinaImg
          name="icon-toolbar-activity.png"
          className={iconClass}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    );
  }
}

export default ActivityListButton;
