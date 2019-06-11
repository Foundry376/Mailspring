import ICAL from 'ical.js';
import { AccountStore } from 'mailspring-exports';

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
  component: ICAL.Component;
}

export function eventFromICSString(ics: string) {
  const jcalData = ICAL.parse(ics);
  const comp = new ICAL.Component(jcalData);
  return new ICAL.Event(comp.name === 'vevent' ? comp : comp.getFirstSubcomponent('vevent'));
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

export function cleanParticipants(icsEvent: ICAL.Event): ICSParticipant[] {
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
  icsEvent: ICAL.Event,
  accountId: string
): ICSParticipant | undefined {
  const me = cleanParticipants(icsEvent).find(a => {
    const acct = AccountStore.accountForEmail(a.email);
    return acct && acct.id === accountId;
  });
  return me;
}
