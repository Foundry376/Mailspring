import React from 'react';
import moment from 'moment';
import { shell } from 'electron';
import { RetinaImg } from 'mailspring-component-kit';
import {
  localized,
  localizedReactFragment,
  Message,
  DatabaseStore,
  Actions,
} from 'mailspring-exports';

import {
  MetricContainer,
  MetricStat,
  MetricGraph,
  MetricHistogram,
  MetricsBySubjectTable,
  MetricsByLinkTable,
  MetricBuckets,
  MetricBucket,
} from './metrics-components';

import ShareButton from './share-button';
import { LINK_TRACKING_ID, OPEN_TRACKING_ID } from '../plugin-helpers';
import { exportCsv } from '../csv-export';
import { forEachMessageIn } from '../message-scan';
import LoadingCover from './loading-cover';
import { Timespan } from '../timespan';

const MINIMUM_THINKING_TIME = 2000;

const FIRST_OPEN_BUCKETS: { label: () => string; maxSeconds: number }[] = [
  { label: () => localized('< 5m'), maxSeconds: 5 * 60 },
  { label: () => localized('< 30m'), maxSeconds: 30 * 60 },
  { label: () => localized('< 1h'), maxSeconds: 60 * 60 },
  { label: () => localized('< 4h'), maxSeconds: 4 * 60 * 60 },
  { label: () => localized('< 1d'), maxSeconds: 24 * 60 * 60 },
  { label: () => localized('< 3d'), maxSeconds: 3 * 24 * 60 * 60 },
  { label: () => localized('3d+'), maxSeconds: Infinity },
];

function firstOpenBucketIndex(delaySeconds: number) {
  return FIRST_OPEN_BUCKETS.findIndex((b) => delaySeconds < b.maxSeconds);
}

/** Seconds from send to each recipient's earliest open. */
function firstOpenDelays(message: Message, openData: { recipient: string; timestamp: number }[]) {
  const sentUnix = message.date.getTime() / 1000;
  const earliest = new Map<string, number>();
  for (const open of openData) {
    const key = open.recipient || '';
    const prev = earliest.get(key);
    if (prev === undefined || open.timestamp < prev) {
      earliest.set(key, open.timestamp);
    }
  }
  return Array.from(earliest.values()).map((t) => Math.max(0, t - sentUnix));
}

function rateBuckets(labels: string[], sent: number[], opened: number[]): MetricBucket[] {
  return labels.map((label, i) => ({
    label,
    value: sent[i] ? opened[i] / sent[i] : 0,
    detail: localized('%@ of %@ opened', opened[i], sent[i]),
  }));
}

function weekdayLabels() {
  const base = moment().startOf('week');
  return Array.from({ length: 7 }, (_, i) => base.clone().add(i, 'days').format('dd'));
}

function hourLabels() {
  return Array.from({ length: 24 }, (_, i) =>
    i % 6 === 0 ? moment().startOf('day').add(i, 'hours').format('hA').replace('M', '') : ''
  );
}

/** A message that links to the same URL twice still counts once toward that link's send total. */
function dedupeLinksByUrl(links: { url: string; click_count: number }[]) {
  const byUrl = new Map<string, { url: string; click_count: number }>();
  for (const link of links) {
    const existing = byUrl.get(link.url);
    if (existing) {
      existing.click_count += link.click_count || 0;
    } else {
      byUrl.set(link.url, { url: link.url, click_count: link.click_count || 0 });
    }
  }
  return Array.from(byUrl.values());
}

export interface ThreadStatEntry {
  outbound: boolean;
  subject?: string;
  tracked?: boolean;
  hasReply?: boolean;
  opened?: boolean;
  clicked?: boolean;
}

export interface SubjectStatsEntry {
  subject: string;
  count: number;
  opens: number;
  clicks: number;
  replies: number;
}

