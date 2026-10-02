import React from 'react';
import classnames from 'classnames';
import { localized, AccountStore } from 'mailspring-exports';
import { ScrollRegion } from 'mailspring-component-kit';

import LoadingCover from '../dashboard/loading-cover';
import { Timespan, timespanEndsNow } from '../timespan';
import { exportCsv } from '../csv-export';
import { SegmentedControl } from '../segmented-control';
import {
  averageFirstOpenDelay,
  computeRecipientEngagement,
  EngagementStats,
  groupEngagementByDomain,
} from './engagement-stats';
import {
  ENGAGEMENT_TIERS,
  engagementScore,
  EngagementTier,
  tierDescription,
  tierFor,
  tierLabel,
} from './engagement-tiers';
import { EngagementCard } from './engagement-card';
import { ActivityFeedEmptyState } from '../feed/activity-feed-empty-state';

type GroupBy = 'recipient' | 'domain';
type SortBy = 'activity' | 'score';

/** Cards older than this are dimmed once the window is long enough for it to mean something. */
const STALE_AFTER_DAYS = 14;
const STALE_MIN_WINDOW_DAYS = 30;

/** Sharing one of these domains with the user does not make a recipient a colleague. */
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'yandex.com',
  'fastmail.com',
  'hey.com',
]);

function colleagueDomains() {
  return AccountStore.emailAddresses()
    .map((email) => email.split('@').pop().toLocaleLowerCase())
    .filter((domain) => !CONSUMER_DOMAINS.has(domain));
}

interface EngagementBoardProps {
  accountIds: string[];
  timespan: Timespan;
}

interface EngagementBoardState {
  loading: boolean;
  recipients: EngagementStats[];
  groupBy: GroupBy;
  sortBy: SortBy;
  search: string;
  hideColleagues: boolean;
}

/**
 * Recipients the user wrote to in the timespan, sorted into three engagement
 * tiers. Computed in one pass over the range whenever the range or accounts
 * change; the tab stays mounted so switching back is free.
 */
export default class EngagementBoard extends React.Component<
  EngagementBoardProps,
  EngagementBoardState
