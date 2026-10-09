import { Task } from './task';
import { AttributeValues } from '../models/model';
import * as Attributes from '../attributes';
import {
  localized,
  ICSParticipantStatus,
  SyncbackMetadataTask,
  CalendarUtils,
  DatabaseStore,
  Message,
  Actions,
} from 'mailspring-exports';

/**
 * Emails an iTIP message to a meeting organizer (RFC 5546): a REPLY with our status, or a
 * COUNTER proposing another time. The sync engine reads an absent `method` as REPLY.
 */
export class EventRSVPTask extends Task {
  ics: string;
  icsRSVPStatus: ICSParticipantStatus;
  subject: string;
  messageId: string;
  organizerEmail: string;
  method: 'REPLY' | 'COUNTER';
  comment: string;

  static attributes = {
    ...Task.attributes,

    ics: Attributes.String({
      modelKey: 'ics',
    }),
    icsRSVPStatus: Attributes.String({
      modelKey: 'icsRSVPStatus',
    }),
    to: Attributes.String({
      modelKey: 'to',
    }),
    subject: Attributes.String({
      modelKey: 'subject',
    }),
    messageId: Attributes.String({
      modelKey: 'messageId',
    }),
    method: Attributes.String({
      modelKey: 'method',
    }),
    comment: Attributes.String({
      modelKey: 'comment',
    }),
  };

  constructor(data: AttributeValues<typeof EventRSVPTask.attributes> = {}) {
    super(data);
  }

  static forReplying({
    accountId,
    to,
    messageId,
    icsOriginalData,
    icsRSVPStatus,
  }: {
    to: string;
    accountId: string;
    messageId?: string;
    icsOriginalData: string;
    icsRSVPStatus: ICSParticipantStatus;
  }) {
    const { event, root } = CalendarUtils.parseICSString(icsOriginalData);
    const me = CalendarUtils.selfParticipant(event, accountId);
    if (!me) {
      throw new Error(
        `EventRSVPTask.forReplying: could not find an attendee matching account ${accountId} in this event's ICS data.`
      );
    }

    // Set METHOD to REPLY at the calendar level
    root.updatePropertyWithValue('method', 'REPLY');

    // Per RFC 5546 section 3.2.3 a REPLY names exactly one ATTENDEE - the person replying.
    // Every VEVENT has to be cleaned, not just the master: an invitation to a series carries
    // its modified occurrences as further VEVENTs, and leaving their guest lists intact ships
    // the organizer a REPLY that also purports to speak for everyone else.
    const myEmail = me.email.toLowerCase();
    for (const vevent of root.getAllSubcomponents('vevent')) {
      for (const attendee of vevent.getAllProperties('attendee')) {
        const isMine = attendee
          .getValues()
          .some((v) => CalendarUtils.emailFromParticipantURI(String(v)) === myEmail);
        if (isMine) {
          attendee.setParameter('partstat', icsRSVPStatus);
          attendee.removeParameter('rsvp');
        } else {
          vevent.removeProperty(attendee);
        }
      }
    }

    const icsReplyData = root.toString();

    return new EventRSVPTask({
      to,
      subject: `${icsRSVPStatus[0].toUpperCase()}${icsRSVPStatus.substr(1).toLowerCase()}: ${
        event.summary
      }`,
      accountId,
      messageId,
      ics: icsReplyData,
      icsRSVPStatus,
      method: 'REPLY',
    });
  }

  /** Sends the COUNTER that ICSEventHelpers.createCounterProposal built. */
  static forProposingNewTime({
    accountId,
    to,
    messageId,
    ics,
    summary,
    comment,
  }: {
    accountId: string;
    to: string;
    messageId?: string;
    ics: string;
    summary: string;
    comment?: string;
  }) {
    return new EventRSVPTask({
      to,
      subject: localized('New time proposed: %@', summary),
      accountId,
      messageId,
      ics,
      method: 'COUNTER',
      comment,
    });
  }

  label() {
    return this.method === 'COUNTER'
      ? localized('Proposing a new time')
      : localized('Sending RSVP');
  }

  async onSuccess() {
    // A counter-proposal is not an answer, so the RSVP buttons must not show one.
    if (this.messageId && this.icsRSVPStatus && this.method !== 'COUNTER') {
      const msg = await DatabaseStore.find<Message>(Message, this.messageId);
      if (msg) {
        Actions.queueTask(
          SyncbackMetadataTask.forSaving({
            model: msg,
            pluginId: 'event-rsvp',
            value: {
              status: this.icsRSVPStatus,
              time: Date.now(),
            },
          })
        );
      }
    }

    // Pull the provider's latest calendar state after any RSVP response. Calendar
    // views observe the local Event table and update as soon as this sync lands.
    AppEnv.mailsyncBridge.sendSyncCalendarNow(this.accountId);
  }
}