export interface LinkStatsEntry {
  url: string;
  /** Sent messages containing the link. */
  count: number;
  /** Sent messages in which the link was clicked at least once. */
  messagesClicked: number;
  clicks: number;
}

interface RootState {
  loading: boolean;
  version: number;
  metricsBySubjectLine: SubjectStatsEntry[];
  metricsByLink: LinkStatsEntry[];
  firstOpenBuckets: MetricBucket[];
  openRateByHour: MetricBucket[];
  openRateByWeekday: MetricBucket[];
  metrics: {
    receivedByDay: number[];
    receivedTimeOfDay: number[];
    sentByDay: number[];
    percentUsingTracking: number;
    percentOpened: number;
    percentLinkClicked: number;
    percentReplied: number;
  };
}

export default class ActivityReports extends React.Component<
  {
    timespan: Timespan;
    accountIds: string[];
  },
  RootState
> {
  static displayName = 'ActivityReports';

  _mounted = false;

  constructor(props) {
    super(props);
    this.state = this.getLoadingState(props);
  }

  componentDidUpdate(prevProps: { timespan: Timespan; accountIds: string[] }) {
    if (
      prevProps.timespan !== this.props.timespan ||
      prevProps.accountIds !== this.props.accountIds
    ) {
      this.setState(this.getLoadingState(this.props), () => this._onComputeMetrics());
    }
  }

  getLoadingState({ timespan }: { timespan: Timespan }) {
    return {
      version: 0,
      loading: true,
      metrics: {
        receivedByDay: Array(timespan.days).fill(0),
        receivedTimeOfDay: Array(24).fill(0),
        sentByDay: Array(timespan.days).fill(0),
        percentUsingTracking: 0,
        percentOpened: 0,
        percentLinkClicked: 0,
        percentReplied: 0,
      },
      metricsBySubjectLine: [],
      metricsByLink: [],
      firstOpenBuckets: [],
      openRateByHour: [],
      openRateByWeekday: [],
    };
  }

  componentDidMount() {
    setTimeout(this._onComputeMetrics, 10);
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  async _forEachMessageIn(
    accountIds: string[],
    startUnix: number,
    endUnix: number,
    callback: (message: Message, messageUnix: number) => void | Promise<void>
  ) {
    await forEachMessageIn(accountIds, startUnix, endUnix, callback, () => !this._mounted);
  }

  _onComputeMetrics = async () => {
    const metricsComputeStarted = Date.now();

    const {
      timespan: { startDate, endDate, days },
      accountIds,
    } = this.props;
    const dayUnix = 24 * 60 * 60;
    const startUnix = startDate.unix();
    const endUnix = endDate.unix();

    const sentByDay = Array(days).fill(0);
    const receivedByDay = Array(days).fill(0);
    const receivedTimeOfDay = Array(24).fill(0);
    let sentTotal = 0;
    let openTrackingEnabled = 0;
    let openTrackingTriggered = 0;
    let linkTrackingEnabled = 0;
    let linkTrackingTriggered = 0;
    const threadStats: { [threadId: string]: ThreadStatEntry } = {};
    const byLink: { [url: string]: LinkStatsEntry } = {};
    const firstOpenCounts = Array(FIRST_OPEN_BUCKETS.length).fill(0);
    const trackedByHour = Array(24).fill(0);
    const openedByHour = Array(24).fill(0);
    const trackedByWeekday = Array(7).fill(0);
    const openedByWeekday = Array(7).fill(0);

    await this._forEachMessageIn(accountIds, startUnix, endUnix, (message, messageUnix) => {
      const dayIdx = Math.floor((messageUnix - startUnix) / dayUnix);
      if (dayIdx > days - 1) {
        return;
      }

      // Received and Sent Metrics
      if (message.isFromMe()) {
        sentTotal += 1;
        sentByDay[dayIdx] += 1;

        if (threadStats[message.threadId] === undefined) {
          threadStats[message.threadId] = {
            outbound: true,
            subject: message.subject,
            tracked: false,
            hasReply: false,
            opened: false,
            clicked: false,
          };
        }
      } else {
        receivedByDay[dayIdx] += 1;
        if (threadStats[message.threadId]) {
          threadStats[message.threadId].hasReply = true;
        } else {
          threadStats[message.threadId] = {
            outbound: false,
          };
        }
      }

      // Time of Day Metrics
      const hourIdx = message.date.getHours();
      receivedTimeOfDay[hourIdx] += 1;

      // Link and Open Tracking Metrics
      const openM = message.metadataForPluginId(OPEN_TRACKING_ID);
      if (openM) {
        threadStats[message.threadId].tracked = true;
        openTrackingEnabled += 1;
        trackedByHour[hourIdx] += 1;
        trackedByWeekday[message.date.getDay()] += 1;
        if (openM.open_count > 0) {
          threadStats[message.threadId].opened = true;
          openTrackingTriggered += 1;
          openedByHour[hourIdx] += 1;
          openedByWeekday[message.date.getDay()] += 1;
          for (const delay of firstOpenDelays(message, openM.open_data || [])) {
            firstOpenCounts[firstOpenBucketIndex(delay)] += 1;
          }
        }
      }
      const linkM = message.metadataForPluginId(LINK_TRACKING_ID);
      if (linkM && linkM.tracked && linkM.links instanceof Array) {
        threadStats[message.threadId].tracked = true;
        linkTrackingEnabled += 1;
        if (linkM.links.some((l) => l.click_count > 0)) {
          threadStats[message.threadId].clicked = true;
          linkTrackingTriggered += 1;
        }
        for (const link of dedupeLinksByUrl(linkM.links)) {
          byLink[link.url] = byLink[link.url] || {
            url: link.url,
            count: 0,
            messagesClicked: 0,
            clicks: 0,
          };
          byLink[link.url].count += 1;
          byLink[link.url].clicks += link.click_count || 0;
          if (link.click_count > 0) {
            byLink[link.url].messagesClicked += 1;
          }
        }
      }
      return;
    });

    const outboundThreadStats = Object.values(threadStats).filter((stats) => stats.outbound);

    // compute total reply rate for all sent messages
    let threadsOutbound = 0;
    let threadsOutboundGotReply = 0;
    for (const stats of outboundThreadStats) {
      threadsOutbound += 1;
      if (stats.hasReply) {
        threadsOutboundGotReply += 1;
      }
    }

    // Aggregate open/link tracking of outbound threads by subject line
    const bySubject: { [subject: string]: SubjectStatsEntry } = {};
    for (const stats of outboundThreadStats) {
      if (!stats.tracked) {
        continue;
      }
      bySubject[stats.subject] = bySubject[stats.subject] || {
        subject: stats.subject,
        count: 0,
        opens: 0,
        clicks: 0,
        replies: 0,
      };
      bySubject[stats.subject].count += 1;
      if (stats.hasReply) {
        bySubject[stats.subject].replies += 1;
      }
      if (stats.opened) {
        bySubject[stats.subject].opens += 1;
      }
      if (stats.clicked) {
        bySubject[stats.subject].clicks += 1;
      }
    }

    const bySubjectSorted = Object.values(bySubject)
      .filter((a) => a.count > 1)
      .sort((a, b) => b.opens - a.opens);

    const byLinkSorted = Object.values(byLink).sort(
      (a, b) => b.messagesClicked / b.count - a.messagesClicked / a.count || b.clicks - a.clicks
    );

    // Okay! Make sure we've taken at least 1500ms and then fade in the stats
    const animationDelay = Math.max(0, metricsComputeStarted + MINIMUM_THINKING_TIME - Date.now());

    setTimeout(() => {
      if (!this._mounted) {
        return;
      }
      this.setState({
        loading: false,
        version: this.state.version + 1,
        metricsBySubjectLine: bySubjectSorted,
        metricsByLink: byLinkSorted,
        firstOpenBuckets: FIRST_OPEN_BUCKETS.map((b, i) => ({
          label: b.label(),
          value: firstOpenCounts[i],
          detail: localized('%@ first opens', firstOpenCounts[i]),
        })),
        openRateByHour: rateBuckets(hourLabels(), trackedByHour, openedByHour),
        openRateByWeekday: rateBuckets(weekdayLabels(), trackedByWeekday, openedByWeekday),
        metrics: {
          receivedByDay,
          receivedTimeOfDay,
          sentByDay,
          percentUsingTracking: Math.ceil(
            (Math.max(openTrackingEnabled, linkTrackingEnabled) / (sentTotal || 1)) * 100
          ),
          percentOpened: Math.ceil((openTrackingTriggered / (openTrackingEnabled || 1)) * 100),
          percentLinkClicked: Math.ceil((linkTrackingTriggered / (linkTrackingEnabled || 1)) * 100),
          percentReplied: Math.ceil((threadsOutboundGotReply / (threadsOutbound || 1)) * 100),
        },
      });
    }, animationDelay);
  };

  _onShowTemplates = () => {
    Actions.showTemplates();
  };

  _onExport = () => {
    const {
      timespan: { startDate, endDate },
      accountIds,
    } = this.props;

    exportCsv(
      'report.csv',
      ['Sent', 'From', 'To', 'Cc', 'Bcc', 'Date', 'Subject', 'Opens', 'Clicks'],
      (write) =>
        this._forEachMessageIn(accountIds, startDate.unix(), endDate.unix(), (message) => {
          let sent = 'false';
          let opens: string | number = '';
          let clicks: string | number = '';

          if (message.isFromMe()) {
            sent = 'true';
            opens = 'off';
            clicks = 'off';
            const openM = message.metadataForPluginId(OPEN_TRACKING_ID);
            if (openM) {
              opens = openM.open_count;
            }

            const linkM = message.metadataForPluginId(LINK_TRACKING_ID);
            if (linkM && linkM.tracked && linkM.links instanceof Array) {
              clicks = linkM.links.reduce((s, l) => s + l.click_count, 0);
            }
          }

          return write([
            sent,
            message.from.join(', '),
            message.to.join(', '),
            message.cc.join(', '),
            message.bcc.join(', '),
            message.date,
            message.subject,
            opens,
            clicks,
          ]);
        })
    );
  };

  _onLearnMore = () => {
    shell.openExternal('http://support.getmailspring.com/hc/en-us/articles/115002507891');
  };

  render() {
    const {
      metrics,
      metricsBySubjectLine,
      metricsByLink,
      firstOpenBuckets,
      openRateByHour,
      openRateByWeekday,
      version,
      loading,
    } = this.state;
    const percent = (v: number) => `${Math.round(v * 100)}%`;
    const lowTrackingUsage = !loading && metrics.percentUsingTracking < 75;
    let lowTrackingPhrase = `only enabled on ${metrics.percentUsingTracking}%`;
    if (metrics.percentUsingTracking <= 1) {
      lowTrackingPhrase = `not enabled on any`;
    }

    return (
      <div style={{ position: 'relative' }}>
        <LoadingCover active={loading} />
        <div className="section-divider">
          <div>{localized('Mailbox Summary')}</div>
        </div>
        <div className="section" style={{ display: 'flex' }}>
          <MetricContainer name={localized('Messages Received')}>
            <MetricGraph key={version} values={metrics.receivedByDay} loading={loading} />
          </MetricContainer>
          <MetricContainer name={localized('Messages Sent')}>
            <MetricGraph key={version} values={metrics.sentByDay} loading={loading} />
          </MetricContainer>
          <MetricContainer name={localized('Messages Time of Day')}>
            <MetricHistogram
              key={version}
              left="12AM"
              right="11PM"
              loading={loading}
              values={metrics.receivedTimeOfDay}
            />
          </MetricContainer>
        </div>
        <div className="section-divider">
          <div>{localized('Read Receipts and Link Tracking')}</div>
        </div>
        {lowTrackingUsage && (
          <div className="usage-note">
            {localizedReactFragment(
              `These features were %@ of the messages you sent
            in this time period, so these numbers do not reflect all of your activity. To enable
            read receipts and link tracking on emails you send, click the %@ or link tracking %@ icons in the composer.`,
              lowTrackingPhrase,
              <RetinaImg
                name="icon-activity-mailopen.png"
                className="hidden-on-web"
                mode={RetinaImg.Mode.ContentDark}
              />,
              <RetinaImg
                name="icon-activity-linkopen.png"
                className="hidden-on-web"
                mode={RetinaImg.Mode.ContentDark}
              />
            )}
          </div>
        )}
        <div className="section" style={{ display: 'flex' }}>
          <MetricContainer name={localized('Of your emails are opened')}>
            <MetricStat
              key={version}
              value={metrics.percentOpened}
              units="%"
              loading={loading}
              name={'read-receipts'}
            />
          </MetricContainer>
          <MetricContainer name={localized('Of recipients click a link')}>
            <MetricStat
              key={version}
              value={metrics.percentLinkClicked}
              units="%"
              loading={loading}
              name={'link-tracking'}
            />
          </MetricContainer>
          <MetricContainer name={localized('Of threads you start get a reply')}>
            <MetricStat
              key={version}
              value={metrics.percentReplied}
              units="%"
              loading={loading}
              name={'replies'}
            />
          </MetricContainer>
        </div>
        <div className="section" style={{ display: 'flex' }}>
          <MetricContainer name={localized('Time to first open')}>
            <MetricBuckets key={version} buckets={firstOpenBuckets} loading={loading} />
          </MetricContainer>
          <MetricContainer name={localized('Open rate by hour sent')}>
            <MetricBuckets key={version} buckets={openRateByHour} loading={loading} />
          </MetricContainer>
          <MetricContainer name={localized('Open rate by day sent')}>
            <MetricBuckets
              key={version}
              buckets={openRateByWeekday}
              loading={loading}
              formatValue={percent}
            />
          </MetricContainer>
        </div>

        <div className="section-divider">
          <div>{localized('Best Templates and Subject Lines')}</div>
        </div>
        <div className="section" style={{ display: 'flex' }}>
          {metricsBySubjectLine.length === 0 ? (
            <div className="empty-note">
              {localizedReactFragment(
                'Send more than one message using the same %@ or subject line to compare open rates and reply rates.',
                <a onClick={this._onShowTemplates}>{localized('Template').toLocaleLowerCase()}</a>
              )}
            </div>
          ) : (
            <MetricsBySubjectTable data={metricsBySubjectLine} />
          )}
        </div>

        <div className="section-divider">
          <div>{localized('Best Links')}</div>
        </div>
        <div className="section" style={{ display: 'flex' }}>
          {metricsByLink.length === 0 ? (
            <div className="empty-note">
              {localized(
                'Send messages with link tracking enabled to see which links recipients click most.'
              )}
            </div>
          ) : (
            <MetricsByLinkTable data={metricsByLink} />
          )}
        </div>
        <div className="section hidden-on-web" style={{ display: 'flex', textAlign: 'center' }}>
          <div style={{ display: 'flex', margin: 'auto' }}>
            <div className="btn" onClick={this._onLearnMore} style={{ minWidth: 115 }}>
              {localized('Learn More')}
            </div>
            <div
              className="btn"
              onClick={this._onExport}
              style={{ marginRight: 10, marginLeft: 10, minWidth: 135 }}
            >
              {localized('Export Raw Data')}
            </div>
            <ShareButton key={version} />
          </div>
        </div>
      </div>
    );
  }
}
