/**
 * A calendar date — no time, no timezone. Days since 1970-01-01.
 *
 * The brand blocks a unix timestamp being passed as a date. It does not block the reverse:
 * an intersection is assignable to `number`, so a date still flows into a seconds parameter.
 */
export type CalendarDate = number & { readonly __calendarDate: unique symbol };

const MS_PER_DAY = 86400000;

/** ~12x the cost of a Date component read, so build one per zone, not per call */
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    partFormatters.set(zone, formatter);
  }
  return formatter;
}

/**
 * The calendar date an instant falls on, in `zone` or the host's zone. No caller passes a zone
 * yet; it's the seam a display-timezone setting needs, and what lets specs cover real zones.
 *
 * No arithmetic: any time of day on a date yields that date, including the 01:00 the sync
 * engine writes and the 23:00 a seconds shift lands on.
 *
 * The host-zone path reads `Date` components live. It must not go through a cached formatter:
 * `Intl` fixes its zone at construction, so after the host's zone changes — a laptop waking in
 * a new one — a cached formatter keeps reporting the old date, and this module's callers write
 * that date into ICS. Reading live also costs ~0.3µs against ~2µs through `Intl`.
 */
export function calendarDateFromUnix(unixSeconds: number, zone?: string): CalendarDate {
  const instant = new Date(unixSeconds * 1000);
  if (!zone) {
    return calendarDateFromParts(instant.getFullYear(), instant.getMonth() + 1, instant.getDate());
  }
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of partFormatterFor(zone).formatToParts(instant)) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
  }
  return calendarDateFromParts(year, month, day);
}

/**
 * The first instant of a date, in the local zone.
 *
 * Where local midnight doesn't exist (Santiago, Havana, Beirut on their transition day) this
 * is 01:00 — the day's true first instant, since `new Date(y, m, d)` resolves the gap forward.
 */
export function dayStartUnix(date: CalendarDate): number {
  const utc = new Date(date * MS_PER_DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()).getTime() / 1000;
}

/**
 * The first instant after a date — the exclusive end callers store or serialize.
 */
export function nextDayStartUnix(date: CalendarDate): number {
  return dayStartUnix(addCalendarDays(date, 1));
}

/**
 * The start of the date `days` after the one this instant falls on.
 *
 * A migration bridge for callers that still hold instants. It goes away as they move to
 * holding dates, at which point they compose the two functions above directly.
 */
export function shiftedDayStartUnix(unixSeconds: number, days: number): number {
  return dayStartUnix(addCalendarDays(calendarDateFromUnix(unixSeconds), days));
}

/** Shift by whole days. Free and exact — epoch days have no transitions to cross. */
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return (date + days) as CalendarDate;
}

/** Whole days from one date to another. Negative when `to` precedes `from`. */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  return to - from;
}

/** From y/m/d directly, so no timezone is applied on the way. `month` is 1-based, as in ICS. */
export function calendarDateFromParts(year: number, month: number, day: number): CalendarDate {
  return (Date.UTC(year, month - 1, day) / MS_PER_DAY) as CalendarDate;
}

/** ISO form, `2026-06-21`. For debugging, specs, and anywhere a human reads the value. */
export function formatCalendarDate(date: CalendarDate): string {
  const d = new Date(date * MS_PER_DAY);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${month}-${day}`;
}

/** Builds a CalendarDate from `2026-06-21`. The inverse of `formatCalendarDate`. */
export function parseCalendarDate(iso: string): CalendarDate {
  return calendarDateFromParts(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)),
    Number(iso.slice(8, 10))
  );
}
