import { RetinaImg } from 'mailspring-component-kit';

import React from 'react';
import fs from 'fs';
import { ipcRenderer } from 'electron';
import {
  Rx,
  Actions,
  AttachmentStore,
  Account,
  AccountStore,
  Calendar,
  CalendarConflict,
  File,
  localized,
  DateUtils,
  CalendarUtils,
  ICSEventHelpers,
  ICSParticipantStatus,
  Message,
  Event,
  EventRSVPTask,
  SyncbackEventTask,
  DatabaseStore,
  RegExpUtils,
} from 'mailspring-exports';
import ICAL from 'ical.js';
import {
  resolveRSVPTarget,
  resolveAddTo,
  planRSVPWrite,
  conflictCalendarIds,
  RSVPTargetResolution,
} from './rsvp-target';

import { findOneIana } from 'windows-iana';

const moment = require('moment-timezone');

const TEL_URI = /tel:\S+?(?=[.,;:]*(?:\s|$))/gi;

/**
 * A LOCATION is usually the video-call URL, most often followed by the rooms booked for it, so
 * each URL or tel: URI in it is linked and the rest stays text.
 */
export function renderLocation(location: string | undefined): React.ReactNode {
  if (!location) return null;

  const links: Array<{ start: number; end: number; href: string }> = [];
  for (const pattern of [RegExpUtils.urlRegex(), TEL_URI]) {
    for (const match of location.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (links.some((l) => start < l.end && end > l.start)) continue;
      links.push({ start, end, href: match[0] });
    }
  }
  if (!links.length) return location;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const { start, end, href } of links.sort((a, b) => a.start - b.start)) {
    if (start > cursor) nodes.push(location.slice(cursor, start));
    nodes.push(
      <a key={start} href={href}>
        {location.slice(start, end)}
      </a>
    );
    cursor = end;
  }
  if (cursor < location.length) nodes.push(location.slice(cursor));
  return nodes;
}

/**
 * The VEVENT of a synced calendar object that an invitation is about. An invitation for one
 * occurrence of a series names it by RECURRENCE-ID; the object's first VEVENT is the series.
 *
 * @returns null when the invitation names an occurrence the object has no VEVENT for.
 */
export function eventForInvitation(
  calendarIcs: string,
  recurrenceIdStart: number | undefined
): ICAL.Event | null {
  const { root, event } = CalendarUtils.parseICSString(calendarIcs);
  if (recurrenceIdStart === undefined) {
    return event;
  }
  const occurrence = root.getAllSubcomponents('vevent').find((vevent) => {
    const rid = vevent.getFirstPropertyValue('recurrence-id') as ICAL.Time | null;
    return rid && rid.toJSDate().getTime() / 1000 === recurrenceIdStart;
  });
  return occurrence ? new ICAL.Event(occurrence) : null;
}

interface CalendarCopy {
  rsvp: RSVPTargetResolution;
  /** The row shown and answered: our own copy when there is one, else the first synced. */
  display: Event | undefined;
  synced: ICAL.Event | null;
}

interface EventHeaderProps {
  message: Message;
  file: File;
}

interface EventHeaderState {
  /**
   * The invitation as mailed; the REPLY is built from it (RFC 5546 section 3.2.3). Google
   * rewrites ORGANIZER on a shared calendar's copy to an `@group.calendar.google.com` id.
   */
  inviteIcs?: string;
  inviteEvent?: ICAL.Event;
  /** Set when the emailed invitation is about one occurrence of a series, in unix seconds. */
  inviteRecurrenceIdStart?: number;
  icsMethod?: 'reply' | 'request' | 'cancel';
  /** The synced copy's VEVENT for this invitation when there is one, else the invitation. */
  icsEvent?: ICAL.Event;
  /** The synced calendar object `icsEvent` came from. */
  syncedIcs?: string;
  isOnCalendar?: boolean;
  /** Which calendar copy of this event, if any, our response will be written to. */
  rsvp?: RSVPTargetResolution;
  /** The slot checked for conflicts: the next occurrence of a series, else the event itself. */
  conflictWindow?: { start: number; end: number };
  /** Everything already on our calendars that overlaps that slot. */
  conflicts?: CalendarConflict[];
  /** Where the invitation would be added if we accept and it isn't on a calendar yet. */
  addTo?: Calendar;
  /** The calendars that could receive it, so the choice can be changed before answering. */
  addToChoices?: Calendar[];
  inflight?: ICSParticipantStatus;
}

