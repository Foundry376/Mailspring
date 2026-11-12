/** Shortest event the UI will produce, by drag, keyboard resize, or the popover's end picker. */
export const MIN_EVENT_DURATION_SECONDS = 900;

/** Default length of a new timed event, used for double-click creation and all-day→timed drags. */
export const DEFAULT_TIMED_EVENT_DURATION_SECONDS = 3600;

/** Between neighbouring event chips and bars, in every view. */
export const EVENT_GAP = 3;

/** An all-day or Month bar, without the gap above it. */
export const BAR_HEIGHT = 20;

export enum CalendarView {
  DAY = 'Day',
  WEEK = 'Week',
  MONTH = 'Month',
}
