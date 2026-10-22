import React from 'react';
import classnames from 'classnames';
import { ScrollRegion, ListensToFluxStore } from 'mailspring-component-kit';
import { localized, Account, AccountStore } from 'mailspring-exports';

import ActivityFeed from './feed/activity-feed';
import ActivityReports from './dashboard/root';
import EngagementBoard from './engagement/engagement-board';
import TimespanSelector from './timespan-selector';
import AccountSelector from './account-selector';
import { DEFAULT_TIMESPAN_ID, Timespan, timespanForId, timespanRangeLabel } from './timespan';
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
  { accounts: Account[] },
  { tab: ActivityTabId; timespan: Timespan; accountId: string | null }
> {
  static displayName = 'ActivityRoot';

  _unlisten: () => void;

  constructor(props) {
    super(props);
    const saved = AppEnv.savedState.activityTab;
    this.state = {
      tab: TABS.some((t) => t.id === saved) ? saved : 'feed',
      timespan: timespanForId(DEFAULT_TIMESPAN_ID),
      accountId: AppEnv.savedState.activityAccountId || null,
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

  _onSelectAccount = (accountId: string | null) => {
    AppEnv.savedState.activityAccountId = accountId;
    AppEnv.saveWindowState();
    this.setState({ accountId });
  };

  render() {
    const { accounts } = this.props;
    const { tab, timespan } = this.state;
    // Falls back to all accounts once the picked one is removed.
    const picked = accounts.find((a) => a.id === this.state.accountId);
    const accountIds = picked ? [picked.id] : accounts.map((a) => a.id);

    return (
      <div className="activity-dashboard">
        <div className="header">
          <h2>{localized('Activity')}</h2>
          <div className="timespan-text">{timespanRangeLabel(timespan)}</div>
          {accounts.length > 1 && (
            <AccountSelector
              accounts={accounts}
              accountId={picked ? picked.id : null}
              onChange={this._onSelectAccount}
            />
          )}
          <TimespanSelector timespan={timespan} onChange={this._onChangeTimespan} />
        </div>
        <ActivityTabs selected={tab} onSelect={this._onSelectTab} />
        <div className="activity-tab-panel hidden-on-web" hidden={tab !== 'feed'}>
          <ActivityFeed accountIds={accountIds} timespan={timespan} />
        </div>
        <div className="activity-tab-panel hidden-on-web" hidden={tab !== 'engagement'}>
          <EngagementBoard accountIds={accountIds} timespan={timespan} />
        </div>
        <div className="activity-tab-panel reports" hidden={tab !== 'reports'}>
          <ScrollRegion className="activity-reports-scroll">
            <ActivityReports accountIds={accountIds} timespan={timespan} />
          </ScrollRegion>
        </div>
      </div>
    );
  }
}

export default ListensToFluxStore(Root, {
  stores: [AccountStore],
  getStateFromStores: (props) => {
    return {
      ...props,
      accounts: AccountStore.accounts(),
    };
  },
});