/*
The EventHeader allows you to RSVP to a calendar invite embedded in an email. It also
looks to see if a matching event is present on your calendar. In most cases the event
will also be on your calendar, and that version is synced while the email attachment
version gets stale.

We try to show the RSVP status of the event on your calendar if it's present. If not,
we fall back to storing the RSVP status in message metadata (so the "Accept" button is
"sticky", even though we just fire off a RSVP message via email and never hear back.)
*/
export class EventHeader extends React.Component<EventHeaderProps, EventHeaderState> {
  static displayName = 'EventHeader';

  state: EventHeaderState = {
    icsEvent: undefined,
    icsMethod: undefined,
    inviteIcs: undefined,
    inviteEvent: undefined,
    inviteRecurrenceIdStart: undefined,
    syncedIcs: undefined,
    isOnCalendar: false,
    rsvp: undefined,
    conflictWindow: undefined,
    conflicts: undefined,
    addTo: undefined,
    addToChoices: undefined,
    inflight: undefined,
  };

  _mounted = false;
  _subscription: Rx.IDisposable;

  componentWillUnmount() {
    this._mounted = false;
    if (this._subscription) {
      this._subscription.dispose();
    }
  }

  componentDidMount() {
    this._mounted = true;
    this._loadICSAttachment();
  }

  componentDidUpdate(prevProps: EventHeaderProps, prevState: EventHeaderState) {
    if (prevState.inflight) {
      this.setState({ inflight: undefined });
    }
    // The attachment lands on disk when mailsync downloads the body, which can be after mount.
    if (!this.state.inviteIcs && prevProps.message !== this.props.message) {
      this._loadICSAttachment();
    }
  }

  async _loadICSAttachment() {
    const { file, message } = this.props;

    let data: string;
    try {
      // Mailsync sometimes saves an attachment under a sanitized name only the store can find.
      const filePath = await AttachmentStore.resolvePathForFile(file);
      data = await fs.promises.readFile(filePath, 'utf8');
    } catch (e) {
      return; // not downloaded yet - componentDidUpdate retries
    }
    if (!this._mounted) return;

    let parsed: ReturnType<typeof CalendarUtils.parseICSString>;
    try {
      parsed = CalendarUtils.parseICSString(data);
    } catch (e) {
      console.warn(
        `EventHeader: Could not parse ICS data from attachment ${file.filename}: ${e.message}`
      );
      return;
    }
    const { event, root } = parsed;

    const method = root.getFirstPropertyValue('method');
    const methodLower = (typeof method === 'string' ? method : 'request').toLowerCase();
    // Anything but REPLY and CANCEL renders as an invitation, the one method with actions.
    const normalizedMethod = ['reply', 'cancel'].includes(methodLower) ? methodLower : 'request';
    this.setState({
      icsEvent: event,
      icsMethod: normalizedMethod as EventHeaderState['icsMethod'],
      inviteIcs: data,
      inviteEvent: event,
      inviteRecurrenceIdStart: event.recurrenceId
        ? event.recurrenceId.toJSDate().getTime() / 1000
        : undefined,
    });

    if (this._subscription) {
      this._subscription.dispose();
    }
    this._subscription = Rx.Observable.combineLatest(
      // Every calendar copy of this UID: it can sit on ours, a room's and a colleague's at once.
      Rx.Observable.fromQuery(
        DatabaseStore.findAll<Event>(Event).where({
          icsuid: event.uid,
          accountId: message.accountId,
        })
      ),
      Rx.Observable.fromQuery(
        DatabaseStore.findAll<Calendar>(Calendar).where({ accountId: message.accountId })
      ),
      (calEvents: Event[], calendars: Calendar[]) => ({ calEvents, calendars })
    )
      .flatMapLatest(({ calEvents, calendars }) => {
        const copy = this._copyFor(calEvents, calendars);
        const window = this._conflictWindowFor(copy);
        // Bounded by the stored series span, so a handful of rows; findConflicts expands them.
        return Rx.Observable.fromQuery(
          DatabaseStore.findAll<Event>(Event).where([
            Event.attributes.accountId.equal(message.accountId),
            Event.attributes.recurrenceStart.lessThan(window.end),
            Event.attributes.recurrenceEnd.greaterThan(window.start),
          ])
        ).map((nearby: Event[]) => ({ calEvents, calendars, nearby, copy, window }));
      })
      .subscribe(({ calEvents, calendars, nearby, copy, window }) => {
        if (this._mounted) this._onCalendarCopies(calEvents, calendars, nearby, copy, window);
      });
  }