> {
  static displayName = 'EngagementBoard';

  _mounted = false;
  _computeVersion = 0;

  state: EngagementBoardState = {
    loading: true,
    recipients: [],
    groupBy: 'recipient',
    sortBy: 'activity',
    search: '',
    hideColleagues: true,
  };

  componentDidMount() {
    this._mounted = true;
    this._compute();
  }

  componentDidUpdate(prevProps: EngagementBoardProps) {
    if (
      prevProps.accountIds.join(',') !== this.props.accountIds.join(',') ||
      prevProps.timespan !== this.props.timespan
    ) {
      this._compute();
    }
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  async _compute() {
    const version = ++this._computeVersion;
    const { accountIds, timespan } = this.props;
    this.setState({ loading: true });
    const endUnix = timespanEndsNow(timespan) ? Date.now() / 1000 : timespan.endDate.unix();
    const recipients = await computeRecipientEngagement(
      accountIds,
      timespan.startDate.unix(),
      endUnix,
      () => !this._mounted || version !== this._computeVersion
    );
    if (recipients) {
      this.setState({ loading: false, recipients });
    }
  }

  _visibleEntries(): EngagementStats[] {
    const { recipients, groupBy, search, hideColleagues } = this.state;
    // Opens and clicks need tracking, but a reply is engagement on its own.
    let entries = recipients.filter((r) => r.tracked > 0 || r.replies > 0);
    if (hideColleagues) {
      const domains = colleagueDomains();
      entries = entries.filter((r) => !domains.includes(r.domain));
    }
    if (groupBy === 'domain') {
      entries = groupEngagementByDomain(entries);
    }
    const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      entries = entries.filter((e) => {
        const haystack = `${e.name} ${e.email} ${e.domain}`.toLocaleLowerCase();
        return terms.every((t) => haystack.includes(t));
      });
    }
    return entries;
  }

  _sorted(entries: EngagementStats[]) {
    const { sortBy } = this.state;
    return [...entries].sort((a, b) => {
      if (sortBy === 'score') {
        const diff = engagementScore(b) - engagementScore(a);
        if (diff !== 0) return diff;
      }
      return (b.lastActivityAt || b.lastSentAt) - (a.lastActivityAt || a.lastSentAt);
    });
  }

  _isStale(stats: EngagementStats) {
    if (this.props.timespan.days < STALE_MIN_WINDOW_DAYS) return false;
    const last = stats.lastActivityAt || stats.lastSentAt;
    return Date.now() / 1000 - last > STALE_AFTER_DAYS * 24 * 60 * 60;
  }

  _onExport = (entries: EngagementStats[]) => {
    exportCsv(
      'engagement.csv',
      [
        'Name',
        'Email',
        'Domain',
        'Tier',
        'Contacts',
        'Sent',
        'Engaged',
        'Opens',
        'Clicks',
        'Replies',
        'Avg Seconds To First Open',
        'Last Activity',
        'Last Sent',
      ],
      async (write) => {
        for (const e of entries) {
          const avg = averageFirstOpenDelay(e);
          await write([
            e.name,
            e.email,
            e.domain,
            tierFor(e),
            e.contacts,
            e.sent,
            e.engaged,
            e.opens,
            e.clicks,
            e.replies,
            avg === null ? '' : Math.round(avg),
            e.lastActivityAt === null ? '' : new Date(e.lastActivityAt * 1000).toISOString(),
            new Date(e.lastSentAt * 1000).toISOString(),
          ]);
        }
      }
    );
  };

  renderColumn(tier: EngagementTier, entries: EngagementStats[]) {
    return (
      <div key={tier} className={`engagement-column tier-${tier}`}>
        <div className="column-header">
          <span className="label">{tierLabel(tier)}</span>
          <span className="count">{entries.length}</span>
          <div className="description">{tierDescription(tier)}</div>
        </div>
        <ScrollRegion className="column-scroll">
          {entries.map((stats) => (
            <EngagementCard key={stats.key} stats={stats} stale={this._isStale(stats)} />
          ))}
        </ScrollRegion>
      </div>
    );
  }

  render() {
    const { loading, recipients, groupBy, sortBy, search, hideColleagues } = this.state;
    const entries = this._visibleEntries();
    const byTier = new Map<EngagementTier, EngagementStats[]>(ENGAGEMENT_TIERS.map((t) => [t, []]));
    for (const e of this._sorted(entries)) {
      byTier.get(tierFor(e)).push(e);
    }

    return (
      <div className="engagement-board">
        <div className="activity-toolbar">
          <input
            type="search"
            className="toolbar-search"
            placeholder={localized('Search by name, email, or domain…')}
            value={search}
            onChange={(e) => this.setState({ search: e.target.value })}
          />
          <SegmentedControl<GroupBy>
            value={groupBy}
            onChange={(id) => this.setState({ groupBy: id })}
            options={[
              { id: 'recipient', label: localized('Recipients') },
              { id: 'domain', label: localized('Domains') },
            ]}
          />
          <SegmentedControl<SortBy>
            value={sortBy}
            onChange={(id) => this.setState({ sortBy: id })}
            options={[
              { id: 'activity', label: localized('Recent') },
              { id: 'score', label: localized('Score') },
            ]}
          />
          <label className="toolbar-checkbox">
            <input
              type="checkbox"
              checked={hideColleagues}
              onChange={(e) => this.setState({ hideColleagues: e.target.checked })}
            />
            {localized('Hide colleagues')}
          </label>
          <div className="spacer" />
          <div className="event-count">
            {entries.length === 1
              ? localized('1 recipient')
              : localized('%@ recipients', entries.length)}
          </div>
          <div
            className={classnames('btn', { 'btn-disabled': entries.length === 0 })}
            onClick={entries.length === 0 ? undefined : () => this._onExport(entries)}
          >
            {localized('Export CSV')}
          </div>
        </div>
        <div className="engagement-body">
          <LoadingCover active={loading} />
          {!loading && !recipients.some((r) => r.tracked > 0 || r.replies > 0) && (
            <ActivityFeedEmptyState hasTrackedMessages={false} />
          )}
          <div className="engagement-columns">
            {ENGAGEMENT_TIERS.map((tier) => this.renderColumn(tier, byTier.get(tier)))}
          </div>
        </div>
      </div>
    );
  }
}
