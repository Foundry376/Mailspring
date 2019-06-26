import ICAL from 'ical.js';

/**
 Public: The Calendar model represents a Calendar object.

 Section: Models
 */
class VFreeBusy {

}

class VTimeZone {

}

class VTodo {

}

class VJournal {

}

class Attendee {
  static roles = ['CHAIR', 'REQ-PARTICIPANT', 'OPT-PARTICIPANT', 'NON-PARTICIPANT'];
  static eventParticipationStatus = [
    'NEEDS-ACTION',
    'ACCEPTED',
    'DECLINED',
    'TENTATIVE',
    'DELEGATED',
  ];

  constructor(prop, type = 'event') {
    this._attendee = ICAL.helpers.clone(prop);
    this._parentType = type;
  }

  get email() {
    return Attendee._parseEmailTo(this._attendee.getFirstValue());
  }

  get language() {
    const lan = this._attendee.getFirstParameter('language');
    if (!lan) {
      return '';
    }
    return lan;
  }

  get dir() {
    const dir = this._attendee.getFirstParameter('dir');
    if (!dir) {
      return '';
    }
    return dir;
  }

  get name() {
    const name = this._attendee.getFirstParameter('cn');
    if (!name) {
      return '';
    }
    return name;
  }

  get sentBy() {
    return Attendee._parseEmails(this._attendee.getParameter('sent-by'));
  }

  isSentBy(email) {
    if (typeof email !== 'string' || email.length === 0) {
      return false;
    }
    return this.sentBy.includes(email);
  }

  get delegatedTo() {
    return Attendee._parseEmails(this._attendee.getParameter('delegated-to'));
  }

  isDelegatedTo(email) {
    if (typeof email !== 'string' || email.length === 0) {
      return false;
    }
    return this.delegatedTo.includes(email);
  }

  get delegatedFrom() {
    return Attendee._parseEmails(this._attendee.getParameter('delegated-from'));
  }

  isDeletagtedFrom(email) {
    if (typeof email !== 'string' || email.length === 0) {
      return false;
    }
    return this.delegatedFrom.includes(email);
  }

  get rsvp() {
    const rsvp = this._attendee.getFirstParameter('rsvp');
    if (!rsvp) {
      return false;
    }
    return rsvp === 'TRUE';
  }

  set rsvp(val) {
    this._attendee.setParameter('rsvp', !!val ? 'TRUE' : 'FALSE');
  }

  get participationStatus() {
    if (this._parentType === 'event') {
      return this._parseEventPartStat();
    } else {
      return '';
    }
  }

  _parseEventPartStat() {
    const stat = this._attendee.getFirstParameter('partstat');
    if (!stat) {
      return 'NEED-ACTION';
    }
    return stat.toUpperCase();
  }

  isActionRequired() {
    return this.participationStatus === 'NEEDS-ACTION';
  }

  isAccepted() {
    return this.participationStatus === 'ACCEPTED';
  }

  isDeclined() {
    return this.participationStatus === 'DECLINED';
  }

  isTentative() {
    return this.participationStatus === 'TENTATIVE';
  }

  isDelegated() {
    return this.participationStatus === 'DELEGATED';
  }

  set participationStatus(val) {
    if (this._parentType === 'event') {
      this._setEventParticipationStatus(val);
    }
  }

  _setEventParticipationStatus(val) {
    if (!Attendee.eventParticipationStatus.includes(val)) {
      val = 'NEEDS-ACTION';
    }
    this._attendee.setParameter('partstat', val);
  }

  accept() {
    this.participationStatus = 'ACCEPTED';
  }

  decline() {
    this.participationStatus = 'DECLINED';
  }

  tentative() {
    this.participationStatus = 'TENTATIVE';
  }

  clearParticipationStatus() {
    this.participationStatus = 'NEEDS-ACTION';
  }

  get type() {
    const cuType = this._attendee.getFirstParameter('cutype');
    if (!cuType) {
      return 'INDIVIDUAL';
    }
    return cuType.toUpperCase();
  }

  isIndividual() {
    return this.type === 'INDIVIDUAL';
  }

  isGroup() {
    return this.type === 'GROUP';
  }

  isResource() {
    return this.type === 'RESOURCE';
  }

