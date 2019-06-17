import { RetinaImg } from 'mailspring-component-kit';

import React from 'react';
import fs from 'fs';
import {
  Rx,
  Actions,
  AttachmentStore,
  File,
  localized,
  DateUtils,
  CalendarUtils,
  ICSParticipantStatus,
  Message,
  Event,
  EventRSVPTask,
  DatabaseStore,
} from 'mailspring-exports';
import ICAL from 'ical.js';

const moment = require('moment-timezone');

interface EventHeaderProps {
  message: Message;
  file: File;
}

interface EventHeaderState {
  icsOriginalData?: string;
  icsMethod?: 'reply' | 'request';
  icsEvent?: ICAL.Event;
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

  state = {
    icsEvent: undefined,
    icsMethod: undefined,
    icsOriginalData: undefined,
    inflight: undefined,
  };

  _mounted: boolean = false;
  _subscription: Rx.IDisposable;

  componentWillUnmount() {
    this._mounted = false;
    if (this._subscription) {
      this._subscription.dispose();
    }
  }

  componentDidMount() {
    const { file, message } = this.props;
    this._mounted = true;

    fs.readFile(AttachmentStore.pathForFile(file), async (err, data) => {
      if (err || !this._mounted) return;

      const icsData = ICAL.parse(data.toString());
      const icsRoot = new ICAL.Component(icsData);
      const icsEvent = new ICAL.Event(icsRoot.getFirstSubcomponent('vevent'));

      this.setState({
        icsEvent: icsEvent,
        icsMethod: (icsRoot.getFirstPropertyValue('method') || 'request').toLowerCase(),
        icsOriginalData: data.toString(),
      });

      this._subscription = Rx.Observable.fromQuery(
        DatabaseStore.findBy<Event>(Event, {
          icsuid: icsEvent.uid,
          accountId: message.accountId,
        })
      ).subscribe(calEvent => {
        if (!this._mounted || !calEvent) return;
        this.setState({
          icsEvent: CalendarUtils.eventFromICSString(calEvent.ics),
        });
      });
    });
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.inflight) {
      this.setState({ inflight: undefined });
    }
  }

  render() {
    const { icsEvent, icsMethod } = this.state;
    if (!icsEvent || !icsEvent.startDate) {
      return null;
    }

    const startMoment = moment(icsEvent.startDate.toJSDate()).tz(DateUtils.timeZone);
    const endMoment = moment(icsEvent.endDate.toJSDate()).tz(DateUtils.timeZone);

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
            <div className="event-location">{icsEvent.location}</div>
            {icsMethod === 'request' ? this._renderRSVP() : this._renderSenderResponse()}
          </div>
        </div>
      </div>
    );
  }

  _renderSenderResponse() {
    const { icsEvent } = this.state;

    const from = this.props.message.from[0].email;
    const sender = CalendarUtils.cleanParticipants(icsEvent).find(p => p.email === from);
    if (!sender) return false;

    const verb: { [key: string]: string } = {
      DECLINED: localized('declined'),
      ACCEPTED: localized('accepted'),
      TENTATIVE: localized('tentatively accepted'),
      DELEGATED: localized('delegated'),
      COMPLETED: localized('completed'),
    }[sender.status];

    return <div className="event-actions">{localized(`%1$@ has %2$@ this event`, from, verb)}</div>;
  }

  _renderRSVP() {
    const { icsEvent, inflight } = this.state;
    const me = CalendarUtils.selfParticipant(icsEvent, this.props.message.accountId);
    if (!me) return false;

    let status = me.status;

    const icsTimeProperty = icsEvent.component.getFirstPropertyValue('dtstamp');
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
    );
  }

  _onRSVP = (status: ICSParticipantStatus) => {
    const { icsEvent, icsOriginalData, inflight } = this.state;
    if (inflight) return; // prevent double clicks

    const organizerEmail = CalendarUtils.emailFromParticipantURI(icsEvent.organizer);
    if (!organizerEmail) {
      AppEnv.showErrorDialog(
        localized(
          "Sorry, this event does not have an organizer or the organizer's address is not a valid email address: {}",
          icsEvent.organizer
        )
      );
    }

    this.setState({ inflight: status });

    Actions.queueTask(
      EventRSVPTask.forReplying({
        accountId: this.props.message.accountId,
        messageId: this.props.message.id,
        icsOriginalData,
        icsRSVPStatus: status,
        to: organizerEmail,
      })
    );
  };
}

export default EventHeader;
