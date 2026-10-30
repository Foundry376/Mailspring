import moment, { Moment } from 'moment';
import {
  CalendarDate,
  Utils,
  AccountStore,
  Calendar,
  Actions,
  DateUtils,
  Event,
  ICSEventHelpers,
  SyncbackEventTask,
  TaskQueue,
  localized,
  CalendarDateUtils,
} from 'mailspring-exports';
import { ShowAsOption, defaultShowAs } from './show-as-selector';
import {
  MIN_EVENT_DURATION_SECONDS,
  DEFAULT_TIMED_EVENT_DURATION_SECONDS,
} from './calendar-constants';
import { EventOccurrence, coveredDates, isTimed } from './calendar-data-source';
import { dayFraction } from './week-view-helpers';
import { canRespondToEvent } from './calendar-rsvp';

export function dateOf(m: Moment): CalendarDate {
  return CalendarDateUtils.calendarDateFromUnix(m.unix());
}

export function momentOf(date: CalendarDate): Moment {
  return moment.unix(CalendarDateUtils.dayStartUnix(date));
}

// Cache of calendar colors synced from CalDAV servers
const calendarColorCache: Map<string, string> = new Map();

// Cached theme text color - call invalidateThemeTextColorCache() on theme change
let _themeTextColor: { r: number; g: number; b: number } | null | undefined = undefined;

export function invalidateThemeTextColorCache() {
  _themeTextColor = undefined;
}

function getThemeTextColor(): { r: number; g: number; b: number } | null {
  if (_themeTextColor === undefined) {
    const container = document.querySelector('.mailspring-calendar');
    const color = container ? getComputedStyle(container).color : '';
    _themeTextColor = (color ? parseColor(color) : null) ?? null;
  }
  return _themeTextColor;
}

// Version counter that increments when colors are updated - used to trigger re-renders
let colorCacheVersion = 0;

/**
 * Get the current color cache version. Used by components to detect when colors change.
 */
export function getColorCacheVersion(): number {
  return colorCacheVersion;
}

/**
 * Update the calendar color cache with colors from synced Calendar models.
 * Called when calendars are loaded/updated from the database.
 */
export function setCalendarColors(calendars: Calendar[]) {
  let hasChanges = false;
  for (const calendar of calendars) {
    if (calendar.color) {
      if (calendarColorCache.get(calendar.id) !== calendar.color) {
        calendarColorCache.set(calendar.id, calendar.color);
        hasChanges = true;
      }
    } else if (calendarColorCache.has(calendar.id)) {
      calendarColorCache.delete(calendar.id);
      hasChanges = true;
    }
  }
  if (hasChanges) {
    colorCacheVersion++;
  }
}

/**
 * Parse a CSS color string and return RGB components.
 * Supports hex (#RGB, #RRGGBB), rgb(), rgba(), hsl(), hsla() formats.
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  // Try hex format
  const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    } else if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    } else if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  // Try rgb/rgba format
  const rgbMatch = color.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i
  );
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // Try hsl/hsla format
  const hslMatch = color.match(
    /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)/i
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;

    // Convert HSL to RGB
    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a };
  }

  return null;
}

/**
 * Get the display color for a calendar. Priority:
 * 1. User-configured color (stored in app config)
 * 2. Synced color from CalDAV server (stored on Calendar model)
 * 3. Generated color based on calendar ID hash
 */
export function calcColor(calendarId: string) {
  // First check user-configured color (highest priority - user override)
  const userColor = AppEnv.config.get(`calendar.colors.${calendarId}`);
  if (userColor) {
    return userColor;
  }

  // Check synced color from CalDAV server
  const syncedColor = calendarColorCache.get(calendarId);
  if (syncedColor) {
    return syncedColor;
  }

  // Fall back to generated color based on calendar ID
  const hue = Utils.hueForString(calendarId);
  return `hsl(${hue}, 80%, 45%)`;
}

/**
 * Get event styling colors for Apple Calendar-style appearance.
 * Returns colors for the background (light), left band (solid), and text.
 */
export function calcEventColors(calendarId: string): {
  background: string;
  band: string;
  text: string;
  selectedText: string;
} {
  const baseColor = calcColor(calendarId);
  const parsed = parseColor(baseColor);

  if (!parsed) {
    // Fallback if color parsing fails
    return {
      background: baseColor,
      band: baseColor,
      text: 'inherit',
      selectedText: 'white',
    };
  }

  const { r, g, b } = parsed;
  const selectedText = textColorOnFill(parsed);

  const textParsed = getThemeTextColor();
  const mix = 0.4; // 40% calendar color, 60% theme text color
  const tr = textParsed ? Math.round(r * mix + textParsed.r * (1 - mix)) : Math.round(r * 0.7);
  const tg = textParsed ? Math.round(g * mix + textParsed.g * (1 - mix)) : Math.round(g * 0.7);
  const tb = textParsed ? Math.round(b * mix + textParsed.b * (1 - mix)) : Math.round(b * 0.7);

  return {
    // Light pastel background (15% opacity)
    background: `rgba(${r}, ${g}, ${b}, 0.15)`,
    // Solid color for left band
    band: `rgb(${r}, ${g}, ${b})`,
    // Calendar color mixed with theme text color for readability
    text: `rgb(${tr}, ${tg}, ${tb})`,
    // Selection fills with the band color, so its text must read against that
    selectedText,
  };
}

