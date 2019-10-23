import { AccountStore } from 'mailspring-exports';

type ICALComponent = typeof import('ical.js').Component;
type ICALEvent = typeof import('ical.js').Event;

let ICAL: typeof import('ical.js') = null;

export type ICSParticipantStatus =
  | 'NEEDS-ACTION'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'TENTATIVE'
  | 'DELEGATED'
  | 'COMPLETED'
  | 'IN-PROCESS';

export interface ICSParticipant {
  email: string | null;
  role: 'CHAIR' | 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'NON-PARTICIPANT';
  status: ICSParticipantStatus;
  component: ICALComponent;
}

function fixJCalDatesWithoutTimes(jCal) {
  jCal[1].forEach(property => {
    if (
      property[0] === 'dtstart' ||
      property[0] === 'dtend' ||
      property[0] === 'exdate' ||
      property[0] === 'rdate'
    ) {
      if (!property[1].value && property[2] === 'date-time' && /T::$/.test(property[3])) {
        property[2] = 'date';
        property[3] = property[3].replace(/T::$/, '');
      }
    }
  });
  jCal[2].forEach(fixJCalDatesWithoutTimes);
}

export function parseICSString(ics: string) {
  if (!ICAL) {
    ICAL = require('ical.js');
  }
  const jcalData = ICAL.parse(ics);

  // workaround https://github.com/mozilla-comm/ical.js/issues/186
  fixJCalDatesWithoutTimes(jcalData);

  const root = new ICAL.Component(jcalData);
  const event = new ICAL.Event(root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent'));
  return { root, event };
}

export function emailFromParticipantURI(uri: string) {
  if (!uri) {
    return null;
  }
  if (uri.toLowerCase().startsWith('mailto:')) {
    return uri.toLowerCase().replace('mailto:', '');
  }
  return null;
}

export function cleanParticipants(icsEvent: ICALEvent): ICSParticipant[] {
  return icsEvent.attendees.map(a => ({
    component: a,
    status: a.getParameter('partstat'),
    role: a.getParameter('role'),
    email: a
      .getValues()
      .map(emailFromParticipantURI)
      .find(v => !!v),
  }));
}

export function selfParticipant(
  icsEvent: ICALEvent,
  accountId: string
): ICSParticipant | undefined {
  const me = cleanParticipants(icsEvent).find(a => {
    const acct = AccountStore.accountForEmail(a.email);
    return acct && acct.id === accountId;
  });
  return me;
}