  /** Which copy of the invitation is ours to answer, and its VEVENT for this invitation. */
  _copyFor(calEvents: Event[], calendars: Calendar[]): CalendarCopy {
    const addresses = this._accountAddresses();
    const rsvp = resolveRSVPTarget({ events: calEvents, calendars, addresses });
    const display = rsvp.target ? rsvp.target.event : calEvents[0];
    let synced: ICAL.Event | null = null;
    if (display) {
      try {
        // An occurrence the copy has no VEVENT for keeps what the email said.
        synced = eventForInvitation(display.ics, this.state.inviteRecurrenceIdStart);
      } catch (e) {
        console.warn(`EventHeader: Could not parse ICS data from calendar event: ${e.message}`);
      }
    }
    return { rsvp, display, synced };
  }

  /**
   * The slot conflicts are checked against: the occurrence the invitation is about, where the
   * calendar copy now has it; else the next occurrence of the series, or the event itself.
   */
  _conflictWindowFor({ display, synced }: CalendarCopy): { start: number; end: number } {
    const unix = (d: Date) => Math.round(d.getTime() / 1000);
    const shown = synced || this.state.inviteEvent;
    const upcoming =
      this.state.inviteRecurrenceIdStart === undefined
        ? ICSEventHelpers.upcomingOccurrence(
            display ? display.ics : this.state.inviteIcs,
            new Date()
          )
        : null;
    return upcoming
      ? { start: unix(upcoming.start), end: unix(upcoming.end) }
      : { start: unix(shown.startDate.toJSDate()), end: unix(shown.endDate.toJSDate()) };
  }

  _onCalendarCopies(
    calEvents: Event[],
    calendars: Calendar[],
    nearby: Event[],
    { rsvp, display, synced }: CalendarCopy,
    conflictWindow: { start: number; end: number }
  ) {
    const addresses = this._accountAddresses();
    const busy = new Set(
      conflictCalendarIds(calendars, AppEnv.config.get('mailspring.disabledCalendars') || [])
    );
    const conflicts = ICSEventHelpers.findConflicts({
      events: nearby.filter((e) => busy.has(e.calendarId)),
      ...conflictWindow,
      addresses,
      excludeIcsuid: this.state.inviteEvent.uid,
    });
    const addTo = resolveAddTo({
      rsvp,
      calendars,
      addresses,
      organizerUri: this.state.inviteEvent.organizer,
      current: this.state.addTo,
    });
    const next: Partial<EventHeaderState> = {
      rsvp,
      conflicts,
      conflictWindow,
      addTo: addTo ? addTo.addTo : undefined,
      addToChoices: addTo ? addTo.choices : undefined,
      isOnCalendar: calEvents.length > 0,
    };
    if (display) {
      if (synced) next.icsEvent = synced;
      next.syncedIcs = display.ics;
    }
    this.setState(next as EventHeaderState);
  }

