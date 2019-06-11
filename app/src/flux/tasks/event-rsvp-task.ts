import { Task } from './task';
import { AttributeValues } from '../models/model';
import Attributes from '../attributes';
import ICAL from 'ical.js';
import {
  localized,
  ICSParticipantStatus,
  SyncbackMetadataTask,
  CalendarUtils,
  DatabaseStore,
  Message,
  Actions,
} from 'mailspring-exports';

export class EventRSVPTask extends Task {
  ics: string;
  icsRSVPStatus: ICSParticipantStatus;
  subject: string;
  messageId: string;
  organizerEmail: string;

  static attributes = Object.assign({}, Task.attributes, {
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
  });

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
    const jcalData = ICAL.parse(icsOriginalData);
    const comp = new ICAL.Component(jcalData);
    const event = new ICAL.Event(comp.getFirstSubcomponent('vevent'));
    const me = CalendarUtils.selfParticipant(event, accountId);

    me.component.setParameter('partstat', icsRSVPStatus);
    comp.updatePropertyWithValue('method', 'REPLY');

    const icsReplyData = comp.toString();

    return new EventRSVPTask({
      to,
      subject: `${icsRSVPStatus[0].toUpperCase()}${icsRSVPStatus.substr(1).toLowerCase()}: ${
        event.summary
      }`,
      accountId,
      messageId,
      ics: icsReplyData,
      icsRSVPStatus,
    });
  }

  label() {
    return localized('Sending RSVP');
  }

  async onSuccess() {
    if (this.messageId && this.icsRSVPStatus) {
      const msg = await DatabaseStore.find<Message>(Message, this.messageId);
      if (!msg) return;
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
}