  isRoom() {
    return this.type === 'ROOM';
  }

  get membership() {
    return Attendee._parseEmails(this._attendee.getParameter('memeber'));
  }

  isMemberOf(email) {
    if (typeof email !== 'string' || email === '') {
      throw new Error('Calender:Attendee::isMemberOf takes in one email address as a String');
    }
    if (this.membership.length === 0) {
      return false;
    }
    return this.membership.includes(email);
  }

  static _parseEmails(emails) {
    if (!emails) {
      return [];
    }
    if (Array.isArray(emails)) {
      return emails.map(str => Attendee._parseEmailTo(str)).filter(str => str.length > 0);
    } else {
      const email = Attendee._parseEmailTo(emails);
      if (email === '') {
        return [];
      }
      return [email];
    }
  }

  static _parseEmailTo(str) {
    if (typeof str !== 'string' || !str.includes('mailto:')) {
      return '';
    }
    return str.split(':')[1];
  }

  get role() {
    const role = this._attendee.getFirstParameter('role');
    if (!role) {
      return 'REQ-PARTICIPANT';
    }
    return role.toUpperCase();
  }

  isChair() {
    return this.role === 'CHAIR';
  }

  isRequired() {
    return this.role === 'REQ-PARTICIPANT';
  }

  isOptional() {
    return this.role === 'OPT-PARTICIPANT';
  }

  isFYI() {
    return this.role === 'NON-PARTICIPANT';
  }

  set role(val) {
    if (!Attendee.roles.includes(val)) {
      AppEnv.logWarning(`Setting invalid value to Calender:Attendee.role ${val}`);
      val = 'REQ-PARTICIPANT';
    }
    this._attendee.setParameter('role', val);
  }
}

class Organizer {
  constructor(address) {
    this._address = address;
    this._organizerName = this._parseOrganizerName();
    this._returnEmail = this._parseReturnEmail();
    this._sender = this._parseSender();
    this._dir = this._parseDir();
  }

  static parse(str) {
    if (typeof str !== 'string' || str === '') {
      return null;
    }
    const tmp = ICAL.Property.fromString(str);
    if (!tmp) {
      return null;
    }
    return new Organizer(tmp);
  }

  get name() {
    return this._organizerName;
  }

  get email() {
    return this._returnEmail;
  }

  get organizerName() {
    return this._organizerName;
  }

  get returnEmail() {
    return this._returnEmail;
  }

  get sender() {
    return this._sender;
  }

  get dir() {
    return this._dir;
  }

  _parseEmailTo(str) {
    if (typeof str !== 'string' || !str.includes('mailto:')) {
      return '';
    }
    return str.split(':')[1];
  }

  get address() {
    return this._address;
  }

  _parseReturnEmail() {
    const mailTo = this._address.getFirstValue();
    return this._parseEmailTo(mailTo);
  }

  _parseSender() {
    const sentBy = this._address.getParameter('sent-by');
    const ret = { email: this._returnEmail, name: this._organizerName, dir: this._dir };
    if (!sentBy) {
      return ret;
    }
    const sender = Organizer.parse(sentBy);
    if (!sender) {
      return ret;
    }
    return { email: sender.returnEmail, name: sender.organizerName, dir: sender.dir };
  }

  _parseOrganizerName() {
    const name = this._address.getParameter('cn');
    if (!name) {
      return '';
    } else {
      return name;
    }
  }

  _parseDir() {
    return this._address.getParameter('dir');
  }

}

class VEvent extends ICAL.Event {
  constructor(vEvent) {
    super(vEvent);
    this._dtstamp = this.getFirstPropertyValue('dtstamp');
    this._class = this.getFirstPropertyValue('class');
    this._created = this.getFirstPropertyValue('created');
    this._geo = this.getFirstPropertyValue('geo');
    this._lastMod = this.getFirstPropertyValue('last-modified');
    this._location = this.getFirstProperty('location');
    this._organizer = new Organizer(this.getFirstProperty('organizer'));
    this._priority = this.getFirstPropertyValue('priority');
    this._seq = this.getFirstPropertyValue('sequence');
    this._status = this.getFirstPropertyValue('status');
    this._transp = this.getFirstPropertyValue('transp');
    this._url = this.getFirstPropertyValue('url');
    this._rrule = this.getFirstPropertyValue('rrule');
    this._attaches = this.getAllProperties('attach');
    this._attendees = this.getAllProperties('attendee').map(
      attendee => new Attendee(attendee, 'event'),
    );
    // this._categories = vEvent.getAllProperties('categories');
    // this._comments = vEvent.getAllProperties('comment');
    // this._contacts = vEvent.getAllProperties('contact');
    // this._exdates = vEvent.getAllProperties('exdate');
    // this._rstatuses = vEvent.getAllProperties('request-status');
    // this._relatedes = vEvent.getAllProperties('related-to');
    // this._resources = vEvent.getAllProperties('resources');
    // this._rdates = vEvent.getAllProperties('rdate');
  }

