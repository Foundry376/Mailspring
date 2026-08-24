/** Shortest event the UI will produce, by drag, keyboard resize, or the popover's end picker. */
export const MIN_EVENT_DURATION_SECONDS = 900;

/** Default length of a new timed event, used for double-click creation and all-day→timed drags. */
export const DEFAULT_TIMED_EVENT_DURATION_SECONDS = 3600;

export enum CalendarView {
  DAY = 'Day',
  WEEK = 'Week',
  MONTH = 'Month',
  AGENDA = 'Agenda',
}
