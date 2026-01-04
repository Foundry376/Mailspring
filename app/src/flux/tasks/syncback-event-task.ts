import { Task } from './task';
import * as Attributes from '../attributes';
import { Event } from '../models/event';
import { AttributeValues } from '../models/model';
import { localized } from '../../intl';

export class SyncbackEventTask extends Task {
  static attributes = {
    ...Task.attributes,

    event: Attributes.Obj({
      modelKey: 'event',
      itemClass: Event,
    }),
    calendarId: Attributes.String({
      modelKey: 'calendarId',
    }),
  };

  event: Event;
  calendarId: string;

  static forCreating({
    event,
    calendarId,
    accountId,
  }: {
    event: Event;
    calendarId: string;
    accountId: string;
  }) {
    return new SyncbackEventTask({
      event,
      calendarId,
      accountId,
    });
  }

  static forUpdating({ event }: { event: Event }) {
    return new SyncbackEventTask({
      event,
      calendarId: event.calendarId,
      accountId: event.accountId,
    });
  }

  constructor(data: AttributeValues<typeof SyncbackEventTask.attributes> = {}) {
    super(data);
  }

  label() {
    return localized('Saving event...');
  }
}