  //
  // get uid() {
  //   return this._uid;
  // }

  get dtstamp() {
    if (!this._dtstamp) {
      return null;
    }
    return this._dtstamp.toJSDate();
  }

  // get dtstart() {
  //   if (!this._dtstart) {
  //     return null;
  //   }
  //   return new Date(this._dtstart);
  // }

  get class() {
    return this._class;
  }

  isPrivate() {
    if (!this._class) {
      return false;
    }
    return this._class.toUpperCase() === 'PRIVATE';
  }

  isConfidential() {
    if (!this._class) {
      return false;
    }
    return this._class.toUpperCase() === 'CONFIDENTIAL';
  }

  isPublic() {
    if (!this._class) {
      return false;
    }
    return this._class.toUpperCase() === 'PUBLIC';
  }

  get created() {
    if (!this._created) {
      return null;
    }
    return this._created.toJSDate();
  }

  // get description() {
  //   return this._description;
  // }

  get geo() {
    if (!this._geo) {
      return null;
    }
    const cord = this._geo.split(',');
    return {
      lat: cord[0],
      lon: cord[1],
    };
  }

  get lastModified() {
    if (!this._lastMod) {
      return null;
    }
    return this._lastMod.toJSDate();
  }

  get location() {
    if (!this._location) {
      return null;
    }
    return this._location.getFirstValue();
  }

  get organizer() {
    return this._organizer;
  }

  get priority() {
    // 0 means no priority, 1 is highest, 9 is lowest;
    return this._priority || 0;
  }

  set priority(val) {
    if (!Number.isFinite(val)) {
      throw new Error('Priority must be an integer between 0 and 9, inclusive');
    }
    if (val < 0) {
      this.updatePropertyWithValue('priority', 0);
      AppEnv.logWarning('Calender:VEvent:Priority is less than 0, setting priority to 0');
    } else if (val > 9) {
      this.updatePropertyWithValue('priority', 9);
      AppEnv.logWarning('Calender:VEvent:Priority is greater than 9, setting priority to 0');
    } else {
      this.updatePropertyWithValue('priority', Math.floor(val));
    }
    this._priority = this.getFirstPropertyValue('priority');
  }

  get sequence() {
    return this._seq || 0;
  }

  incrementSequence() {
    this.updatePropertyWithValue('sequence', this._seq + 1);
    this._seq = this.getFirstPropertyValue('sequence');
  }

  get status() {
    if (!this._status) {
      return '';
    }
    return this._status.toUpperCase();
  }

  isTentative() {
    return this.status === 'TENTATIVE';
  }

  isConfirmed() {
    return this.status === 'CONFIRMED';
  }

  isCancelled() {
    return this.status === 'CANCELLED';
  }

  tentative() {
    this.updatePropertyWithValue('status', 'TENTATIVE');
    this._status = 'TENTATIVE';
  }

  confirm() {
    this.updatePropertyWithValue('status', 'CONFIRMED');
    this._status = 'CONFIRMED';
  }

  cancel() {
    this.updatePropertyWithValue('status', 'CANCELLED');
    this._status = 'CANCELLED';
  }

  // get summary() {
  //   return this._summary;
  // }

  get transparent() {
    return this._transp.toUpperCase();
  }

  get blocked() {
    return this._transp.toUpperCase() === 'OPAQUE';
  }

  set blocked(val) {
    if (!!val) {
      this.updatePropertyWithValue('transp', 'OPAQUE');
      this._transp = 'OPAQUE';
    } else {
      this.updatePropertyWithValue('transp', 'TRANSPARENT');
      this._transp = 'TRANSPARENT';
    }
  }