  /**
   * What the REPLY is built from: the calendar copy when there is one, except for an
   * invitation to one occurrence, which the emailed copy describes alone.
   */
  _replyIcs(): string {
    const { inviteIcs, inviteRecurrenceIdStart, syncedIcs } = this.state;
    return inviteRecurrenceIdStart === undefined && syncedIcs ? syncedIcs : inviteIcs;
  }

  /** This account's own address plus any aliases, used to recognise our own calendar. */
  _accountAddresses(): string[] {
    const account: Account = AccountStore.accountForId(this.props.message.accountId);
    if (!account) return [];
    return [
      account.emailAddress,
      ...AccountStore.aliases()
        .filter((a) => a.accountId === account.id)
        .map((a) => a.email),
    ];
  }

  render() {
    const { icsEvent, icsMethod } = this.state;
    if (!icsEvent || !icsEvent.startDate) {
      return null;
    }

    // Workaround to convert calendar invites sent out from Microsoft calendars to IANA timezones
    // that can be handled by moments-timezone.
    let startTimezone = findOneIana(icsEvent.startDate.zone.tzid) || icsEvent.startDate.zone.tzid;
    let endTimezone = findOneIana(icsEvent.endDate.zone.tzid) || icsEvent.endDate.zone.tzid;
    // Workaround to convert calendar invites sent out from Google calendar with "Z" timezone
    // to IANA timezone that can be handled by moments-timezone.
    if (startTimezone === 'Z') {
      startTimezone = 'UTC';
    }
    if (endTimezone === 'Z') {
      endTimezone = 'UTC';
    }

    const startMoment = moment
      .tz(icsEvent.startDate.toString(), startTimezone)
      .tz(DateUtils.timeZone);
    const endMoment = moment.tz(icsEvent.endDate.toString(), endTimezone).tz(DateUtils.timeZone);

    const daySeconds = 24 * 60 * 60 * 1000;
    let day = '';
    let time = '';

    if (endMoment.diff(startMoment) < daySeconds) {
      day = startMoment.format('dddd, MMMM Do');
      time = `${startMoment.format(
        DateUtils.getTimeFormat({ timeZone: false })
      )} - ${endMoment.format(DateUtils.getTimeFormat({ timeZone: true }))}`;
    } else {
      day = `${startMoment.format('dddd, MMMM Do')} - ${endMoment.format('MMMM Do')}`;
      if (endMoment.diff(startMoment) % daySeconds === 0) {
        time = localized('All Day');
      } else {
        time = startMoment.format(DateUtils.getTimeFormat({ timeZone: true }));
      }
    }

    return (
      <div className="event-wrapper">
        <div className="event-header">
          <div className="event-download" onClick={() => Actions.fetchAndOpenFile(this.props.file)}>
            <RetinaImg name="icon-attachment-download.png" mode={RetinaImg.Mode.ContentIsMask} />
          </div>
          <RetinaImg name="icon-RSVP-calendar-mini@2x.png" mode={RetinaImg.Mode.ContentPreserve} />
          <span className="event-title-text">{localized('Event')}: </span>
          <span className="event-title">{icsEvent.summary}</span>
        </div>
        <div className="event-body">
          <div className="event-date">
            <div className="event-day">{day}</div>
            <div>
              <div className="event-time">{time}</div>
            </div>
            <div className="event-location">{renderLocation(icsEvent.location)}</div>
            {this.state.isOnCalendar && (
              <div className="event-view-in-calendar">
                <a onClick={this._onViewInCalendar}>{localized('View in Calendar')}</a>
              </div>
            )}
            {icsMethod !== 'cancel' && this._renderConflicts()}
            {icsMethod === 'cancel'
              ? this._renderCancellation()
              : icsMethod === 'request'
                ? this._renderRSVP()
                : this._renderSenderResponse()}
          </div>
        </div>
      </div>
    );
  }