/** Black or white, whichever contrasts more with the fill (WCAG 2 relative luminance). */
export function textColorOnFill({ r, g, b }: { r: number; g: number; b: number }): string {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithBlack > contrastWithWhite ? 'black' : 'white';
}

/**
 * All-day events store an exclusive end — midnight after the last day covered — so a
 * date picker showing it raw reads a day later than the event actually runs.
 * @returns The last day the event covers, at local midnight
 */
export function inclusiveAllDayEnd(end: number): number {
  return moment
    .unix(end - 1)
    .startOf('day')
    .unix();
}

/**
 * The end an event should take when its start moves, preserving the duration.
 * All-day events shift in whole days: a seconds delta across a DST transition would
 * land the end off midnight and gain or lose a day once serialized.
 * @returns The new end, as a unix timestamp
 */
export function shiftEndWithStart(
  startUnix: number,
  endUnix: number,
  newStartUnix: number,
  isAllDay: boolean
): number {
  if (!isAllDay) {
    return endUnix + (newStartUnix - startUnix);
  }
  const days = CalendarDateUtils.calendarDaysBetween(
    CalendarDateUtils.calendarDateFromUnix(startUnix),
    CalendarDateUtils.calendarDateFromUnix(newStartUnix)
  );
  return CalendarDateUtils.nextDayStartUnix(
    CalendarDateUtils.addCalendarDays(
      CalendarDateUtils.calendarDateFromUnix(inclusiveAllDayEnd(endUnix)),
      days
    )
  );
}

/**
 * Clamp a proposed end so it can never precede the start — one whole day for an all-day
 * event, MIN_EVENT_DURATION_SECONDS for a timed one.
 * @returns The clamped end, as a unix timestamp
 */
export function clampEnd(startUnix: number, endUnix: number, isAllDay: boolean): number {
  const floor = isAllDay
    ? CalendarDateUtils.nextDayStartUnix(CalendarDateUtils.calendarDateFromUnix(startUnix))
    : startUnix + MIN_EVENT_DURATION_SECONDS;
  return Math.max(endUnix, floor);
}

/** The fields of a new event that the grid draws, as its editor would save them. */
export interface NewEventDraft {
  title: string;
  start: number;
  end: number;
  isAllDay: boolean;
  calendarId: string;
  accountId: string;
}

/** An event that does not exist yet, as an occurrence, so the grid draws it like any other. */
export function newEventOccurrence(id: string, draft: NewEventDraft): EventOccurrence {
  const { title, start, end, isAllDay, calendarId, accountId } = draft;
  const shared = {
    id,
    accountId,
    calendarId,
    title,
    description: '',
    location: '',
    isRecurring: false,
    isCancelled: false,
    isPending: false,
    isMine: true,
    isException: false,
    organizer: null,
    attendees: [],
  };
  if (isAllDay) {
    // The all-day toggle leaves the end at its wall-clock time; the save (createAllDayEndTime)
    // covers through that instant's day, so step inside the end before reading its date.
    const startDate = CalendarDateUtils.calendarDateFromUnix(start);
    const endDate = CalendarDateUtils.calendarDateFromUnix(end - 1);
    return { ...shared, isAllDay: true, startDate, endDate };
  }
  return { ...shared, isAllDay: false, start, end, ...coveredDates(start, end, false) };
}

/**
 * A time as compact as the locale allows: a 12-hour clock drops the space before a trailing
 * meridiem, and ":00" on the hour ("10AM"); a 24-hour clock keeps the minutes ("10:00"), where a
 * bare "10" would not read as a time.
 */
export function formatShortTime(unix: number): string {
  const time = moment.unix(unix);
  return time.format(shortTimeFormat(time));
}

function shortTimeFormat(time: moment.Moment): string {
  const lt = DateUtils.localeTimeFormat();
  // moment's LT uses h for a 12-hour clock and H for a 24-hour one, as in time-picker.tsx
  if (!/h/.test(lt)) {
    return lt;
  }
  const tight = lt.replace(/\s+([aA])$/, '$1');
  return time.minutes() === 0 ? tight.replace(/[:.]mm/, '') : tight;
}

