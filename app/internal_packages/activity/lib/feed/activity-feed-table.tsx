import React from 'react';
import moment from 'moment';
import { shell } from 'electron';
import { localized, DateUtils, Actions, Contact } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

import ActivityEventStore from '../activity-event-store';
import { ActivityEvent, eventCountLabel } from '../activity-events';
import { configForPluginId, LINK_TRACKING_ID } from '../plugin-helpers';
import { GroupBy } from './activity-feed-toolbar';

function compactTimeString(date: Date) {
  const opts: Intl.DateTimeFormatOptions = {
    hourCycle: AppEnv.config.get('core.workspace.use24HourClock') ? 'h23' : 'h12',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  if (date.getFullYear() !== new Date().getFullYear()) {
    opts.year = 'numeric';
  }
  return date.toLocaleString(navigator.language, opts);
}

function delayAfterSend(event: ActivityEvent) {
  return Math.max(0, event.timestamp - event.sentAt);
}

function humanizeDelay(seconds: number) {
  return moment.duration(seconds, 'seconds').humanize();
}

function averageDelayAfterSend(events: ActivityEvent[]) {
  if (events.length === 0) return null;
  const total = events.reduce((sum, e) => sum + delayAfterSend(e), 0);
  return total / events.length;
}

function recipientLabel(event: ActivityEvent) {
  if (event.recipient && event.recipient.name) return event.recipient.name;
  return event.recipientEmail || localized('Someone');
}

function composeTo(event: ActivityEvent) {
  const email = event.recipientEmail;
  if (!email) return;
  const contact = event.recipient || new Contact({ accountId: event.accountId, email, name: '' });
  Actions.composeNewDraftToRecipient(contact);
}

function openExternalLink(url: string) {
  if (/^(https?:|mailto:)/i.test(url)) {
    shell.openExternal(url);
  }
}

function RecipientLink({ event }: { event: ActivityEvent }) {
  const email = event.recipientEmail;
  const label = recipientLabel(event);
  if (!email) {
    return <span className="name">{label}</span>;
  }
  return (
    <a
      className="name"
      title={localized('Compose a message to %@', email)}
      onClick={() => composeTo(event)}
    >
      {label}
      {label !== email && <span className="email"> {email}</span>}
    </a>
  );
}

function SubjectLink({ event }: { event: ActivityEvent }) {
  const subject = event.subject || localized('(No Subject)');
  return (
    <a
      className="subject-link"
      title={localized('Open this message')}
      onClick={() => ActivityEventStore.popoutThread(event.threadId)}
    >
      {subject}
    </a>
  );
}

function ExternalLink({ url }: { url: string }) {
  return (
    <a className="link" title={url} onClick={() => openExternalLink(url)}>
      {url}
    </a>
  );
}

interface EventGroup {
  key: string;
  events: ActivityEvent[];
}

/** Groups are ordered by their most recent event, matching the flat feed order. */
function groupEvents(events: ActivityEvent[], groupBy: GroupBy): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const event of events) {
    const key =
      groupBy === 'recipient' ? (event.recipientEmail || '').toLocaleLowerCase() : event.messageId;
    let group = groups.get(key);
    if (!group) {
      group = { key, events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  }
  return Array.from(groups.values());
}

function EventRow({ event, groupBy }: { event: ActivityEvent; groupBy: GroupBy }) {
  const date = new Date(event.timestamp * 1000);
  const config = configForPluginId(event.pluginId);
  const isClick = event.pluginId === LINK_TRACKING_ID;

  return (
    <tr className="event-row">
      <td className="time" title={DateUtils.fullTimeString(date)}>
        {compactTimeString(date)}
        <span className="delay">
          {localized('%@ after sending', humanizeDelay(delayAfterSend(event)))}
        </span>
      </td>
      {groupBy !== 'recipient' && (
        <td className="recipient">
          <RecipientLink event={event} />
        </td>
      )}
      <td className="event">
        <RetinaImg
          className="activity-icon"
          name={config.iconName}
          mode={RetinaImg.Mode.ContentPreserve}
        />
        <span className="verb">{isClick ? localized('Clicked') : localized('Opened')}</span>
        {event.occurrences > 1 && (
          <span
            className="occurrences"
            title={localized('%@ times in total; this is the first', event.occurrences)}
          >
            {`${event.occurrences}×`}
          </span>
        )}
        {isClick && <ExternalLink url={event.linkUrl} />}
      </td>
      {groupBy !== 'message' && (
        <td className="subject">
          <SubjectLink event={event} />
        </td>
      )}
    </tr>
  );
}

function GroupRow({
  group,
  groupBy,
  colSpan,
}: {
  group: EventGroup;
  groupBy: GroupBy;
  colSpan: number;
}) {
  const first = group.events[0];
  const avgDelay = averageDelayAfterSend(group.events);
  return (
    <tr className="group-row">
      <td colSpan={colSpan}>
        <span className="label">
          {groupBy === 'recipient' ? (
            <RecipientLink event={first} />
          ) : (
            <SubjectLink event={first} />
          )}
        </span>
        {groupBy === 'message' && (
          <span className="count">
            {localized('sent %@', compactTimeString(new Date(first.sentAt * 1000)))}
          </span>
        )}
        <span className="count">{eventCountLabel(group.events.length)}</span>
        {avgDelay !== null && (
          <span className="count">
            {localized('avg. %@ after sending', humanizeDelay(avgDelay))}
          </span>
        )}
      </td>
    </tr>
  );
}

export function ActivityFeedTable({
  events,
  groupBy,
}: {
  events: ActivityEvent[];
  groupBy: GroupBy;
}) {
  const columns = [
    <th key="time" className="time">
      {localized('When')}
    </th>,
    groupBy !== 'recipient' && (
      <th key="recipient" className="recipient">
        {localized('Recipient')}
      </th>
    ),
    <th key="event" className="event">
      {localized('Activity')}
    </th>,
    groupBy !== 'message' && (
      <th key="subject" className="subject">
        {localized('Message')}
      </th>
    ),
  ].filter(Boolean);

  const eventKey = (e: ActivityEvent) =>
    `${e.messageId}-${e.pluginId}-${e.timestamp}-${e.recipientEmail}-${e.linkUrl || ''}`;

  const rows: React.ReactNode[] = [];
  if (groupBy === 'none') {
    events.forEach((event, i) => {
      rows.push(<EventRow key={`${eventKey(event)}-${i}`} event={event} groupBy={groupBy} />);
    });
  } else {
    for (const group of groupEvents(events, groupBy)) {
      rows.push(
        <GroupRow
          key={`group-${group.key}`}
          group={group}
          groupBy={groupBy}
          colSpan={columns.length}
        />
      );
      group.events.forEach((event, i) => {
        rows.push(
          <EventRow key={`${group.key}-${eventKey(event)}-${i}`} event={event} groupBy={groupBy} />
        );
      });
    }
  }

  return (
    <div className="activity-feed-table">
      <table>
        <thead>
          <tr>{columns}</tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
ActivityFeedTable.displayName = 'ActivityFeedTable';