  _onViewInCalendar = () => {
    ipcRenderer.send('command', 'application:show-calendar', {
      icsuid: this.state.icsEvent.uid,
      accountId: this.props.message.accountId,
      recurrenceIdStart: this.state.inviteRecurrenceIdStart,
    });
  };
  // What Google Calendar shows as "Conflicts with...", so the answer needs no trip to the calendar.
  _renderConflicts() {
    const { conflicts } = this.state;
    if (!conflicts || !conflicts.length) return false;

    const timeFormat = DateUtils.getTimeFormat({ timeZone: false });
    const label = (conflict: CalendarConflict) => {
      const start = moment.unix(conflict.start).tz(DateUtils.timeZone).format(timeFormat);
      const end = moment.unix(conflict.end).tz(DateUtils.timeZone).format(timeFormat);
      return `${conflict.title || localized('(No title)')} (${start} - ${end})`;
    };

    return (
      <div className="event-conflicts">
        <div className="event-conflicts-title">
          {conflicts.length === 1
            ? localized('Conflicts with an event on your calendar')
            : localized('Conflicts with %@ events on your calendar', conflicts.length)}
        </div>
        {conflicts.map((conflict) => (
          <div className="event-conflict" key={`${conflict.eventId}-${conflict.start}`}>
            {label(conflict)}
          </div>
        ))}
      </div>
    );
  }

  _renderSenderResponse() {
    const { icsEvent } = this.state;
    const from = this.props.message.from[0];
    if (!from) return false;

    const sender = CalendarUtils.cleanParticipants(icsEvent).find((p) => p.email === from.email);
    if (!sender) return false;

    const verb: { [key: string]: string } = {
      DECLINED: localized('declined'),
      ACCEPTED: localized('accepted'),
      TENTATIVE: localized('tentatively accepted'),
      DELEGATED: localized('delegated'),
      COMPLETED: localized('completed'),
    }[sender.status];

    return (
      <div className="event-actions">{localized(`%1$@ has %2$@ this event`, from.email, verb)}</div>
    );
  }

  _renderCancellation() {
    const { icsEvent } = this.state;
    const organizerEmail = CalendarUtils.emailFromParticipantURI(icsEvent.organizer);

    return (
      <div className="event-actions event-cancelled">
        <span className="cancelled-notice">
          {organizerEmail
            ? localized('This event has been cancelled by %@', organizerEmail)
            : localized('This event has been cancelled')}
        </span>
      </div>
    );
  }

  _renderRSVP() {
    const { icsEvent, inflight } = this.state;
    const me = CalendarUtils.selfParticipant(icsEvent, this.props.message.accountId);
    if (!me) {
      // Invitations addressed to a group or a distribution list name the group as the
      // attendee, not us, and iTIP gives us no standing to reply on the group's behalf.
      return (
        <div className="event-actions event-no-rsvp">
          {localized(
            "This invitation was sent to an address that isn't listed as a guest, so there's no RSVP to give."
          )}
        </div>
      );
    }

    let status = me.status;

    const icsTimeProperty = icsEvent.component.getFirstPropertyValue('dtstamp') as ICAL.Time;
    const icsTime = icsTimeProperty ? icsTimeProperty.toJSDate() : new Date(0);

    const metadata = this.props.message.metadataForPluginId('event-rsvp');
    if (metadata && new Date(metadata.time) > icsTime) {
      status = metadata.status;
    }

    const actions: [ICSParticipantStatus, string][] = [
      ['ACCEPTED', localized('Accept')],
      ['TENTATIVE', localized('Maybe')],
      ['DECLINED', localized('Decline')],
    ];

    return (
      <div className="event-actions">
        <div className="event-rsvp-buttons">
          {actions.map(([actionStatus, actionLabel]) => (
            <div
              key={actionStatus}
              className={`btn btn-large btn-rsvp ${status === actionStatus ? actionStatus : ''}`}
              onClick={() => this._onRSVP(actionStatus)}
            >
              {actionStatus === status || actionStatus !== inflight ? (
                actionLabel
              ) : (
                <RetinaImg
                  width={18}
                  name="sending-spinner.gif"
                  mode={RetinaImg.Mode.ContentPreserve}
                />
              )}
            </div>
          ))}
        </div>
        {this._renderRSVPDestination()}
      </div>
    );
  }

