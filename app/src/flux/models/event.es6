import ical from 'ical.js';
import moment from 'moment';
import 'moment-timezone';

import Model from './model';
import Attributes from '../attributes';
import Contact from './contact';

// the Chrono node module is huge
let chrono = null;

export default class Event extends Model {
  // Note: This class doesn't have many table-level attributes. We store the ICS
  // data for the event in the model JSON and parse it when we pull it out.
  static attributes = Object.assign({}, Model.attributes, {
    calendarId: Attributes.String({
      queryable: true,
      jsonKey: 'cid',
      modelKey: 'calendarId',
    }),

    // The calculated Unix start time. See the implementation for how we
    // treat each type of "when" attribute.
    start: Attributes.Number({
      queryable: true,
      modelKey: '_start',
      jsonKey: '_start',
    }),

    // The calculated Unix end time. See the implementation for how we
    // treat each type of "when" attribute.
    end: Attributes.Number({
      queryable: true,
      modelKey: '_end',
      jsonKey: '_end',
    }),

    // This corresponds to the rowid in the FTS table. We need to use the FTS
    // rowid when updating and deleting items in the FTS table because otherwise
    // these operations would be way too slow on large FTS tables.
    searchIndexId: Attributes.Number({
      modelKey: 'searchIndexId',
      jsonKey: 'search_index_id',
    }),
  });

  static searchable = true;

  static searchFields = ['title', 'description', 'location', 'participants'];

  static sortOrderAttribute = () => {
    return Event.attributes.id;
  };

  static naturalSortOrder = () => {
    return Event.sortOrderAttribute().descending();
  };

  busy = false;

  title = '';

  description = '';

  status = '';

  location = '';

  participants = [];

  organizer = null;

  fromJSON(json) {
    super.fromJSON(json);

    const [cal, calattrs, items] = ical.parse(json.ics);
    const eventattrs = items.find(i => i[0] === 'vevent')[1];
    if (eventattrs) {
      const formatFieldVal = ([_, attrs, type, val] = []) => {
        if (type === 'date-time') {
          return moment.tz(val, attrs.tzid).toDate();
        }
        if (type === 'cal-address') {
          return { ...attrs, email: val.replace('mailto:', '') };
        }
        return val;
      };
      const getFieldVal = key => {
        return formatFieldVal(eventattrs.find(e => e[0] === key));
      };

      this.title = getFieldVal('summary');
      this.description = getFieldVal('description');
      this.status = getFieldVal('status');
      this.location = getFieldVal('location');
      this.busy = getFieldVal('transp') === 'OPAQUE';
      this.organizer = getFieldVal('organizer');
      this.attendees = eventattrs.filter(e => e[0] === 'attendee').map(formatFieldVal);
    }

    return this;
  }

  isAllDay() {
    const daySpan = 86400 - 1;
    return this.end - this.start >= daySpan;
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