/**
 * A range in formatShortTime's terms, naming the meridiem once when both ends share it, as Notion
 * Calendar does: "7:30–8:30PM", "11:30AM–12PM".
 */
export function formatShortTimeRange(startUnix: number, endUnix: number): string {
  return shortTimeRange(startUnix, endUnix, '–');
}

function shortTimeRange(startUnix: number, endUnix: number, separator: string): string {
  const start = moment.unix(startUnix);
  const end = moment.unix(endUnix);
  let startFormat = shortTimeFormat(start);
  // Only a meridiem standing alone at either end; lb's "[Auer]" literal and ne's "Aको" stay whole.
  const separateMeridiem = /^[aA]\s+|\s*[aA]$/;
  if (/h/.test(startFormat) && start.format('A') === end.format('A')) {
    startFormat = startFormat.replace(separateMeridiem, '');
  }
  return `${start.format(startFormat)}${separator}${end.format(shortTimeFormat(end))}`;
}

/**
 * The locale's time ("3:15 PM", "15:15"), on a 24-hour clock when the user asked for one. With
 * `dropZeroMinutes` a 12-hour clock shows an hour on the hour as "3 PM"; a 24-hour clock keeps
 * "15:00", where a bare "15" would not read as a time.
 */
export function formatTime(unix: number, dropZeroMinutes = false): string {
  const time = moment.unix(unix);
  const lt = DateUtils.localeTimeFormat();
  if (dropZeroMinutes && /h/.test(lt) && time.minutes() === 0) {
    return time.format(lt.replace(/[:.]mm/, ''));
  }
  return time.format(lt);
}

/** The line under a search result: the day, or days, and for a timed occurrence its times. */
export function formatOccurrenceTime(event: EventOccurrence): string {
  if (event.isAllDay === true) {
    const first = moment.unix(CalendarDateUtils.dayStartUnix(event.startDate));
    if (event.startDate === event.endDate) {
      return first.format('ddd, MMM D, YYYY');
    }
    const last = moment.unix(CalendarDateUtils.dayStartUnix(event.endDate));
    return `${first.format('MMM D')} - ${last.format('MMM D, YYYY')}`;
  }
  const start = moment.unix(event.start);
  const end = moment.unix(event.end);
  if (start.isSame(end, 'day')) {
    return `${start.format('ddd, MMM D')} \u00B7 ${formatTime(event.start)} - ${formatTime(event.end)}`;
  }
  return `${start.format('MMM D')}, ${formatTime(event.start)} - ${end.format('MMM D')}, ${formatTime(event.end)}`;
}

/**
 * Format an event's time range for display (e.g., "12 – 1PM").
 * Only returns a string for events that are 1 hour or longer.
 * Returns null for shorter events or all-day events.
 */
export function formatEventTimeRange(
  startUnix: number,
  endUnix: number,
  isAllDay: boolean
): string | null {
  if (isAllDay) {
    return null;
  }
  if ((endUnix - startUnix) / 60 < 60) {
    return null;
  }
  return shortTimeRange(startUnix, endUnix, ' – ');
}

/**
 * Filter calendars to only those that are writable and not disabled by the user.
 */
export function getEditableCalendars(
  calendars: Calendar[],
  disabledCalendars: string[]
): Calendar[] {
  return calendars.filter((c) => !c.readOnly && !disabledCalendars.includes(c.id));
}

/**
 * Show an error dialog when no editable calendars are available.
 */
export function showNoEditableCalendarsError(): void {
  AppEnv.showErrorDialog(
    localized(
      "This account has no editable calendars. We can't create an event for you. Please make sure you have an editable calendar with your account provider."
    )
  );
}

/**
 * Show an error dialog when the user tries to change events on a read-only calendar.
 */
export function showReadOnlyCalendarError(): void {
  AppEnv.showErrorDialog(
    localized("This calendar is read-only, so its events can't be changed or deleted.")
  );
}

/**
 * Options for creating a new calendar event.
 */
export interface CreateCalendarEventOptions {
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  calendarId: string;
  accountId: string;
  description?: string;
  location?: string;
  attendees?: Array<{ email: string; name?: string }>;
  recurrenceRule?: string;
  timezone?: string;
  transparency?: ShowAsOption;
}

/** The account, as the ORGANIZER the ICS helpers name once an event has guests. */
export function organizerForAccount(
  accountId: string
): { email: string; name?: string } | undefined {
  const account = AccountStore.accountForId(accountId);
  return account ? { email: account.emailAddress, name: account.name } : undefined;
}

/**
 * Create a new calendar event, queue the syncback task, and focus the event.
 * Shared by CalendarEventPopover and QuickEventPopover.
 */