  get url() {
    return this._url;
  }

  get rrule() {
    return this._rrule;
  }

  // get dtend() {
  //   return this._dtend;
  // }
  //
  // get duration() {
  //   return this._duration;
  // }
  //
  get attaches() {
    return this._attaches;
  }

  get attendees() {
    return this._attendees;
  }

  getAllAttendeesEmail() {
    return this.attendees.map(attendee => attendee.email);
  }

  filterAttendeesBy({ criteria = '', value = '' } = {}) {
    if (!['role', 'type', 'participationStatus', 'rsvp'].includes(criteria)) {
      return [];
    }
    return this.attendees.filter(attendees => attendees[criteria] === value);
  }

  filterAttendeesEmailBy({ criteria = '', value = '' } = {}) {
    return this.filterAttendeesBy({ criteria, value }).map(attendee => attendee.email);
  }

  get categories() {
    return this.getAllProperties('categories').map(cat => cat.getFirstValue());
  }

  containsCategory(cat) {
    if (typeof cat !== 'string' || cat.length === 0) {
      return false;
    }
    return this.categories.includes(cat);
  }

  get comments() {
    return this.getAllProperties('comment').map(item => item.getFirstValue());
  }

  get contacts() {
    return this.getAllProperties('contact').map(item => item.getFirstValue());
  }
  //
  // get exdates() {
  //   return this._exdates;
  // }
  //
  // get rstatuses() {
  //   return this._rstatuses;
  // }
  //
  // get relatedes() {
  //   return this._relatedes;
  // }
  //
  // get resources() {
  //   return this._resources;
  // }
  //
  // get rdates() {
  //   return this._rdates;
  // }
  getAllProperties(prop) {
    return this.component.getAllProperties(prop);
  }

  getFirstProperty(prop) {
    return this.component.getFirstProperty(prop);
  }

  getFirstPropertyValue(prop) {
    return this.component.getFirstPropertyValue(prop);
  }

  updatePropertyWithValue(prop, val) {
    this._lastMod.fromUnixTime(Date.now());
    this.component.updatePropertyWithValue('last-modified', this._lastMod);
    this.component.updatePropertyWithValue(prop, val);
  }
}

export default class Calendar {
  constructor(jcalData) {
    const vCalendar = new ICAL.Component(jcalData);
    this._VEvents = vCalendar.getAllSubcomponents('vevent').map(e => new VEvent(e));
    this._VTodos = vCalendar.getAllSubcomponents('vtodo').map(todo => new VTodo(todo));
    this._VJournals = vCalendar
      .getAllSubcomponents('vjournal')
      .map(journal => new VJournal(journal));
    this._VTimeZones = vCalendar
      .getAllSubcomponents('vtimezone')
      .map(timezone => new VTIMEZONE(timezone));
    this._VFreeBusys = vCalendar
      .getAllSubcomponents('vfreebusy')
      .map(freebusy => new VFreeBusy(freebusy));
    this._productId = vCalendar.getFirstPropertyValue('prodid');
    this._version = vCalendar.getFirstPropertyValue('_version');
    this._calenderScale = vCalendar.getFirstPropertyValue('calscale');
    this._method = vCalendar.getFirstPropertyValue('_method');
  }

  static parse(str) {
    if (typeof str !== 'string') {
      return null;
    }
    if (str === '') {
      return null;
    }
    try {
      return new Calendar(ICAL.parse(str));
    } catch (err) {
      AppEnv.reportError(err);
      return null;
    }
  }

  get VEvents() {
    return this._VEvents;
  }

  getFirstEvent() {
    if (this._VEvents.length > 0) {
      return this._VEvents[0];
    } else {
      return null;
    }
  }

  get VTodos() {
    return this._VTodos;
  }

  get VJournals() {
    return this._VJournals;
  }

  get VTimeZones() {
    return this._VTimeZones;
  }

  get VFreeBusys() {
    return this._VFreeBusys;
  }

  get productId() {
    return this._productId;
  }

  get version() {
    return this._version;
  }

  get calenderScale() {
    return this._calenderScale;
  }

  get method() {
    return this._method;
  }
}
