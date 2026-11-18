export type AlertTiming =
  | 'none'
  | '5min'
  | '10min'
  | '15min'
  | '30min'
  | '1hour'
  | '2hours'
  | '1day'
  | '2days'
  | '1week'
  /** A reminder the event already had that none of the options describes. */
  | 'custom';

// Each timing's TRIGGER, as getAlarmTrigger normalizes one: an offset before DTSTART (RFC 5545
// section 3.8.6.3).
const ALERT_TRIGGERS: Record<Exclude<AlertTiming, 'none' | 'custom'>, string> = {
  '5min': '-PT5M',
  '10min': '-PT10M',
  '15min': '-PT15M',
  '30min': '-PT30M',
  '1hour': '-PT1H',
  '2hours': '-PT2H',
  '1day': '-P1D',
  '2days': '-P2D',
  '1week': '-P1W',
};

/** The TRIGGER to write for a timing, or null for none. */
export function alertTrigger(alert: AlertTiming): string | null {
  return alert === 'none' || alert === 'custom' ? null : ALERT_TRIGGERS[alert];
}

/** The timing an event's first reminder reads as; see ICSEventHelpers.getAlarmTrigger. */
export function alertForTrigger(trigger: string | null): AlertTiming {
  if (!trigger) return 'none';
  const match = Object.keys(ALERT_TRIGGERS).find((k) => ALERT_TRIGGERS[k] === trigger);
  return (match as AlertTiming) || 'custom';
}

/** A relative reminder on an all-day event goes off at midnight, so a new one starts with none. */
export function defaultAlert(isAllDay: boolean): AlertTiming {
  return isAllDay ? 'none' : '10min';
}
