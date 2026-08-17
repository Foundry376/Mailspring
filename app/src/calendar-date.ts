/**
 * A calendar date — no time, no timezone. Days since 1970-01-01.
 *
 * All-day events are dates in ICS (`DTSTART;VALUE=DATE:20260621`), but the app has always
 * held them as unix seconds, so a date got encoded as local midnight and then had instant
 * arithmetic done to it. That mismatch produced every all-day DST bug we've fixed.
 *
 * The brand keeps a CalendarDate from being passed where a unix timestamp is expected, and
 * vice versa — the two are both `number` and were previously interchangeable to the compiler.
 */
export type CalendarDate = number & { readonly __calendarDate: unique symbol };

const MS_PER_DAY = 86400000;

/** Formatters are ~12x the cost of a Date component read, so build one per zone, not per call */
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatterFor(zone: string | undefined): Intl.DateTimeFormat {
  const key = zone ?? '';
  let formatter = partFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, // undefined reads in the host's zone
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    partFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * The calendar date an instant falls on.
 *
 * Reads the date components and discards the time. There is deliberately no arithmetic here:
 * the instant may be any time of day — midnight, 01:00 where midnight doesn't exist, or 23:00
 * from a seconds-based shift — and all of them name the same date.
 *
 * `zone` is read explicitly rather than taken from the host, so a caller can render a calendar
 * in a chosen zone and so specs can exercise real zones without the suite running in one.
 * Reads through `formatToParts` rather than a locale's date format, which isn't guaranteed.
 *
 * Costs ~2µs, so call it once per occurrence and keep the result; don't call it per render.
 */
export function calendarDateOf(unixSeconds: number, zone?: string): CalendarDate {
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of partFormatterFor(zone).formatToParts(new Date(unixSeconds * 1000))) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
  }
  // Assembled in UTC, which has no transitions, so the day count can't be skewed
  return (Date.UTC(year, month - 1, day) / MS_PER_DAY) as CalendarDate;
}

/**
 * The first instant of a date, in the local zone.
 *
 * Where local midnight doesn't exist (Santiago, Havana, Beirut on their transition day) this
 * is 01:00 — the day's true first instant — because `new Date(y, m, d)` resolves the gap
 * forward. Callers wanting "the start of this day" get exactly that, whatever it reads as.
 */
export function unixDayStart(date: CalendarDate): number {
  const utc = new Date(date * MS_PER_DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()).getTime() / 1000;
}

/**
 * The first instant after a date — RFC 5545's exclusive end.
 *
 * Layout and serialization both need this: `event.start < dayEnd && event.end > dayStart`
 * relies on the exclusive boundary to keep the day after a span from lighting up, and ICS
 * writes `DTEND` exclusively. Derived rather than stored, so a mistake here draws a wrong
 * cell instead of persisting a wrong date.
 */
export function unixDayEndExclusive(date: CalendarDate): number {
  return unixDayStart(addCalendarDays(date, 1));
}

/** Shift by whole days. Free and exact — epoch days have no transitions to cross. */
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return (date + days) as CalendarDate;
}

/** Whole days from one date to another. Negative when `to` precedes `from`. */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  return to - from;
}

/** Days covered by an inclusive range, so a single-day event is 1. */
export function calendarDaySpan(start: CalendarDate, endInclusive: CalendarDate): number {
  return endInclusive - start + 1;
}

/** Parses the ICS DATE form, `20260621`. */
export function parseICSDate(value: string): CalendarDate {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  return (Date.UTC(year, month - 1, day) / MS_PER_DAY) as CalendarDate;
}

/** Formats for ICS, `20260621`. */
export function formatICSDate(date: CalendarDate): string {
  const d = new Date(date * MS_PER_DAY);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}${month}${day}`;
}

/** ISO form, `2026-06-21`. For debugging, specs, and anywhere a human reads the value. */
export function formatCalendarDate(date: CalendarDate): string {
  const d = new Date(date * MS_PER_DAY);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/** Builds a CalendarDate from `2026-06-21`. The inverse of `formatCalendarDate`. */
export function parseCalendarDate(iso: string): CalendarDate {
  return parseICSDate(iso.replace(/-/g, ''));
}
