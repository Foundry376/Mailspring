import { Model, AttributeValues } from './model';
import Attributes from '../attributes';
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
  recurrenceEnd: number;
  recurrenceStart: number;
  title: string;
  participants: any[];

  constructor(data: AttributeValues<typeof Event.attributes>) {
    super(data);
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