export async function createCalendarEvent(options: CreateCalendarEventOptions): Promise<void> {
  const icsuid = ICSEventHelpers.generateUID();
  const ics = ICSEventHelpers.createICSString({
    uid: icsuid,
    summary: options.summary,
    start: options.start,
    end: options.end,
    isAllDay: options.isAllDay,
    timezone: options.timezone || DateUtils.timeZone,
    description: options.description,
    location: options.location,
    organizer: organizerForAccount(options.accountId),
    attendees: options.attendees,
    recurrenceRule: options.recurrenceRule,
    transparency: options.transparency ?? defaultShowAs(options.isAllDay),
  });

  const event = new Event({
    calendarId: options.calendarId,
    accountId: options.accountId,
    ics,
    icsuid,
    recurrenceStart: Math.floor(options.start.getTime() / 1000),
    recurrenceEnd: Math.floor(options.end.getTime() / 1000),
  });
  event.title = options.summary;

  const task = SyncbackEventTask.forCreating({
    event,
    calendarId: options.calendarId,
    accountId: options.accountId,
  });
  Actions.queueTask(task);

  try {
    await TaskQueue.waitForPerformRemote(task);
    Actions.focusCalendarEvent({ id: event.id, start: event.recurrenceStart });
  } catch (error) {
    console.error('Failed to sync new event to server:', error);
  }
}

/**
 * Scroll a day/week hour grid so a selected timed event's time is centered in the viewport;
 * with no timed selection, fall back to the midday default.
 */
export function centerGridScroll(viewportEl: HTMLElement, selectedEvent?: EventOccurrence): void {
  const fraction = selectedEvent && isTimed(selectedEvent) ? dayFraction(selectedEvent.start) : 0.5;
  viewportEl.scrollTop = viewportEl.scrollHeight * fraction - viewportEl.clientHeight / 2;
}

// A description is markup from whoever sent the invitation. DOMParser's document is inert, so the
// images it references are never fetched.
export function extractNotesFromDescription(description: string) {
  const doc = new DOMParser().parseFromString(description, 'text/html');
  const descriptionRoot = doc.body;

  // The parsed document has no layout, so block boundaries become newlines here; Google writes
  // each line of a description as <br>-separated HTML.
  descriptionRoot.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  descriptionRoot
    .querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote')
    .forEach((block) => block.append('\n'));

  // The parser moves <meta> tags that lead the description into <head>.
  const els = doc.querySelectorAll('meta[itemprop=description]');
  let notes: string = null;
  if (els.length) {
    notes = Array.from(els)
      .map((el) => (el as HTMLMetaElement).content)
      .join('\n');
  } else {
    notes = descriptionRoot.textContent;
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextNotes = notes.replace('\n\n', '\n');
    if (nextNotes === notes) {
      break;
    }
    notes = nextNotes;
  }
  return notes;
}

/** Anyone on the guest list besides the organizer, whom a change would email. */
export function hasGuests(event: EventOccurrence): boolean {
  return event.attendees.some(
    (a) => !event.organizer || !Utils.emailIsEquivalent(a.email, event.organizer.email)
  );
}

export type PanelField = 'title' | 'times' | 'allDay' | 'repeat' | 'location' | 'notes' | 'showAs';

const PANEL_FIELDS: PanelField[] = [
  'title',
  'times',
  'allDay',
  'repeat',
  'location',
  'notes',
  'showAs',
];

/**
 * What the event panel lets you change: all of an event you organize, the time of an invitation
 * as a proposal to its organizer, nothing on a read-only calendar.
 */
export function editableFields(event: EventOccurrence, isCalendarReadOnly: boolean) {
  if (isCalendarReadOnly) return new Set<PanelField>();
  if (event.isMine) return new Set(PANEL_FIELDS);
  return new Set<PanelField>(canRespondToEvent(event) && !event.isCancelled ? ['times'] : []);
}

export function asksScope(event: EventOccurrence): boolean {
  return event.isRecurring && !event.isException;
}

/** Edits wait in the panel's card when guests are emailed on every save, for a scope, or as a proposal. */
export function holdsEdits(event: EventOccurrence, isCalendarReadOnly: boolean): boolean {
  if (!event.isMine) return editableFields(event, isCalendarReadOnly).has('times');
  return !isCalendarReadOnly && (hasGuests(event) || asksScope(event));
}

/** The times an event takes when All day is switched: whole days covering it, or 9–10 AM on its first day. */
export function allDayToggleTimes(
  { startDate, endDate }: Pick<EventOccurrence, 'startDate' | 'endDate'>,
  allDay: boolean
) {
  if (allDay) {
    return {
      start: CalendarDateUtils.dayStartUnix(startDate),
      end: CalendarDateUtils.nextDayStartUnix(endDate),
    };
  }
  const start = CalendarDateUtils.secondsIntoDayUnix(startDate, 9 * 3600);
  return { start, end: start + DEFAULT_TIMED_EVENT_DURATION_SECONDS };
}
