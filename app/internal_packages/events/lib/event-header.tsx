import { AnswerSection, RetinaImg, TextSelect } from 'mailspring-component-kit';

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
  Thread,
  Event,
  EventRSVPTask,
  SyncbackEventTask,
  DestroyEventTask,
  DatabaseStore,
  RegExpUtils,
  Utils,
} from 'mailspring-exports';
import ICAL from 'ical.js';
import {
  resolveRSVPTarget,
  resolveAddTo,
  planRSVPWrite,
  findEventConflicts,
  counterProposalProblem,
  CounterProposalProblem,
  RSVPTargetResolution,
  RSVPWrite,
} from './rsvp-target';
import {
  copyIsBehind,
  EmailedInvitation,
  newestInvitation,
  otherInvitationEmails,
  readEmailedInvitations,
} from './invitation-versions';

import { findOneIana } from 'windows-iana';
import { focusedOccurrenceForIcsuid } from '../../main-calendar/lib/core/calendar-data-source';
import { openProposeNewTimePopover } from '../../main-calendar/lib/core/calendar-rsvp';

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

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** A rule's frequency and the weekdays a weekly one lists, or null for any other rule. */
function repeatEvery(rrule: ICAL.Recur): string | null {
  const interval = rrule.interval || 1;
  const byDay = (rrule.parts.BYDAY as string[] | undefined) || [];
  const others = Object.keys(rrule.parts).filter((part) => part !== 'BYDAY');
  if (others.length || !byDay.every((day) => WEEKDAYS.includes(day))) return null;

  if (byDay.length) {
    if (rrule.freq !== 'WEEKLY') return null;
    const days = WEEKDAYS.filter((day) => byDay.includes(day))
      .map((day) => moment.weekdaysShort(WEEKDAYS.indexOf(day)))
      .join(', ');
    return interval === 1
      ? localized('Every %@', days)
      : localized('Every %1$@ weeks on %2$@', interval, days);
  }
  const every: { [freq: string]: [string, (n: number) => string] } = {
    DAILY: [localized('Every Day'), (n) => localized('Every %@ days', n)],
    WEEKLY: [localized('Every Week'), (n) => localized('Every %@ weeks', n)],
    MONTHLY: [localized('Every Month'), (n) => localized('Every %@ months', n)],
    YEARLY: [localized('Every Year'), (n) => localized('Every %@ years', n)],
  };
  if (!every[rrule.freq]) return null;
  const [once, many] = every[rrule.freq];
  return interval === 1 ? once : many(interval);
}

/** How often a series repeats and when it ends, or only that it repeats for a rule this can't
 * put in a few words (such as the second Tuesday of each month). */
export function repeatSummary(event: ICAL.Event): string | null {
  const rrule = event.component.getFirstPropertyValue('rrule') as ICAL.Recur | null;
  if (!rrule) return null;
  const every = repeatEvery(rrule);
  if (!every) return localized('Repeats');
  if (rrule.count) return localized('%1$@, %2$@ times', every, rrule.count);
  if (rrule.until) {
    return localized('%1$@, until %2$@', every, moment(rrule.until.toJSDate()).format('ll'));
  }
  return every;
}

/**
 * Who organizes an event, as a guest would name them. iCloud mails invitations from a relay
 * address (`2_…@imip.me.com`) that replies must go to, with the person's name in CN and their
 * address in EMAIL.
 */
export function organizerName(event: ICAL.Event): string | null {
  const organizer = event.component.getFirstProperty('organizer');
  if (!organizer) return null;
  const named = organizer.getParameter('cn') || organizer.getParameter('email');
  return named
    ? String(named)
    : CalendarUtils.emailFromParticipantURI(String(organizer.getFirstValue()));
}

/** An ICAL time in our zone; a date stays the day it names. */
function inOurZone(time: ICAL.Time) {
  if (time.isDate) return moment(time.toString());
  // Microsoft calendars send Windows zone names, and Google sends "Z" for UTC.
  const zone = findOneIana(time.zone.tzid) || time.zone.tzid;
  return moment.tz(time.toString(), zone === 'Z' ? 'UTC' : zone).tz(DateUtils.timeZone);
}

