import React from 'react';
import { localized, Message, Rx } from 'mailspring-exports';
import { ScrollRegion } from 'mailspring-component-kit';

import { trackedMessagesQuery } from '../activity-data-source';
import * as ActivityActions from '../activity-actions';
import { ActivityEvent, eventsForMessages, foldRepeatedEvents } from '../activity-events';
import { LINK_TRACKING_ID, OPEN_TRACKING_ID } from '../plugin-helpers';
import { Timespan, timespanEndsNow } from '../timespan';
import { exportActivityEventsCsv } from './feed-csv-export';
import { ActivityFeedFilters, ActivityFeedToolbar } from './activity-feed-toolbar';
import { ActivityFeedTable } from './activity-feed-table';
import { ActivityFeedEmptyState } from './activity-feed-empty-state';

/**
 * Opens and clicks happen after a message is sent, so a message sent before the
 * selected timespan can still have events inside it. Event timestamps are not
 * queryable (they live in the metadata JSON), so the message query reaches this
 * far back before the timespan start and events are filtered by timestamp.
 */
const MESSAGE_LOOKBACK_SECONDS = 90 * 24 * 60 * 60;

interface ActivityFeedProps {
  accountIds: string[];
  timespan: Timespan;
}

interface ActivityFeedState {
  messages: Message[] | null;
  events: ActivityEvent[];
  filters: ActivityFeedFilters;
}

/**
 * Chronological list of every open and click within the selected timespan,
 * with search, filtering, grouping, and CSV export. The message query is live,
 * so new events appear as they arrive.
 */
export default class ActivityFeed extends React.Component<ActivityFeedProps, ActivityFeedState> {
  static displayName = 'ActivityFeed';

  _subscription: Rx.IDisposable | null = null;
  _unlistenSearch: () => void;
  _mounted = false;

  state: ActivityFeedState = {
    messages: null,
    events: [],
    filters: {
      search: '',
      kind: 'all',
      collapseRepeats: true,
      groupBy: 'none',
    },
  };

  componentDidMount() {
    this._mounted = true;
    this._unlistenSearch = ActivityActions.searchFeed.listen((search: string) =>
      this._onChangeFilters({ search })
    );
    this._subscribe();
  }

  componentDidUpdate(prevProps: ActivityFeedProps) {
    if (
      prevProps.accountIds.join(',') !== this.props.accountIds.join(',') ||
      prevProps.timespan !== this.props.timespan
    ) {
      this._subscribe();
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    this._unlistenSearch();
    this._unsubscribe();
  }

  _subscribe() {
    this._unsubscribe();
    const { accountIds, timespan } = this.props;
    const after = new Date((timespan.startDate.unix() - MESSAGE_LOOKBACK_SECONDS) * 1000);
    const before = timespanEndsNow(timespan) ? undefined : timespan.endDate.toDate();

    this._subscription = Rx.Observable.fromQuery(
      trackedMessagesQuery({ accountIds, after, before })
    ).subscribe((messages: Message[]) => {
      if (!this._mounted) return;
      this.setState({ messages, events: eventsForMessages(messages, { includeRepeats: true }) });
    });
  }

  _unsubscribe() {
    if (this._subscription) {
      this._subscription.dispose();
      this._subscription = null;
    }
  }

  _onChangeFilters = (patch: Partial<ActivityFeedFilters>) => {
    this.setState({ filters: { ...this.state.filters, ...patch } });
  };

  /**
   * Repeats are folded after the timespan and search filters so a row's time
   * and count describe the earliest and total occurrences within the range.
   */
  _filteredEvents(): ActivityEvent[] {
    const { search, kind, collapseRepeats } = this.state.filters;
    const { timespan } = this.props;
    const start = timespan.startDate.unix();
    const end = timespanEndsNow(timespan) ? Infinity : timespan.endDate.unix();

    let events = this.state.events.filter((e) => e.timestamp >= start && e.timestamp <= end);

    if (kind === 'open') {
      events = events.filter((e) => e.pluginId === OPEN_TRACKING_ID);
    } else if (kind === 'click') {
      events = events.filter((e) => e.pluginId === LINK_TRACKING_ID);
    }

    const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      events = events.filter((e) => {
        const haystack = [
          e.recipient ? e.recipient.displayName() : '',
          e.recipientEmail || '',
          e.subject || '',
          e.linkUrl || '',
        ]
          .join(' ')
          .toLocaleLowerCase();
        return terms.every((t) => haystack.includes(t));
      });
    }
    return collapseRepeats ? foldRepeatedEvents(events) : events;
  }

  _onExport = () => {
    exportActivityEventsCsv(this._filteredEvents());
  };

  render() {
    const { messages, filters } = this.state;
    const loaded = messages !== null;
    const events = loaded ? this._filteredEvents() : [];
    const hasFilters = !!filters.search.trim() || filters.kind !== 'all';

    let body: React.ReactNode = null;
    if (!loaded) {
      body = null;
    } else if (events.length === 0 && !hasFilters) {
      body = <ActivityFeedEmptyState hasTrackedMessages={messages.length > 0} />;
    } else if (events.length === 0) {
      body = <div className="empty-note">{localized('No activity matches your filters.')}</div>;
    } else {
      body = <ActivityFeedTable events={events} groupBy={filters.groupBy} />;
    }

    return (
      <div className="activity-feed">
        <ActivityFeedToolbar
          filters={filters}
          eventCount={events.length}
          onChange={this._onChangeFilters}
          onExport={this._onExport}
        />
        <ScrollRegion className="activity-feed-scroll">{body}</ScrollRegion>
      </div>
    );
  }
}
