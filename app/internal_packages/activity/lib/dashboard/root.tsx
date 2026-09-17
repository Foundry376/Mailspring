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
  MetricCard,
  MetricEmptyNote,
  MetricGraph,
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

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Delay ranges shared by the time-to-open and response-time charts. */
const DELAY_BUCKETS: { label: () => string; maxSeconds: number }[] = [
  { label: () => localized('< 5m'), maxSeconds: 5 * MINUTE },
  { label: () => localized('< 30m'), maxSeconds: 30 * MINUTE },
  { label: () => localized('< 1h'), maxSeconds: HOUR },
  { label: () => localized('< 4h'), maxSeconds: 4 * HOUR },
  { label: () => localized('< 1d'), maxSeconds: DAY },
  { label: () => localized('< 3d'), maxSeconds: 3 * DAY },
  { label: () => localized('3d+'), maxSeconds: Infinity },
];

function delayBucketIndex(delaySeconds: number) {
  return DELAY_BUCKETS.findIndex((b) => delaySeconds < b.maxSeconds);
}

function delayBuckets(delays: number[], detail: (count: number) => string): MetricBucket[] {
  const counts = Array(DELAY_BUCKETS.length).fill(0);
  for (const delay of delays) {
    counts[delayBucketIndex(delay)] += 1;
  }
  return DELAY_BUCKETS.map((b, i) => ({
    label: b.label(),
    value: counts[i],
    detail: detail(counts[i]),
  }));
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "3d 4h", "2h 15m", "12m", "< 1m". */
function formatDuration(seconds: number) {
  if (seconds < MINUTE) {
    return localized('< 1m');
  }
  const days = Math.floor(seconds / DAY);
  const hours = Math.floor((seconds % DAY) / HOUR);
  const minutes = Math.floor((seconds % HOUR) / MINUTE);
  if (days > 0) {
    return hours > 0 ? localized('%@d %@h', days, hours) : localized('%@d', days);
  }
  if (hours > 0) {
    return minutes > 0 ? localized('%@h %@m', hours, minutes) : localized('%@h', hours);
  }
  return localized('%@m', minutes);
}

/** Strips reply/forward prefixes so replies sent from a template group with it. */
function normalizeSubject(subject: string) {
  return (subject || '').replace(/^(\s*(re|fwd?|aw|wg)\s*:\s*)+/i, '').trim();
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

/** Per-day rate series with gaps (null) on days that had no denominator. */
function rateByDay(hits: number[], totals: number[]) {
  return totals.map((total, i) => (total ? hits[i] / total : null));
}

function countBuckets(labels: string[], counts: number[], detail: (n: number) => string) {
  return labels.map((label, i) => ({ label, value: counts[i], detail: detail(counts[i]) }));
}

// Indexed by Date.getDay() (Sunday = 0), so labels must not follow the locale's
// first day of the week or Monday-first locales would show Sunday's data as "Mo".
function weekdayLabels() {
  return Array.from({ length: 7 }, (_, i) => moment.weekdaysMin(i));
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

/**
 * Accumulated while scanning a thread's messages oldest-first. `outbound`
 * threads are ones you started; the reply fields on them describe the other
 * party. `awaitingReplySince` tracks inbound mail you have not yet answered.
 */
interface ThreadStatEntry {
  outbound: boolean;
  subject: string;
  tracked: boolean;
  hasReply: boolean;
  opened: boolean;
  clicked: boolean;
  /** Unix seconds of the first message seen; for outbound threads, when you sent it. */
  startedAt: number;
  /** Seconds from your first message to the first reply, for outbound threads. */
  replyDelay?: number;
  receivedAny: boolean;
  youReplied: boolean;
  awaitingReplySince?: number;
}

function newThreadStat(outbound: boolean, subject: string, startedAt: number): ThreadStatEntry {
  return {
    outbound,
    subject,
    startedAt,
    tracked: false,
    hasReply: false,
    opened: false,
    clicked: false,
    receivedAny: false,
    youReplied: false,
  };
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

/** A rate and the counts behind it, e.g. 84 of 100 tracked messages opened. */
interface RateMetric {
  hits: number;
  total: number;
}

interface DelayMetric {
  medianSeconds?: number;
  buckets: MetricBucket[];
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
    receivedTimeOfDay: MetricBucket[];
    sentByDay: number[];
    percentUsingTracking: number;
    opened: RateMetric;
    openedByDay: (number | null)[];
    linkClicked: RateMetric;
    linkClickedByDay: (number | null)[];
    replied: RateMetric;
    repliedByDay: (number | null)[];
    /** Inbound threads you answered, and how quickly. */
    youReplied: RateMetric;
    yourResponseTime: DelayMetric;
    /** Threads you started that got a reply, and how quickly. */
    theirResponseTime: DelayMetric;
  };
}

function percentOf({ hits, total }: RateMetric) {
  return Math.round((hits / (total || 1)) * 100);
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

interface RootProps {
  timespan: Timespan;
  accountIds: string[];
}

export default class ActivityReports extends React.Component<RootProps, RootState> {
  static displayName = 'ActivityReports';

  _mounted = false;

  constructor(props: RootProps) {
    super(props);
    this.state = this.getLoadingState(props);
  }

  componentDidUpdate(prevProps: RootProps) {
    if (
      prevProps.timespan !== this.props.timespan ||
      prevProps.accountIds !== this.props.accountIds
    ) {
      this.setState(this.getLoadingState(this.props), () => this._onComputeMetrics());
    }
  }

  getLoadingState({ timespan }: RootProps): RootState {
    return {
      version: 0,
      loading: true,
      metrics: {
        receivedByDay: Array(timespan.days).fill(0),
        receivedTimeOfDay: [],
        sentByDay: Array(timespan.days).fill(0),
        percentUsingTracking: 0,
        opened: { hits: 0, total: 0 },
        openedByDay: Array(timespan.days).fill(null),
        linkClicked: { hits: 0, total: 0 },
        linkClickedByDay: Array(timespan.days).fill(null),
        replied: { hits: 0, total: 0 },
        repliedByDay: Array(timespan.days).fill(null),
        youReplied: { hits: 0, total: 0 },
        yourResponseTime: { buckets: [] },
        theirResponseTime: { buckets: [] },
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
    const startUnix = startDate.unix();
    const endUnix = endDate.unix();

    const zerosByDay = () => Array(days).fill(0);
    const sentByDay = zerosByDay();
    const receivedByDay = zerosByDay();
    const receivedTimeOfDay = Array(24).fill(0);
    let sentTotal = 0;
    const openTracking = { hits: 0, total: 0 };
    const openTrackedByDay = zerosByDay();
    const openedByDay = zerosByDay();
    const linkTracking = { hits: 0, total: 0 };
    const linkTrackedByDay = zerosByDay();
    const linkClickedByDay = zerosByDay();
    const threadStats = new Map<string, ThreadStatEntry>();
    const threadStartDay = new Map<string, number>();
    const byLink: { [url: string]: LinkStatsEntry } = {};
    const firstOpenDelaysAll: number[] = [];
    const yourReplyDelays: number[] = [];
    const trackedByHour = Array(24).fill(0);
    const openedByHour = Array(24).fill(0);
    const trackedByWeekday = Array(7).fill(0);
    const openedByWeekday = Array(7).fill(0);

    await this._forEachMessageIn(accountIds, startUnix, endUnix, (message, messageUnix) => {
      const dayIdx = Math.floor((messageUnix - startUnix) / DAY);
      if (dayIdx > days - 1) {
        return;
      }
      const role = message.folder && message.folder.role;
      if (role === 'spam' || role === 'trash') {
        return;
      }

      const fromMe = message.isFromMe();
      let stats = threadStats.get(message.threadId);
      if (!stats) {
        // A reply you sent to a thread that began before the window is not a
        // thread you started, even though it is the first message we see.
        stats = newThreadStat(
          fromMe && !message.replyToHeaderMessageId,
          message.subject,
          messageUnix
        );
        threadStats.set(message.threadId, stats);
        threadStartDay.set(message.threadId, dayIdx);
      }

      if (fromMe) {
        sentTotal += 1;
        sentByDay[dayIdx] += 1;
        if (stats.awaitingReplySince !== undefined) {
          stats.youReplied = true;
          yourReplyDelays.push(Math.max(0, messageUnix - stats.awaitingReplySince));
          stats.awaitingReplySince = undefined;
        }
      } else {
        receivedByDay[dayIdx] += 1;
        receivedTimeOfDay[message.date.getHours()] += 1;
        // List mail is not waiting on a reply; keep it out of the response
        // rate so newsletters don't swamp the denominator.
        if (!message.listUnsubscribe) {
          stats.receivedAny = true;
          if (stats.awaitingReplySince === undefined) {
            stats.awaitingReplySince = messageUnix;
          }
        }
        if (stats.outbound && !stats.hasReply) {
          stats.hasReply = true;
          stats.replyDelay = Math.max(0, messageUnix - stats.startedAt);
        }
      }

      if (!fromMe) {
        return;
      }

      const hourIdx = message.date.getHours();
      const weekdayIdx = message.date.getDay();
      const openM = message.metadataForPluginId(OPEN_TRACKING_ID);
      if (openM) {
        stats.tracked = true;
        openTracking.total += 1;
        openTrackedByDay[dayIdx] += 1;
        trackedByHour[hourIdx] += 1;
        trackedByWeekday[weekdayIdx] += 1;
        if (openM.open_count > 0) {
          stats.opened = true;
          openTracking.hits += 1;
          openedByDay[dayIdx] += 1;
          openedByHour[hourIdx] += 1;
          openedByWeekday[weekdayIdx] += 1;
          firstOpenDelaysAll.push(...firstOpenDelays(message, openM.open_data || []));
        }
      }
      const linkM = message.metadataForPluginId(LINK_TRACKING_ID);
      if (linkM && linkM.tracked && linkM.links instanceof Array) {
        stats.tracked = true;
        linkTracking.total += 1;
        linkTrackedByDay[dayIdx] += 1;
        if (linkM.links.some((l) => l.click_count > 0)) {
          stats.clicked = true;
          linkTracking.hits += 1;
          linkClickedByDay[dayIdx] += 1;
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
    });

    const replied = { hits: 0, total: 0 };
    const startedByDay = zerosByDay();
    const repliedByDay = zerosByDay();
    const youReplied = { hits: 0, total: 0 };
    const theirReplyDelays: number[] = [];
    const bySubject: { [subject: string]: SubjectStatsEntry } = {};

    for (const [threadId, stats] of threadStats) {
      if (stats.receivedAny) {
        youReplied.total += 1;
        if (stats.youReplied) {
          youReplied.hits += 1;
        }
      }
      if (!stats.outbound) {
        continue;
      }
      replied.total += 1;
      startedByDay[threadStartDay.get(threadId)] += 1;
      if (stats.hasReply) {
        replied.hits += 1;
        repliedByDay[threadStartDay.get(threadId)] += 1;
        theirReplyDelays.push(stats.replyDelay);
      }
      if (!stats.tracked) {
        continue;
      }
      const subject = normalizeSubject(stats.subject);
      const entry = (bySubject[subject] = bySubject[subject] || {
        subject,
        count: 0,
        opens: 0,
        clicks: 0,
        replies: 0,
      });
      entry.count += 1;
      entry.replies += stats.hasReply ? 1 : 0;
      entry.opens += stats.opened ? 1 : 0;
      entry.clicks += stats.clicked ? 1 : 0;
    }

    const rate = (hits: number, count: number) => hits / count;
    const bySubjectSorted = Object.values(bySubject)
      .filter((a) => a.count > 1)
      .sort(
        (a, b) =>
          rate(b.replies, b.count) - rate(a.replies, a.count) ||
          rate(b.opens, b.count) - rate(a.opens, a.count) ||
          b.count - a.count
      );

    const byLinkSorted = Object.values(byLink).sort(
      (a, b) =>
        rate(b.messagesClicked, b.count) - rate(a.messagesClicked, a.count) || b.clicks - a.clicks
    );

    // Hold the loading state long enough that the reveal reads as deliberate
    // rather than flickering on fast scans.
    const animationDelay = Math.max(0, metricsComputeStarted + MINIMUM_THINKING_TIME - Date.now());

    setTimeout(() => {
      if (!this._mounted) {
        return;
      }
      const replyCount = (n: number) => localized('%@ replies', n);
      this.setState({
        loading: false,
        version: this.state.version + 1,
        metricsBySubjectLine: bySubjectSorted,
        metricsByLink: byLinkSorted,
        firstOpenBuckets: delayBuckets(firstOpenDelaysAll, (n) => localized('%@ first opens', n)),
        openRateByHour: rateBuckets(hourLabels(), trackedByHour, openedByHour),
        openRateByWeekday: rateBuckets(weekdayLabels(), trackedByWeekday, openedByWeekday),
        metrics: {
          receivedByDay,
          receivedTimeOfDay: countBuckets(hourLabels(), receivedTimeOfDay, (n) =>
            localized('%@ messages', n)
          ),
          sentByDay,
          percentUsingTracking: Math.round(
            (Math.max(openTracking.total, linkTracking.total) / (sentTotal || 1)) * 100
          ),
          opened: openTracking,
          openedByDay: rateByDay(openedByDay, openTrackedByDay),
          linkClicked: linkTracking,
          linkClickedByDay: rateByDay(linkClickedByDay, linkTrackedByDay),
          replied,
          repliedByDay: rateByDay(repliedByDay, startedByDay),
          youReplied,
          yourResponseTime: {
            medianSeconds: median(yourReplyDelays),
            buckets: delayBuckets(yourReplyDelays, replyCount),
          },
          theirResponseTime: {
            medianSeconds: median(theirReplyDelays),
            buckets: delayBuckets(theirReplyDelays, replyCount),
          },
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
    const { timespan } = this.props;
    const percent = (v: number) => `${Math.round(v * 100)}%`;
    const count = (n: number) => n.toLocaleString();
    const single = timespan.days === 1;
    const axisLeft = single ? '' : timespan.startDate.format('MMM D');
    const axisRight = single ? localized('Today') : timespan.endDate.format('MMM D');
    const medianOf = ({ medianSeconds }: DelayMetric) =>
      medianSeconds === undefined ? '—' : formatDuration(medianSeconds);

    const lowTrackingUsage = !loading && metrics.percentUsingTracking < 75;
    const lowTrackingPhrase =
      metrics.percentUsingTracking <= 1
        ? localized('not enabled on any')
        : localized('only enabled on %@%', metrics.percentUsingTracking);

    return (
      <div className="activity-reports">
        <LoadingCover active={loading} />

        <h3 className="section-title">{localized('Mailbox Summary')}</h3>
        <div className="metric-grid">
          <MetricCard
            title={localized('Messages Received')}
            value={count(sum(metrics.receivedByDay))}
          >
            <MetricGraph
              loading={loading}
              values={metrics.receivedByDay}
              left={axisLeft}
              right={axisRight}
            />
          </MetricCard>
          <MetricCard title={localized('Messages Sent')} value={count(sum(metrics.sentByDay))}>
            <MetricGraph
              loading={loading}
              values={metrics.sentByDay}
              left={axisLeft}
              right={axisRight}
            />
          </MetricCard>
          <MetricCard title={localized('Received by Time of Day')}>
            <MetricBuckets loading={loading} buckets={metrics.receivedTimeOfDay} />
          </MetricCard>
        </div>

        <h3 className="section-title">{localized('Replies and Response Time')}</h3>
        <div className="metric-grid">
          <MetricCard
            title={localized('Your Response Time')}
            value={medianOf(metrics.yourResponseTime)}
            detail={localized(
              'Median. You replied to %@ of %@ threads that emailed you (%@%).',
              count(metrics.youReplied.hits),
              count(metrics.youReplied.total),
              percentOf(metrics.youReplied)
            )}
          >
            <MetricBuckets loading={loading} buckets={metrics.yourResponseTime.buckets} />
          </MetricCard>
          <MetricCard
            title={localized('Recipient Response Time')}
            value={medianOf(metrics.theirResponseTime)}
            detail={localized(
              'Median. %@ of %@ threads you started got a reply (%@%).',
              count(metrics.replied.hits),
              count(metrics.replied.total),
              percentOf(metrics.replied)
            )}
          >
            <MetricBuckets loading={loading} buckets={metrics.theirResponseTime.buckets} />
          </MetricCard>
        </div>

        <h3 className="section-title">{localized('Read Receipts and Link Tracking')}</h3>
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
        <div className="metric-grid">
          <MetricCard
            title={localized('Open Rate')}
            value={`${percentOf(metrics.opened)}%`}
            detail={localized(
              '%@ of %@ tracked messages were opened',
              count(metrics.opened.hits),
              count(metrics.opened.total)
            )}
          >
            <MetricGraph
              loading={loading}
              values={metrics.openedByDay}
              left={axisLeft}
              right={axisRight}
            />
          </MetricCard>
          <MetricCard
            title={localized('Link Click Rate')}
            value={`${percentOf(metrics.linkClicked)}%`}
            detail={localized(
              '%@ of %@ tracked messages had a link clicked',
              count(metrics.linkClicked.hits),
              count(metrics.linkClicked.total)
            )}
          >
            <MetricGraph
              loading={loading}
              values={metrics.linkClickedByDay}
              left={axisLeft}
              right={axisRight}
            />
          </MetricCard>
          <MetricCard
            title={localized('Reply Rate')}
            value={`${percentOf(metrics.replied)}%`}
            detail={localized(
              '%@ of %@ threads you started got a reply',
              count(metrics.replied.hits),
              count(metrics.replied.total)
            )}
          >
            <MetricGraph
              loading={loading}
              values={metrics.repliedByDay}
              left={axisLeft}
              right={axisRight}
            />
          </MetricCard>
        </div>
        <div className="metric-grid">
          <MetricCard title={localized('Time to First Open')}>
            <MetricBuckets loading={loading} buckets={firstOpenBuckets} />
          </MetricCard>
          <MetricCard title={localized('Open Rate by Hour Sent')}>
            <MetricBuckets loading={loading} buckets={openRateByHour} formatValue={percent} />
          </MetricCard>
          <MetricCard title={localized('Open Rate by Day Sent')}>
            <MetricBuckets loading={loading} buckets={openRateByWeekday} formatValue={percent} />
          </MetricCard>
        </div>

        <h3 className="section-title">{localized('Best Templates and Subject Lines')}</h3>
        <div className="metric-grid">
          <MetricCard title={localized('Subject Lines with the Highest Reply Rate')} full>
            {metricsBySubjectLine.length === 0 ? (
              <MetricEmptyNote>
                {localizedReactFragment(
                  'Send more than one message using the same %@ or subject line to compare open rates and reply rates.',
                  <a onClick={this._onShowTemplates}>{localized('Template').toLocaleLowerCase()}</a>
                )}
              </MetricEmptyNote>
            ) : (
              <MetricsBySubjectTable data={metricsBySubjectLine} />
            )}
          </MetricCard>
        </div>

        <h3 className="section-title">{localized('Best Links')}</h3>
        <div className="metric-grid">
          <MetricCard title={localized('Links with the Highest Click Rate')} full>
            {metricsByLink.length === 0 ? (
              <MetricEmptyNote>
                {localized(
                  'Send messages with link tracking enabled to see which links recipients click most.'
                )}
              </MetricEmptyNote>
            ) : (
              <MetricsByLinkTable data={metricsByLink} />
            )}
          </MetricCard>
        </div>

        <div className="report-actions hidden-on-web">
          <div className="btn" onClick={this._onLearnMore}>
            {localized('Learn More')}
          </div>
          <div className="btn" onClick={this._onExport}>
            {localized('Export Raw Data')}
          </div>
          <ShareButton key={version} />
        </div>
      </div>
    );
  }
}
