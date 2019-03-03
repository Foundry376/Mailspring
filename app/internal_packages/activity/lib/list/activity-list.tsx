import React from 'react';
import classnames from 'classnames';
import { localized, Actions, FocusedPerspectiveStore } from 'mailspring-exports';
import { Flexbox, ScrollRegion, RetinaImg } from 'mailspring-component-kit';

import ActivityEventStore from '../activity-event-store';
import * as ActivityActions from '../activity-actions';
import ActivityMailboxPerspective from '../activity-mailbox-perspective';
import ActivityListItemContainer from './activity-list-item-container';
import ActivityListEmptyState from './activity-list-empty-state';

class ActivityList extends React.Component<
  {},
  { collapsedToggles: {}; empty: boolean; actions: any[] }
> {
  static displayName = 'ActivityList';

  _unsub: () => void;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this._unsub = ActivityEventStore.listen(this._onDataChanged);
  }

  componentWillUnmount() {
    ActivityActions.markViewed();
    this._unsub();
  }

  _onDataChanged = () => {
    this.setState(this._getStateFromStores());
  };

  _onViewSummary = () => {
    if (document.activeElement && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const aids = FocusedPerspectiveStore.sidebarAccountIds();
    Actions.focusMailboxPerspective(new ActivityMailboxPerspective(aids));
  };

  _getStateFromStores() {
    const actions = ActivityEventStore.actions();
    return {
      actions: actions,
      empty: actions instanceof Array && actions.length === 0,
      collapsedToggles: this.state ? this.state.collapsedToggles : {},
    };
  }

  _groupActions(actions) {
    const groupedActions = [];
    for (const action of actions) {
      if (groupedActions.length > 0) {
        const currentGroup = groupedActions[groupedActions.length - 1];
        if (
          action.messageId === currentGroup[0].messageId &&
          action.pluginId === currentGroup[0].pluginId
        ) {
          groupedActions[groupedActions.length - 1].push(action);
        } else {
          groupedActions.push([action]);
        }
      } else {
        groupedActions.push([action]);
      }
    }
    return groupedActions;
  }

  renderActions() {
    if (this.state.empty) {
      return <ActivityListEmptyState />;
    }

    return this._groupActions(this.state.actions).map(group => (
      <ActivityListItemContainer
        key={`${group[0].messageId}-${group[0].timestamp}`}
        group={group}
      />
    ));
  }

  render() {
    const { actions, empty } = this.state;

    if (!actions) return null;

    const classes = classnames({
      'activity-list-container': true,
      empty: empty,
    });
    return (
      <Flexbox direction="column" height="none" className={classes} tabIndex={-1}>
        <ScrollRegion style={{ height: '100%' }}>{this.renderActions()}</ScrollRegion>
        {!empty && (
          <a className="activity-summary-cta" onClick={this._onViewSummary}>
            {localized('Activity View')}
            <RetinaImg
              name="activity-drill-down-arrow.png"
              style={{ paddingLeft: 6 }}
              mode={RetinaImg.Mode.ContentDark}
            />
          </a>
        )}
      </Flexbox>
    );
  }
}

export default ActivityList;
