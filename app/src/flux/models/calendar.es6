import Model from './model';
import Attributes from '../attributes';
import ICAL from 'ical.js';

/**
 Public: The Calendar model represents a Calendar object.

 ## Attributes

 `name`: {AttributeString} The name of the calendar.

 `description`: {AttributeString} The description of the calendar.

 This class also inherits attributes from {Model}

 Section: Models
 */
class VFreeBusy extends Model {

}

class VTIMEZONE extends Model {

}

class VTodo extends Model {

}

class VJournal extends Model {

}

class VEvent extends Model {
  static attributes = Object.assign({}, Model.attributes, {
    uid: Attributes.String({
      modelKey: 'uid',
    }),
    dtstamp: Attributes.DateTime({
      modelKey: 'dtstamp',
    }),
    dtstart: Attributes.DateTime({
      modelKey: 'dtstart',
    }),
    class: Attributes.String({
      modelKey: 'class',
    }),
    created: Attributes.String({
      modelKey: 'created',
    }),
    description: Attributes.String({
      modelKey: 'description',
    }),
    geo: Attributes.String({
      modelKey: 'geo',
    }),
    lastMod: Attributes.String({
      modelKey: 'lastMod',
    }),
    location: Attributes.String({
      modelKey: 'location',
    }),
    organizer: Attributes.String({
      modelKey: 'organizer',
    }),
    priority: Attributes.String({
      modelKey: 'priority',
    }),
    seq: Attributes.String({
      modelKey: 'seq',
    }),
    status: Attributes.String({
      modelKey: 'status',
    }),
    summary: Attributes.String({
      modelKey: 'summary',
    }),
    transp: Attributes.String({
      modelKey: 'transp',
    }),
    url: Attributes.String({
      modelKey: 'url',
    }),
    recurid: Attributes.String({
      modelKey: 'recurid',
    }),
    rrule: Attributes.String({
      modelKey: 'rrule',
    }),
    dtend: Attributes.DateTime({
      modelKey: 'dtend',
    }),
    duration: Attributes.String({
      modelKey: 'duration',
    }),
    attachments: Attributes.Collection({
      modelKey: 'attachments',
    }),
    attendee: Attributes.Collection({
      modelKey: 'attendee',
    }),
    categories: Attributes.Collection({
      modelKey: 'categories',
    }),
    comments: Attributes.Collection({
      modelKey: 'comments',
    }),
    contacts: Attributes.Collection({
      modelKey: 'contacts',
    }),
    exdate: Attributes.Collection({
      modelKey: 'exdate',
    }),
    rstatus: Attributes.Collection({
      modelKey: 'rstatus',
    }),
    related: Attributes.Collection({
      modelKey: 'related',
    }),
    resources: Attributes.Collection({
      modelKey: 'resources',
    }),
    rdate: Attributes.Collection({
      modelKey: 'rdate',
    }),
  });
}

export default class Calendar {
  static attributes = {
    productId: Attributes.String({
      modelKey: 'PRODID',
    }),
    version: Attributes.String({
      modelKey: 'version',
    }),
    calenderScale: Attributes.String({
      modelKey: 'calscale',
    }),
    method: Attributes.String({
      modelKey: 'method',
    }),
    VEvents: Attributes.Collection({
      modelKey: 'VEvents',
    }),
    VTodos: Attributes.Collection({
      modelKey: 'VTodos',
    }),
    VJournals: Attributes.Collection({
      modelKey: 'VJournals',
    }),
    VTimeZones: Attributes.Collection({
      modelKey: 'VTimeZones',
    }),
    VFreeBusys: Attributes.Collection({
      modelKey: 'VFreeBusys',
    }),
  };
  constructor(jcalData) {
    const vCalendar = new ICAL.Component(jcalData);
    this.VEvents = vCalendar.getAllSubcomponents('vevent').map(e => new VEvent(e));
    this.VTodos = vCalendar.getAllSubcomponents('vtodo').map(todo => new VTodo(todo));
    this.VJournals = vCalendar
      .getAllSubcomponents('vjournal')
      .map(journal => new VJournal(journal));
    this.VTimeZones = vCalendar
      .getAllSubcomponents('vtimezone')
      .map(timezone => new VTIMEZONE(timezone));
    this.VFreeBusys = vCalendar
      .getAllSubcomponents('vfreebusy')
      .map(freebusy => new VFreeBusy(freebusy));
  }

  static parse(str) {
    if (typeof str !== 'string') {
      return null;
    }
    if(str===''){
      return null;
    }
    try {
      return new Calendar(ICAL.parse(str));
    } catch (err) {
      AppEnv.reportError(err);
      return null;
    }
  }
}
