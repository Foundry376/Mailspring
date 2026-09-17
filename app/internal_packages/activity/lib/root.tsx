import React from 'react';
import classnames from 'classnames';
import { ScrollRegion, ListensToFluxStore } from 'mailspring-component-kit';
import { localized, AccountStore, FocusedPerspectiveStore } from 'mailspring-exports';

import ActivityFeed from './feed/activity-feed';
import ActivityReports from './dashboard/root';
import EngagementBoard from './engagement/engagement-board';
import TimespanSelector from './timespan-selector';
import { DEFAULT_TIMESPAN_ID, Timespan, timespanForId } from './timespan';
import * as ActivityActions from './activity-actions';

export type ActivityTabId = 'feed' | 'engagement' | 'reports';

const TABS: { id: ActivityTabId; label: () => string }[] = [
  { id: 'feed', label: () => localized('Feed') },
  { id: 'engagement', label: () => localized('Engagement') },
  { id: 'reports', label: () => localized('Reports') },
];

function ActivityTabs({
  selected,
  onSelect,
}: {
  selected: ActivityTabId;
  onSelect: (id: ActivityTabId) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = TABS.findIndex((t) => t.id === selected);
    if (e.key === 'ArrowRight') {
      onSelect(TABS[(idx + 1) % TABS.length].id);
    } else if (e.key === 'ArrowLeft') {
      onSelect(TABS[(idx - 1 + TABS.length) % TABS.length].id);
    } else {
      return;
    }
    e.preventDefault();
  };

  return (
    <div className="activity-tabs hidden-on-web" role="tablist" onKeyDown={onKeyDown}>
      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === selected}
          tabIndex={tab.id === selected ? 0 : -1}
          className={classnames('tab', { active: tab.id === selected })}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label()}
        </div>
      ))}
    </div>
  );
}

class Root extends React.Component<
  { accountIds: string[] },
  { tab: ActivityTabId; timespan: Timespan }
> {
  static displayName = 'ActivityRoot';

  _unlisten: () => void;

  constructor(props) {
    super(props);
    const saved = AppEnv.savedState.activityTab;
    this.state = {
      tab: TABS.some((t) => t.id === saved) ? saved : 'feed',
      timespan: timespanForId(DEFAULT_TIMESPAN_ID),
    };
  }

  componentDidMount() {
    this._unlisten = ActivityActions.selectTab.listen(this._onSelectTab);
  }

  componentWillUnmount() {
    this._unlisten();
  }

  _onSelectTab = (tab: ActivityTabId) => {
    AppEnv.savedState.activityTab = tab;
    AppEnv.saveWindowState();
    this.setState({ tab });
  };

  _onChangeTimespan = (timespanId: string) => {
    this.setState({ timespan: timespanForId(timespanId) });
  };

  render() {
    const { accountIds } = this.props;
    const { tab, timespan } = this.state;
    const account = AccountStore.accountForId(accountIds[0]);

    return (
      <div className="activity-dashboard">
        <div className="header">
          <div style={{ flex: 1 }}>
            <h2>{localized('Activity')}</h2>
            <div className="accounts">
              {accountIds.length > 1 ? localized('All Accounts') : account && account.label}
            </div>
          </div>
          <TimespanSelector timespan={timespan} onChange={this._onChangeTimespan} />
        </div>
        <ActivityTabs selected={tab} onSelect={this._onSelectTab} />
        <div className="activity-tab-panel hidden-on-web" hidden={tab !== 'feed'}>
          <ActivityFeed accountIds={accountIds} timespan={timespan} />
        </div>
        <div className="activity-tab-panel hidden-on-web" hidden={tab !== 'engagement'}>
          <EngagementBoard accountIds={accountIds} timespan={timespan} />
        </div>
        <div className="activity-tab-panel" hidden={tab !== 'reports'}>
          <ScrollRegion className="activity-reports-scroll">
            <ActivityReports accountIds={accountIds} timespan={timespan} />
          </ScrollRegion>
        </div>
      </div>
    );
  }
}

export default ListensToFluxStore(Root, {
  stores: [FocusedPerspectiveStore],
  getStateFromStores: (props) => {
    return {
      ...props,
      accountIds: FocusedPerspectiveStore.current().accountIds,
    };
  },
});
