import { Task } from './task';
import * as Attributes from '../attributes';
import { Event } from '../models/event';
import { AttributeValues } from '../models/model';
import { localized } from '../../intl';

export class DestroyEventTask extends Task {
  static attributes = {
    ...Task.attributes,

    events: Attributes.Collection({
      modelKey: 'events',
      itemClass: Event,
    }),
  };

  events: Event[];

  static forRemoving({ events }: { events: Event[] }) {
    return new DestroyEventTask({
      events: events,
      accountId: events[0].accountId,
    });
  }

  constructor(data: AttributeValues<typeof DestroyEventTask.attributes> = {}) {
    super(data);
  }

  label() {
    if (this.events.length === 1) {
      return localized('Deleting event...');
    }
    return localized('Deleting %@ events...', this.events.length);
  }
}
