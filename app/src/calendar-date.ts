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
 * Calls `onChange` once the local date moves past `today`: shortly after each midnight, and when
 * the window shows again, since a timer set before the machine slept fires late. Dispose to stop.
 */
export function onDayChange(
  today: CalendarDate,
  onChange: (today: CalendarDate) => void,
  nowUnix: () => number = () => Date.now() / 1000
): { dispose(): void } {
  let timer: number | undefined;

  const check = () => {
    const now = nowUnix();
    const date = calendarDateFromUnix(now);
    if (date !== today) {
      today = date;
      onChange(date);
    }
    schedule(now);
  };
  // The extra second keeps a timer that fires slightly early from landing on the same day and
  // scheduling a second near-zero wait.
  const schedule = (now: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, Math.max(1, nextDayStartUnix(today) - now + 1) * 1000);
  };
  const onVisibilityChange = () => {
    if (!document.hidden) check();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  schedule(nowUnix());
  return {
    dispose() {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}

/**
 * Wall-clock seconds since the local midnight of the date an instant falls on: 10:30 is 37800
 * on a 23- or 25-hour day too. Not `unix - dayStartUnix(date)`, which is elapsed time and sits
 * an hour off the clock after a DST transition.
 */
export function secondsIntoDay(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/**
 * The instant at a wall-clock offset into a date, in the local zone. The inverse of
 * `secondsIntoDay` wherever the clock reading exists once; a time inside a spring-forward gap
 * resolves forward, and a time the fall-back repeats resolves to its first occurrence.
 */
export function secondsIntoDayUnix(date: CalendarDate, seconds: number): number {
  const utc = new Date(date * MS_PER_DAY);
  return (
    new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 0, 0, seconds).getTime() /
    1000
  );
}

/**
 * The first instant on this instant's date with its clock reading — the instant a wall-clock
 * grid maps that reading to. Only differs from the instant inside the second occurrence of a
 * fall-back repeated hour, where it is an hour earlier.
 */
export function firstOccurrenceUnix(unixSeconds: number): number {
  return secondsIntoDayUnix(calendarDateFromUnix(unixSeconds), secondsIntoDay(unixSeconds));
}

/**
 * `instant`, or the other instant with the same clock reading on the reference's side of a
 * fall-back transition — the one sharing its UTC offset. A repeated reading names two instants;
 * this picks the one a gesture relative to `reference` means. Candidates half an hour away
 * cover zones whose DST shift is 30 minutes (Lord Howe Island).
 */
export function sameOffsetOccurrenceUnix(instant: number, reference: number): number {
  const reading = secondsIntoDay(instant);
  const offset = new Date(reference * 1000).getTimezoneOffset();
  if (new Date(instant * 1000).getTimezoneOffset() === offset) {
    return instant;
  }
  for (const delta of [-3600, -1800, 1800, 3600]) {
    const alt = instant + delta;
    if (secondsIntoDay(alt) === reading && new Date(alt * 1000).getTimezoneOffset() === offset) {
      return alt;
    }
  }
  return instant;
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

/** 0 for Sunday through 6 for Saturday, as `Date.getDay` counts. */
export function dayOfWeek(date: CalendarDate): number {
  // Epoch day 0, 1970-01-01, was a Thursday.
  return (((date + 4) % 7) + 7) % 7;
}

/** The first day of the week holding `date`, for a week starting on `firstDayOfWeek` (0 is Sunday). */
export function weekStartOf(date: CalendarDate, firstDayOfWeek: number): CalendarDate {
  return addCalendarDays(date, -((dayOfWeek(date) - firstDayOfWeek + 7) % 7));
}

export function monthStartOf(date: CalendarDate): CalendarDate {
  const d = new Date(date * MS_PER_DAY);
  return calendarDateFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * The month a title over rows of weeks names: the one holding the middle day. Six rows aligned on a
 * month's first week always put the middle day between its 16th and 22nd.
 */
export function monthShownFrom(topWeek: CalendarDate, visibleWeeks: number): CalendarDate {
  return monthStartOf(addCalendarDays(topWeek, Math.floor((visibleWeeks * 7) / 2)));
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
