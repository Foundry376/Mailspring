import { AccountStore } from 'mailspring-exports';

type ICAL = typeof import('ical.js').default;
type ICALComponent = InstanceType<ICAL['Component']>;
type ICALProperty = InstanceType<ICAL['Property']>;
type ICALEvent = InstanceType<ICAL['Event']>;

let ICAL: ICAL = null;

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
  component: ICALProperty;
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

export function emailFromParticipantURI(uri: string): string | null {
  if (!uri) {
    return null;
  }

  // Normalize to lowercase for comparison
  const uriLower = uri.toLowerCase();

  // Handle mailto: URI format (most common)
  // e.g., "mailto:user@example.com" or "MAILTO:user@example.com"
  if (uriLower.startsWith('mailto:')) {
    const email = uri.slice(7).toLowerCase(); // preserve original then lowercase
    if (email.includes('@')) {
      return email;
    }
    return null;
  }

  // Handle bare email addresses (no mailto: prefix)
  // Some calendar systems just use "user@example.com" directly
  if (uri.includes('@') && !uri.includes(':')) {
    return uri.toLowerCase();
  }

  // Handle URIs with email embedded after a colon (rare formats)
  // e.g., "invalid:user@example.com"
  const colonIndex = uri.indexOf(':');
  if (colonIndex !== -1) {
    const afterColon = uri.slice(colonIndex + 1);
    if (afterColon.includes('@') && !afterColon.includes('/')) {
      return afterColon.toLowerCase();
    }
  }

  // Try to extract email pattern from the string as a last resort
  // This handles edge cases where email is embedded in other formats
  const emailMatch = uri.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    return emailMatch[1].toLowerCase();
  }

  return null;
}

export function cleanParticipants(icsEvent: ICALEvent): ICSParticipant[] {
  return icsEvent.attendees.map(a => ({
    component: a,
    status: (a.getParameter('partstat') || 'NEEDS-ACTION') as ICSParticipantStatus,
    role: (a.getParameter('role') || 'REQ-PARTICIPANT') as ICSParticipant['role'],
    email: a.getValues().map(emailFromParticipantURI).find(v => !!v) || null,
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