  // The REPLY is emailed whichever copy is ours; this says whether an answer is also recorded.
  _renderRSVPDestination() {
    const { rsvp, addTo } = this.state;
    if (!rsvp) return false;

    if (rsvp.target) {
      return (
        <div className="event-rsvp-destination">
          {localized('Your response will be saved to %@', rsvp.target.calendar.name)}
        </div>
      );
    }

    if (rsvp.problem === 'not-on-a-calendar' && addTo) {
      const choices = this.state.addToChoices || [];
      return (
        <div className="event-rsvp-destination">
          <span>{localized('Accepting will add this event to')}</span>
          {choices.length > 1 ? (
            <select
              className="event-rsvp-calendar-picker"
              value={addTo.id}
              aria-label={localized('Calendar to add this event to')}
              onChange={(e) =>
                this.setState({ addTo: choices.find((c) => c.id === e.target.value) })
              }
            >
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span>{addTo.name}</span>
          )}
        </div>
      );
    }

    const explanation = {
      'not-on-a-calendar': localized(
        "This event isn't on any of your calendars, so your response will only be emailed to the organizer."
      ),
      'read-only': localized(
        'This event is only on a read-only calendar, so your response will only be emailed to the organizer.'
      ),
      'not-ours': localized(
        'This event is only on a calendar shared with you by someone else, so your response will only be emailed to the organizer.'
      ),
      ambiguous: localized(
        "This event is on more than one of your calendars, so we can't tell which copy is yours. Your response will only be emailed to the organizer."
      ),
    }[rsvp.problem];

    return <div className="event-rsvp-destination event-rsvp-email-only">{explanation}</div>;
  }

  _onRSVP = (status: ICSParticipantStatus) => {
    const { inviteEvent, inflight } = this.state;
    if (inflight) return; // prevent double clicks

    // Addressed by the mailed invitation: Google rewrites ORGANIZER on a shared calendar's copy.
    const organizerEmail = CalendarUtils.emailFromParticipantURI(inviteEvent.organizer);
    if (!organizerEmail) {
      AppEnv.showErrorDialog(
        localized(
          "Sorry, this event does not have an organizer or the organizer's address is not a valid email address: %@",
          inviteEvent.organizer || '(none)'
        )
      );
      return;
    }

    // EventRSVPTask.forReplying throws if it can't find us as an attendee in the data it's
    // replying with; catch that here instead of letting it crash the click handler.
    let task: EventRSVPTask;
    try {
      task = EventRSVPTask.forReplying({
        accountId: this.props.message.accountId,
        messageId: this.props.message.id,
        icsOriginalData: this._replyIcs(),
        icsRSVPStatus: status,
        to: organizerEmail,
      });
    } catch (e) {
      console.warn(`EventHeader: Could not build RSVP reply: ${e.message}`);
      AppEnv.showErrorDialog(
        localized(
          "Sorry, we couldn't find your email address in this event's attendee list, so an RSVP reply could not be sent."
        )
      );
      return;
    }

    this.setState({ inflight: status });
    Actions.queueTask(task);
    this._writeRSVPToCalendar(status);
  };

  // Not undoable: the REPLY already sent cannot be retracted (iTIP has no way to).
  _writeRSVPToCalendar(status: ICSParticipantStatus) {
    const { rsvp, addTo, inviteIcs, inviteEvent } = this.state;
    const { accountId } = this.props.message;
    // _onRSVP has already built the REPLY from this attendee, so it exists.
    const me = CalendarUtils.selfParticipant(inviteEvent, accountId);
    const write = planRSVPWrite({
      rsvp,
      addTo,
      status,
      myEmail: me.email,
      inviteIcs,
      inviteEvent,
      accountId,
    });
    if (!write) return;
    Actions.queueTask(
      write.kind === 'update'
        ? SyncbackEventTask.forUpdating({ event: write.event })
        : SyncbackEventTask.forCreating({
            event: write.event,
            calendarId: write.calendar.id,
            accountId,
          })
    );
  }
}

export default EventHeader;
