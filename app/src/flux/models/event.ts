import { Model, AttributeValues } from './model';
import * as Attributes from '../attributes';
import { Contact } from './contact';

// the Chrono node module is huge
let chrono = null;

export class Event extends Model {
  // Note: This class doesn't have many table-level attributes. We store the ICS
  // data for the event in the model JSON and parse it when we pull it out.
  static attributes = {
    ...Model.attributes,

    calendarId: Attributes.String({
      queryable: true,
      jsonKey: 'cid',
      modelKey: 'calendarId',
    }),

    ics: Attributes.String({
      jsonKey: 'ics',
      modelKey: 'ics',
    }),

    icsuid: Attributes.String({
      queryable: true,
      jsonKey: 'icsuid',
      modelKey: 'icsuid',
    }),

    // RECURRENCE-ID for exception instances (e.g., "20240115T100000Z")
    // Empty string for master events, contains the original occurrence date for exceptions
    recurrenceId: Attributes.String({
      queryable: true,
      jsonKey: 'rid',
      modelKey: 'recurrenceId',
    }),

    // STATUS: TENTATIVE, CONFIRMED, or CANCELLED
    status: Attributes.String({
      queryable: true,
      jsonKey: 'status',
      modelKey: 'status',
    }),

    // The calculated Unix start time. See the implementation for how we
    // treat each type of "when" attribute.
    recurrenceStart: Attributes.Number({
      queryable: true,
      modelKey: 'recurrenceStart',
      jsonKey: 'rs',
    }),

    // The calculated Unix end time. See the implementation for how we
    // treat each type of "when" attribute.
    recurrenceEnd: Attributes.Number({
      queryable: true,
      modelKey: 'recurrenceEnd',
      jsonKey: 're',
    }),
  };

  static searchable = true;

  static searchFields = ['title', 'description', 'location', 'participants'];

  static sortOrderAttribute = () => {
    return Event.attributes.id;
  };

  static naturalSortOrder = () => {
    return Event.sortOrderAttribute().descending();
  };

  calendarId: string;
  ics: string;
  icsuid: string;
  recurrenceId: string;
  status: string;
  recurrenceEnd: number;
  recurrenceStart: number;
  title: string;
  participants: any[];

  constructor(data: AttributeValues<typeof Event.attributes>) {
    super(data);
  }

  /**
   * Returns true if this event is a recurrence exception (modified or cancelled instance)
   * Exceptions have a non-empty recurrenceId that identifies which occurrence was modified
   */
  isRecurrenceException(): boolean {
    return !!this.recurrenceId;
  }

  /**
   * Returns true if this event has been cancelled
   * Cancelled events may still be stored to show "this occurrence was cancelled"
   */
  isCancelled(): boolean {
    return this.status === 'CANCELLED';
  }

  /**
   * Returns the UID shared by the master event and all its exceptions
   */
  masterEventUID(): string {
    return this.icsuid;
  }

  displayTitle() {
    const displayTitle = this.title.replace(/.*Invitation: /, '');
    const [displayTitleWithoutDate, date] = displayTitle.split(' @ ');
    if (!chrono) {
      chrono = require('chrono-node'); //eslint-disable-line
    }
    if (date && chrono.parseDate(date)) {
      return displayTitleWithoutDate;
    }
    return displayTitle;
  }

  participantForMe = () => {
    for (const p of this.participants) {
      if (new Contact({ email: p.email }).isMe()) {
        return p;
      }
    }
    return null;
  };
}