/** The event's time on one line, as the invitation header shows it: "Fri, Sep 4, 2:00 PM – 3:00 PM". */
export function invitationTime(event: ICAL.Event): string {
  const start = inOurZone(event.startDate);
  const end = inOurZone(event.endDate);
  const day = 'ddd, MMM D';
  if (event.startDate.isDate) {
    const last = end.clone().subtract(1, 'day');
    return last.isAfter(start, 'day')
      ? `${start.format(day)} – ${last.format(day)}`
      : `${start.format(day)}, ${localized('All day')}`;
  }
  const time = DateUtils.getTimeFormat({ timeZone: false });
  return start.isSame(end, 'day')
    ? `${start.format(day)}, ${start.format(time)} – ${end.format(time)}`
    : `${start.format(day)}, ${start.format(time)} – ${end.format(day)}, ${end.format(time)}`;
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
   * The invitation as mailed, revised by any later email about it; the REPLY is built from it
   * (RFC 5546 section 3.2.3). Google rewrites ORGANIZER on a shared calendar's copy to an
   * `@group.calendar.google.com` id.
   */
  inviteIcs?: string;
  inviteEvent?: ICAL.Event;
  /** The latest email that revised this invitation, when one did. */
  newerInvitation?: Message;
  /** Set when the emailed invitation is about one occurrence of a series, in unix seconds. */
  inviteRecurrenceIdStart?: number;
  icsMethod?: 'reply' | 'request' | 'cancel' | 'counter';
  /** What is shown: the synced copy's VEVENT for this invitation, unless the copy is behind it. */
  icsEvent?: ICAL.Event;
  /** Our synced calendar object for this invitation, and its VEVENT the invitation is about. */
  syncedIcs?: string;
  syncedEvent?: ICAL.Event;
  /** Whether that copy missed a revision the invitation holds, which answering brings it up to. */
  copyBehind?: boolean;
  isOnCalendar?: boolean;
  /** Which calendar copy of this event, if any, our response will be written to. */
  rsvp?: RSVPTargetResolution;
  /** Why an arriving counter-proposal may not be applied, when it may not be. */
  counterProblem?: CounterProposalProblem;
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
    newerInvitation: undefined,
    inviteRecurrenceIdStart: undefined,
    syncedIcs: undefined,
    syncedEvent: undefined,
    copyBehind: false,
    isOnCalendar: false,
    rsvp: undefined,
    counterProblem: undefined,
    conflictWindow: undefined,
    conflicts: undefined,
    addTo: undefined,
    addToChoices: undefined,
    inflight: undefined,
  };

  _mounted = false;
  _subscription: Rx.IDisposable;
  _versionsSubscription: Rx.IDisposable;

  componentWillUnmount() {
    this._mounted = false;
    if (this._subscription) {
      this._subscription.dispose();
    }
    if (this._versionsSubscription) {
      this._versionsSubscription.dispose();
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
    // Anything but REPLY, CANCEL and COUNTER renders as an invitation, the method with actions.
    const normalizedMethod = ['reply', 'cancel', 'counter'].includes(methodLower)
      ? methodLower
      : 'request';
    this.setState({
      icsEvent: event,
      icsMethod: normalizedMethod as EventHeaderState['icsMethod'],
      inviteIcs: data,
      inviteEvent: event,
      inviteRecurrenceIdStart: event.recurrenceId
        ? event.recurrenceId.toJSDate().getTime() / 1000
        : undefined,
    });

    if (normalizedMethod === 'request') {
      this._watchForNewerVersions(data, event);
    }

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

  /**
   * Organizers mail each revision of an invitation separately, so the one in this email can be
   * stale. Its later emails are found, their bodies fetched when they haven't been, and the
   * invitation shown and answered becomes the newest they add up to. Accepting a stale one would
   * add the organizer's old times to our calendar.
   */
  async _watchForNewerVersions(ownIcs: string, ownEvent: ICAL.Event) {
    const candidates = await this._otherInvitationEmails(ownEvent.summary);
    if (!candidates.length || !this._mounted) return;
    const undownloaded = candidates.filter((m) => m.body === null);
    if (undownloaded.length) {
      Actions.fetchBodies(undownloaded);
    }
    if (this._versionsSubscription) {
      this._versionsSubscription.dispose();
    }
    this._versionsSubscription = Rx.Observable.fromQuery(
      DatabaseStore.findAll<Message>(Message).where([
        Message.attributes.id.in(candidates.map((m) => m.id)),
      ])
    )
      .flatMapLatest((messages: Message[]) =>
        Rx.Observable.fromPromise(readEmailedInvitations(messages))
      )
      .subscribe((others: EmailedInvitation[]) => {
        if (this._mounted) this._onEmailedVersions(ownIcs, others);
      });
  }

  _otherInvitationEmails(title: string): Promise<Message[]> {
    return otherInvitationEmails(this.props.message, title);
  }

  // Runs again as each candidate's body arrives, so every result replaces the last; null puts
  // back this email's own invitation.
  _onEmailedVersions(ownIcs: string, others: EmailedInvitation[]) {
    let newest: ReturnType<typeof newestInvitation>;
    let event: ICAL.Event;
    try {
      newest = newestInvitation({ ics: ownIcs, message: this.props.message }, others) || {
        ics: ownIcs,
        cancelled: false,
        message: null,
      };
      event = CalendarUtils.parseICSString(newest.ics).event;
    } catch (e) {
      console.warn(`EventHeader: Could not read a later copy of this invitation: ${e.message}`);
      return;
    }
    const next: Partial<EventHeaderState> = {
      inviteIcs: newest.ics,
      inviteEvent: event,
      newerInvitation: newest.message || undefined,
      // Only an emailed REQUEST looks for later versions.
      icsMethod: newest.cancelled ? 'cancel' : 'request',
    };
    this.setState({ ...next, ...this._shownFor({ ...this.state, ...next }) } as EventHeaderState);
  }

  /** The calendar copy is shown in place of the invitation, unless it is behind it. */
  _shownFor(state: EventHeaderState): Pick<EventHeaderState, 'icsEvent' | 'copyBehind'> {
    const { syncedEvent, syncedIcs, inviteIcs, inviteEvent } = state;
    let copyBehind = false;
    if (syncedEvent) {
      try {
        copyBehind = copyIsBehind(syncedIcs, inviteIcs);
      } catch (e) {
        console.warn(`EventHeader: Could not compare the invitation with our copy: ${e.message}`);
      }
    }
    return { copyBehind, icsEvent: syncedEvent && !copyBehind ? syncedEvent : inviteEvent };
  }

  _onViewNewerInvitation = async () => {
    const thread = await DatabaseStore.find<Thread>(Thread, this.state.newerInvitation.threadId);
    if (thread) Actions.popoutThread(thread);
  };

  /** Which copy of the invitation is ours to answer, and its VEVENT for this invitation. */
  _copyFor(calEvents: Event[], calendars: Calendar[]): CalendarCopy {
    const addresses = this._accountAddresses();
    const rsvp = resolveRSVPTarget({ events: calEvents, calendars, addresses });
    const display = rsvp.target ? rsvp.target.event : calEvents[0];
    let synced: ICAL.Event | null = null;
    // A COUNTER's proposed time exists only in the attachment; our copy holds the original.
    if (display && this.state.icsMethod !== 'counter') {
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
      this.state.inviteRecurrenceIdStart === undefined && this.state.icsMethod !== 'counter'
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
    const conflicts = findEventConflicts({
      nearby,
      calendars,
      window: conflictWindow,
      addresses,
      icsuid: this.state.inviteEvent.uid,
    });
    const addTo = resolveAddTo({
      rsvp,
      calendars,
      addresses,
      organizerUri: this.state.inviteEvent.organizer,
      current: this.state.addTo,
    });
    // Whether a COUNTER may be acted on is decided by our own copy, never the attachment.
    const counterProblem =
      this.state.icsMethod === 'counter' && rsvp.target
        ? counterProposalProblem({
            ics: rsvp.target.event.ics,
            senderEmail: this.props.message.from[0] ? this.props.message.from[0].email : null,
            addresses,
            namesOccurrence: !!this.state.inviteEvent.recurrenceId,
          })
        : undefined;
    const next: Partial<EventHeaderState> = {
      rsvp,
      counterProblem,
      conflicts,
      conflictWindow,
      addTo: addTo ? addTo.addTo : undefined,
      addToChoices: addTo ? addTo.choices : undefined,
      isOnCalendar: calEvents.length > 0,
      syncedIcs: display ? display.ics : undefined,
      syncedEvent: synced || undefined,
    };
    this.setState({ ...next, ...this._shownFor({ ...this.state, ...next }) } as EventHeaderState);
  }

  /**
   * What the REPLY is built from: the calendar copy when there is one, except for an
   * invitation to one occurrence, which the emailed copy describes alone, and a copy behind
   * the invitation, whose SEQUENCE the organizer would read as an answer to an old revision.
   */
  _replyIcs(): string {
    const { inviteIcs, inviteRecurrenceIdStart, syncedIcs, copyBehind } = this.state;
    return inviteRecurrenceIdStart === undefined && syncedIcs && !copyBehind
      ? syncedIcs
      : inviteIcs;
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
    const repeat = repeatSummary(icsEvent);

    return (
      <div className="event-wrapper">
        <div className="event-invitation">
          <div className="event-invitation-title-row">
            <span className="event-title">{icsEvent.summary}</span>
            {this.state.isOnCalendar && (
              <a className="event-view-in-calendar" onClick={this._onViewInCalendar}>
                {localized('View in Calendar')}
              </a>
            )}
            {/* The attachment list hides the .ics, so this is the only way to save it. */}
            <button
              className="btn-bare event-download"
              title={localized('Download')}
              aria-label={localized('Download')}
              onClick={() => Actions.fetchAndOpenFile(this.props.file)}
            >
              <RetinaImg name="icon-attachment-download.png" mode={RetinaImg.Mode.ContentIsMask} />
            </button>
          </div>
          <div className="event-invitation-columns">
            <div className="event-invitation-details">
              <div className="event-time">{invitationTime(icsEvent)}</div>
              {repeat && <div className="event-repeat">{repeat}</div>}
              {icsEvent.location && (
                <div className="event-location">{renderLocation(icsEvent.location)}</div>
              )}
              {this._renderNewerInvitation()}
              {icsMethod === 'request' && this._renderConflicts()}
            </div>
            <div className="event-invitation-answer">
              {icsMethod === 'cancel'
                ? this._renderCancellation()
                : icsMethod === 'counter'
                  ? this._renderCounterProposal()
                  : icsMethod === 'request'
                    ? this._renderRSVP()
                    : this._renderSenderResponse()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  _renderNewerInvitation() {
    if (!this.state.newerInvitation) return false;
    const cancelled = this.state.icsMethod === 'cancel';
    return (
      <div className="event-newer-invitation">
        {cancelled
          ? localized('This invitation was cancelled after this email was sent.')
          : localized('This invitation was updated after this email was sent.')}{' '}
        <a onClick={this._onViewNewerInvitation}>
          {cancelled ? localized('View the cancellation') : localized('View the update')}
        </a>
      </div>
    );
  }

  _onViewInCalendar = () => {
    ipcRenderer.send('command', 'application:show-calendar', {
      icsuid: this.state.icsEvent.uid,
      accountId: this.props.message.accountId,
      calendarId: this.state.rsvp?.target?.event.calendarId,
      recurrenceIdStart: this.state.inviteRecurrenceIdStart,
    });
  };
  // What Google Calendar shows as "Conflicts with...", so the answer needs no trip to the
  // calendar. Shown only on a REQUEST still waiting on Yes or No: a REPLY is about a slot we
  // picked ourselves.
  _renderConflicts() {
    const { conflicts, icsEvent } = this.state;
    if (!conflicts || !conflicts.length) return false;
    if (['ACCEPTED', 'DECLINED'].includes(this._myStatus())) return false;

    const timeFormat = DateUtils.getTimeFormat({ timeZone: false });
    // The header dates a series by its first occurrence while the slot checked is the next one,
    // so a clash on another day than the one shown says which day.
    const shownDay = inOurZone(icsEvent.startDate);
    const label = (conflict: CalendarConflict) => {
      const start = moment.unix(conflict.start).tz(DateUtils.timeZone);
      const end = moment.unix(conflict.end).tz(DateUtils.timeZone);
      const day = start.isSame(shownDay, 'day') ? '' : `${start.format('ddd, MMM D')}, `;
      return `${conflict.title || localized('(No title)')}, ${day}${start.format(
        timeFormat
      )} – ${end.format(timeFormat)}`;
    };

    return (
      <div className="event-conflicts">
        <div className="event-conflicts-title">
          {conflicts.length === 1
            ? localized('Conflicts with %@', label(conflicts[0]))
            : localized('Conflicts with %@ events', conflicts.length)}
        </div>
        {conflicts.length > 1 &&
          conflicts.map((conflict) => (
            <div className="event-conflict" key={`${conflict.eventId}-${conflict.start}`}>
              {label(conflict)}
            </div>
          ))}
        {this.state.rsvp?.target && (
          <a className="event-propose" onClick={this._onProposeNewTime}>
            {localized('Propose a new time')}
          </a>
        )}
      </div>
    );
  }

  // The proposal goes from the calendar copy, as the event panel's time rows send it.
  _onProposeNewTime = async (e: React.MouseEvent<HTMLElement>) => {
    const anchor = e.currentTarget;
    const { icsEvent, rsvp, inviteRecurrenceIdStart } = this.state;
    const { accountId } = this.props.message;
    const calendars = await DatabaseStore.findAll<Calendar>(Calendar).where({ accountId });
    const occurrence = await focusedOccurrenceForIcsuid(
      {
        icsuid: icsEvent.uid,
        accountId,
        calendarId: rsvp.target.calendar.id,
        recurrenceIdStart: inviteRecurrenceIdStart,
      },
      calendars
    );
    if (occurrence) openProposeNewTimePopover(occurrence, anchor);
  };

  // A guest proposing another slot for a meeting we organize (RFC 5546 section 3.2.7): the
  // action is the organizer's, and accepting moves the event. The header shows the proposed time.
  _renderCounterProposal() {
    const { rsvp, counterProblem } = this.state;
    const from = this.props.message.from[0];
    const proposer = from ? from.displayName() : localized('An attendee');

    const refusal =
      !rsvp || !rsvp.target
        ? localized("This event isn't on a calendar you can edit, so it can't be moved here.")
        : counterProblem === 'not-our-meeting'
          ? localized("You don't organize this event, so only its organizer can move it.")
          : counterProblem === 'series-without-occurrence'
            ? localized(
                "This proposal doesn't say which occurrence of the series it is about, so the series stays as it is."
              )
            : counterProblem === 'not-from-a-guest'
              ? localized(
                  '%@ is not a guest on this event, so it cannot be moved from here.',
                  proposer
                )
              : null;

    return (
      <div className="event-actions event-counter">
        <div className="event-counter-notice">
          {localized('%@ proposed this new time.', proposer)}
        </div>
        {refusal ? (
          <div className="event-rsvp-destination event-rsvp-email-only">{refusal}</div>
        ) : (
          <>
            <div className="event-rsvp-buttons">
              <div className="btn btn-large" onClick={this._onAcceptProposedTime}>
                {localized('Move event to this time')}
              </div>
            </div>
            <div className="event-rsvp-destination">
              {localized('Your response will be saved to %@', rsvp.target.calendar.name)}
            </div>
          </>
        )}
      </div>
    );
  }

  // The server re-sends the invitation to the guests when the organizer moves the event, so
  // there is no REQUEST for us to send.
  _onAcceptProposedTime = () => {
    const { event: calEvent } = this.state.rsvp.target;
    const proposed = this.state.inviteEvent;
    const unix = (t: ICAL.Time) => Math.round(t.toJSDate().getTime() / 1000);
    const start = unix(proposed.startDate);
    const end = unix(proposed.endDate);
    const isAllDay = !!proposed.startDate.isDate;

    let ics: string;
    try {
      if (proposed.recurrenceId) {
        // The counter names one occurrence, so only that one moves.
        const exception = ICSEventHelpers.createRecurrenceException(
          calEvent.ics,
          unix(proposed.recurrenceId),
          start,
          end,
          isAllDay
        );
        ics = ICSEventHelpers.bumpEventSequence(exception.masterIcs, exception.recurrenceId);
      } else {
        ics = ICSEventHelpers.bumpEventSequence(
          ICSEventHelpers.updateEventTimes(calEvent.ics, { start, end, isAllDay })
        );
      }
    } catch (e) {
      console.warn(`EventHeader: Could not apply the proposed time: ${e.message}`);
      AppEnv.showErrorDialog(localized("Sorry, we couldn't move this event to the proposed time."));
      return;
    }

    const event = calEvent.clone();
    event.ics = ics;
    if (!proposed.recurrenceId) {
      event.recurrenceStart = start;
      event.recurrenceEnd = end;
    }
    Actions.queueTask(
      SyncbackEventTask.forUpdating({
        event,
        undoData: {
          ics: calEvent.ics,
          recurrenceStart: calEvent.recurrenceStart,
          recurrenceEnd: calEvent.recurrenceEnd,
        },
        description: localized('Move event'),
      })
    );
  };

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
    const { icsEvent, copyBehind, rsvp, inviteRecurrenceIdStart } = this.state;
    const organizer = organizerName(icsEvent);
    // Our copy of a cancelled meeting stays where the server didn't apply the cancellation.
    const removable = copyBehind && rsvp && rsvp.target && inviteRecurrenceIdStart === undefined;

    return (
      <div className="event-actions event-cancelled">
        <span className="cancelled-notice">
          {organizer
            ? localized('This event has been cancelled by %@', organizer)
            : localized('This event has been cancelled')}
        </span>
        {removable && (
          <div className="btn btn-large btn-rsvp" onClick={this._onRemoveCancelled}>
            {localized('Remove from %@', rsvp.target.calendar.name)}
          </div>
        )}
      </div>
    );
  }

  _onRemoveCancelled = () => {
    const { rsvp } = this.state;
    if (rsvp && rsvp.target) {
      Actions.queueTask(DestroyEventTask.forRemoving({ events: [rsvp.target.event] }));
    }
  };

  _renderRSVP() {
    const me = CalendarUtils.selfParticipant(this.state.icsEvent, this.props.message.accountId);
    if (!me) {
      // Invitations addressed to a group or a distribution list name the group as the
      // attendee, not us, and iTIP gives us no standing to reply on the group's behalf.
      return (
        <div className="event-no-rsvp">
          {localized(
            "This invitation was sent to an address that isn't listed as a guest, so there's no RSVP to give."
          )}
        </div>
      );
    }
    return (
      <AnswerSection
        note={this._renderRSVPDestination()}
        answer={this._myStatus()}
        sending={this.state.inflight}
        onAnswer={this._onRSVP}
      />
    );
  }

  /** Our answer: the calendar copy's, or one sent from this email since the invitation came. */
  _myStatus(): string | null {
    const { icsEvent } = this.state;
    const me = CalendarUtils.selfParticipant(icsEvent, this.props.message.accountId);
    if (!me) return null;
    const icsTimeProperty = icsEvent.component.getFirstPropertyValue('dtstamp') as ICAL.Time;
    const icsTime = icsTimeProperty ? icsTimeProperty.toJSDate() : new Date(0);
    const metadata = this.props.message.metadataForPluginId('event-rsvp');
    return metadata && new Date(metadata.time) > icsTime ? metadata.status : me.status;
  }

  // Says whether the answer is also recorded on a calendar, or only emailed.
  _renderRSVPDestination() {
    const { rsvp, addTo } = this.state;
    if (!rsvp) return null;

    if (rsvp.target) {
      return (
        <span className="event-rsvp-destination">
          {this.state.copyBehind
            ? localized(
                '%@ still has an earlier version of this event. Your response will update it.',
                rsvp.target.calendar.name
              )
            : localized('Saved to %@', rsvp.target.calendar.name)}
        </span>
      );
    }

    if (rsvp.problem === 'not-on-a-calendar' && addTo) {
      const choices = this.state.addToChoices || [];
      const account = AccountStore.accountForId(this.props.message.accountId);
      // The calendar's own name doesn't say which account it's in, so its account goes on hover.
      const inAccount =
        account && !CalendarUtils.isNamedAfterAccount(addTo, account)
          ? account.emailAddress
          : undefined;
      if (choices.length <= 1) {
        return (
          <span className="event-rsvp-destination" title={inAccount}>
            {localized('Yes or Maybe adds it to %@', addTo.name)}
          </span>
        );
      }
      return (
        <span className="event-rsvp-destination">
          {localized('Yes or Maybe adds it to')}{' '}
          <TextSelect
            value={addTo.id}
            title={inAccount}
            aria-label={localized('Calendar to add this event to')}
            onChange={(e) => this.setState({ addTo: choices.find((c) => c.id === e.target.value) })}
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </TextSelect>
        </span>
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

    return <span className="event-rsvp-destination event-rsvp-email-only">{explanation}</span>;
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

    const { message } = this.props;
    const write = this._planRSVPWrite(status);
    // A copy we create still gets the REPLY: whether Google tells the organizer about it is untested.
    if (write?.kind === 'update' && EventRSVPTask.calendarWriteSendsReply(message.accountId)) {
      this.setState({ inflight: status });
      const answer = { ...write.answer, messageId: message.id };
      Actions.queueTask(SyncbackEventTask.forAnswering({ event: write.event, answer }));
      return;
    }

    // EventRSVPTask.forReplying throws if it can't find us as an attendee in the data it's
    // replying with; catch that here instead of letting it crash the click handler.
    let task: EventRSVPTask;
    try {
      task = EventRSVPTask.forReplying({
        accountId: message.accountId,
        messageId: message.id,
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
    if (write) this._writeRSVPToCalendar(write);
  };

  _planRSVPWrite(status: ICSParticipantStatus): RSVPWrite | null {
    const { rsvp, addTo, inviteIcs, inviteEvent, copyBehind } = this.state;
    const { accountId } = this.props.message;
    const me = CalendarUtils.selfParticipant(inviteEvent, accountId);
    // A forwarded invitation can omit us while our synced copy lists us; the REPLY still goes.
    if (!me) return null;
    return planRSVPWrite({
      rsvp,
      addTo,
      status,
      myEmail: me.email,
      inviteIcs,
      inviteEvent,
      accountId,
      copyBehind,
    });
  }

  // Not undoable: an answer the organizer has been sent cannot be retracted (iTIP has no way to).
  _writeRSVPToCalendar(write: RSVPWrite) {
    const { accountId } = this.props.message;
    Actions.queueTask(
      write.kind === 'update'
        ? SyncbackEventTask.forAnswering({ event: write.event, answer: write.answer })
        : SyncbackEventTask.forCreating({
            event: write.event,
            calendarId: write.calendar.id,
            accountId,
            answer: write.answer,
          })
    );
  }
}

export default EventHeader;
