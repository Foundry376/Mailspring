import { Task } from './task';
import { AttributeValues } from '../models/model';
import Attributes from '../attributes';
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
    me.component.setParameter('partstat', icsRSVPStatus);
    root.updatePropertyWithValue('method', 'REPLY');

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
