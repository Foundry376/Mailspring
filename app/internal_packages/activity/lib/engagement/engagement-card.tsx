import React from 'react';
import moment from 'moment';
import { localized, Actions, Contact } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

import ActivityEventStore from '../activity-event-store';
import * as ActivityActions from '../activity-actions';
import { configForPluginId, LINK_TRACKING_ID, OPEN_TRACKING_ID } from '../plugin-helpers';
import { ActivityKind, averageFirstOpenDelay, EngagementStats } from './engagement-stats';

function activityLabel(kind: ActivityKind) {
  switch (kind) {
    case 'reply':
      return localized('Replied');
    case 'click':
      return localized('Clicked');
    default:
      return localized('Opened');
  }
}

function activityIcon(kind: ActivityKind) {
  switch (kind) {
    case 'reply':
      return 'icon-activity-replied.png';
    case 'click':
      return configForPluginId(LINK_TRACKING_ID).iconName;
    default:
      return configForPluginId(OPEN_TRACKING_ID).iconName;
  }
}

/** The icon carries the verb; the tooltip spells it out. */
function ActivityStatus({ kind, timestamp }: { kind: ActivityKind; timestamp: number }) {
  return (
    <span className="status" title={activityLabel(kind)}>
      <RetinaImg name={activityIcon(kind)} mode={RetinaImg.Mode.ContentPreserve} />
      {moment.unix(timestamp).fromNow()}
    </span>
  );
}

function statsLine(stats: EngagementStats) {
  const parts = [
    stats.sent === 1 ? localized('1 sent') : localized('%@ sent', stats.sent),
    stats.tracked < stats.sent ? localized('%@ tracked', stats.tracked) : null,
    stats.opens === 1 ? localized('1 open') : localized('%@ opens', stats.opens),
    stats.clicks === 1 ? localized('1 click') : localized('%@ clicks', stats.clicks),
    stats.replies === 1 ? localized('1 reply') : localized('%@ replies', stats.replies),
  ];
  const avgDelay = averageFirstOpenDelay(stats);
  if (avgDelay !== null) {
    parts.push(localized('avg. %@ to open', moment.duration(avgDelay, 'seconds').humanize()));
  }
  return parts.filter(Boolean).join(' · ');
}

/** `user-select: all` misbehaves on adjacent inline siblings, so selection is done explicitly. */
function SelectableText({ className, children }: { className: string; children: string }) {
  const selectAll = (e: React.MouseEvent<HTMLSpanElement>) => {
    const selection = window.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(e.currentTarget);
    selection.addRange(range);
  };
  return (
    <span className={`${className} selectable`} title={children} onClick={selectAll}>
      {children}
    </span>
  );
}

function ThreadRow({
  subject,
  threadId,
  status,
}: {
  subject: string;
  threadId: string;
  status: React.ReactNode;
}) {
  return (
    <div className="thread">
      <a
        className="subject"
        title={subject}
        onClick={() => ActivityEventStore.popoutThread(threadId)}
      >
        {subject || localized('(No Subject)')}
      </a>
      {status}
    </div>
  );
}

export function EngagementCard({ stats, stale }: { stats: EngagementStats; stale: boolean }) {
  const isDomain = !stats.email;

  const compose = () => {
    Actions.composeNewDraftToRecipient(
      new Contact({ name: stats.name, email: stats.email, accountId: undefined })
    );
  };
  const showActivity = () => {
    ActivityActions.searchFeed(isDomain ? `@${stats.domain}` : stats.email);
    ActivityActions.selectTab('feed');
  };

  const latestStatus =
    stats.lastSentActivityAt !== null ? (
      <ActivityStatus kind={stats.lastSentActivityKind} timestamp={stats.lastSentActivityAt} />
    ) : (
      <span className="status">
        {localized('Sent %@ · no activity', moment.unix(stats.lastSentAt).fromNow())}
      </span>
    );
  const engagedElsewhere =
    stats.lastActivityAt !== null && stats.lastActivityThreadId !== stats.lastSentThreadId;

  return (
    <div className={`engagement-card${stale ? ' stale' : ''}`}>
      <div className="title">
        <SelectableText className="name">
          {isDomain ? stats.domain : stats.name || stats.email}
        </SelectableText>
        {isDomain ? (
          <span className="detail contacts">
            {stats.contacts === 1
              ? localized('1 contact')
              : localized('%@ contacts', stats.contacts)}
          </span>
        ) : (
          stats.name && <SelectableText className="detail">{stats.email}</SelectableText>
        )}
      </div>
      <div className="stats">{statsLine(stats)}</div>
      <ThreadRow
        subject={stats.lastSentSubject}
        threadId={stats.lastSentThreadId}
        status={latestStatus}
      />
      {engagedElsewhere && (
        <ThreadRow
          subject={stats.lastActivitySubject}
          threadId={stats.lastActivityThreadId}
          status={<ActivityStatus kind={stats.lastActivityKind} timestamp={stats.lastActivityAt} />}
        />
      )}
      <div className="actions">
        {!isDomain && (
          <a onClick={compose}>
            {localized('Compose Email')}
            <RetinaImg name="activity-drill-down-arrow.png" mode={RetinaImg.Mode.ContentDark} />
          </a>
        )}
        <a onClick={showActivity}>
          {localized('View Events')}
          <RetinaImg name="activity-drill-down-arrow.png" mode={RetinaImg.Mode.ContentDark} />
        </a>
      </div>
    </div>
  );
}
EngagementCard.displayName = 'EngagementCard';
