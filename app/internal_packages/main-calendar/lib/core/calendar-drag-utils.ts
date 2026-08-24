import moment from 'moment';
import {
  CalendarContainerType,
  DragConfig,
  DragState,
  HitZone,
  ViewDirection,
} from './calendar-drag-types';
import {
  EventOccurrence,
  coveredDates,
  occurrenceStartUnix,
  occurrenceEndUnix,
} from './calendar-data-source';
import { CalendarDateUtils } from 'mailspring-exports';
import { inclusiveAllDayEnd } from './calendar-helpers';
import { DEFAULT_TIMED_EVENT_DURATION_SECONDS } from './calendar-constants';

/**
 * Snap a timestamp to the nearest interval
 * @param timestamp Unix timestamp to snap
 * @param intervalSeconds Interval size in seconds
 * @returns Snapped timestamp
 */
export function snapToInterval(timestamp: number, intervalSeconds: number): number {
  return Math.round(timestamp / intervalSeconds) * intervalSeconds;
}

/**
 * The unix midnight of the all-day column a horizontal hit-test lands on, given the scope's
 * bounds and the fraction across it. Date-space on purpose: the column count is derived as a
 * day difference (so it matches the rendered columns exactly) and the result is a real calendar
 * day's start, so neither the bucket count nor the resolved day drifts across a DST transition —
 * unlike `ceil((end - start) / 86400)` buckets and a `start + index * 86400` offset.
 */
export function allDayColumnStartUnix(
  scopeStartUnix: number,
  scopeEndUnix: number,
  fraction: number
): number {
  const startDate = CalendarDateUtils.calendarDateFromUnix(scopeStartUnix);
  const numDays =
    CalendarDateUtils.calendarDaysBetween(
      startDate,
      CalendarDateUtils.calendarDateFromUnix(scopeEndUnix)
    ) + 1;
  const clamped = Math.max(0, Math.min(1, fraction));
  const dayIndex = Math.min(Math.floor(clamped * numDays), numDays - 1);
  return CalendarDateUtils.dayStartUnix(CalendarDateUtils.addCalendarDays(startDate, dayIndex));
}

/**
 * Snap all-day event times to day boundaries.
 * The end is exclusive (midnight after the last day covered), matching RFC 5545 DTEND
 * and the events the sync engine produces.
 * @param start Start timestamp
 * @param end End timestamp
 * @returns Snapped start and end times
 */
export function snapAllDayTimes(start: number, end: number): { start: number; end: number } {
  const snappedStart = moment.unix(start).startOf('day').unix();
  return { start: snappedStart, end: exclusiveDayEnd(end, snappedStart) };
}

/**
 * Midnight after the last day a range covers, floored so a degenerate end still yields
 * one whole day. Uses calendar-day arithmetic rather than adding 24 hours, which drifts
 * in zones whose DST transition falls at midnight.
 * @param end End timestamp
 * @param floor Earliest day that may be treated as covered
 * @returns Exclusive end, as a unix timestamp
 */
function exclusiveDayEnd(end: number, floor: number): number {
  return CalendarDateUtils.nextDayStartUnix(
    CalendarDateUtils.calendarDateFromUnix(Math.max(inclusiveAllDayEnd(end), floor))
  );
}

/**
 * Create a synthetic EventOccurrence from drag state for preview rendering.
 * This allows the drag preview to be rendered using the same event rendering
 * pipeline as regular events, including automatic multi-day spanning.
 * @param dragState The current drag state
 * @returns A synthetic EventOccurrence representing the drag preview
 */
export function createDragPreviewEvent(dragState: DragState): EventOccurrence {
  const { event, previewStart, previewEnd } = dragState;
  // coveredDates replaces the spread's pre-drag dates. Timed previews also carry the preview
  // instants; all-day previews carry only the shifted dates.
  const shared = {
    ...event,
    ...coveredDates(previewStart, previewEnd, dragState.previewIsAllDay),
    id: `${event.id}-drag-preview`,
    isDragPreview: true,
    originalEventId: event.id,
  };
  return dragState.previewIsAllDay
    ? { ...shared, isAllDay: true }
    : { ...shared, isAllDay: false, start: previewStart, end: previewEnd };
}

/**
 * Get events array with drag preview injected (if currently dragging).
 * Filters out the original event being dragged and adds the synthetic preview.
 * @param events The original events array
 * @param dragState Current drag state (or null if not dragging)
 * @returns Events array with drag preview if dragging, otherwise original array
 */
export function getEventsWithDragPreview(
  events: EventOccurrence[],
  dragState: DragState | null
): EventOccurrence[] {
  if (!dragState?.isDragging) {
    return events;
  }
  // Filter out the original event being dragged and add synthetic preview
  const filtered = events.filter((e) => e.id !== dragState.event.id);
  return [...filtered, createDragPreviewEvent(dragState)];
}

/**
 * Parse an event occurrence ID to extract the underlying event ID
 * The occurrence ID format is `${eventId}-e${idx}`
 * @param occurrenceId The occurrence ID
 * @returns The extracted event ID (or the original ID if not an occurrence format)
 */
export function parseEventIdFromOccurrence(occurrenceId: string): string {
  const match = occurrenceId.match(/^(.+)-e\d+$/);
  if (match) {
    return match[1];
  }
  // If the pattern doesn't match, return the original ID
  // (it might be a non-occurrence event ID that can be edited directly)
  return occurrenceId;
}

/**
 * Detect which hit zone the mouse is in within an event element
 * @param mouseX Mouse X position (clientX)
 * @param mouseY Mouse Y position (clientY)
 * @param bounds Element bounding rect
 * @param edgeZoneSize Size of the edge detection zone in pixels
 * @param direction View direction (vertical or horizontal)
 * @returns Hit zone with drag mode and cursor
 */
export function detectHitZone(
  mouseX: number,
  mouseY: number,
  bounds: DOMRect,
  edgeZoneSize: number,
  direction: ViewDirection
): HitZone {
  if (direction === 'vertical') {
    // Week view: top edge = resize-start, bottom edge = resize-end
    if (mouseY - bounds.top < edgeZoneSize) {
      return { mode: 'resize-start', cursor: 'ns-resize' };
    }
    if (bounds.bottom - mouseY < edgeZoneSize) {
      return { mode: 'resize-end', cursor: 'ns-resize' };
    }
  } else {
    // Month view: left edge = resize-start, right edge = resize-end
    if (mouseX - bounds.left < edgeZoneSize) {
      return { mode: 'resize-start', cursor: 'ew-resize' };
    }
    if (bounds.right - mouseX < edgeZoneSize) {
      return { mode: 'resize-end', cursor: 'ew-resize' };
    }
  }

  return { mode: 'move', cursor: 'grab' };
}

/**
 * Check if a drag has exceeded the threshold to start
 * @param initialX Initial mouse X
 * @param initialY Initial mouse Y
 * @param currentX Current mouse X
 * @param currentY Current mouse Y
 * @param threshold Pixel threshold
 * @returns True if threshold exceeded
 */
export function isDragThresholdExceeded(
  initialX: number,
  initialY: number,
  currentX: number,
  currentY: number,
  threshold: number
): boolean {
  const dx = currentX - initialX;
  const dy = currentY - initialY;
  return Math.sqrt(dx * dx + dy * dy) >= threshold;
}

/**
 * Create initial drag state from mouse down event
 * @param event The event occurrence being dragged
 * @param hitZone The detected hit zone
 * @param mouseTime Unix timestamp at mouse position
 * @param mouseX Mouse X position
 * @param mouseY Mouse Y position
 * @param config Drag configuration
 * @returns Initial drag state
 */
export function createDragState(
  event: EventOccurrence,
  hitZone: HitZone,
  mouseTime: number,
  mouseX: number,
  mouseY: number,
  config: DragConfig
): DragState {
  // The drag pipeline is unix; derive the event's instants once (all-day carries dates only).
  const start = occurrenceStartUnix(event);
  const end = occurrenceEndUnix(event);

  // Calculate click offset for 'move' mode - this is the time difference between
  // where the user clicked and the event's start time. We'll preserve this offset
  // so the event doesn't jump when dragging starts.
  let clickOffset = 0;
  if (hitZone.mode === 'move') {
    clickOffset = mouseTime - start;
  } else if (hitZone.mode === 'resize-end') {
    // For resize-end, offset is from the end of the event
    clickOffset = mouseTime - end;
  }
  // For resize-start, no offset needed (we resize from start time)

  return {
    mode: hitZone.mode,
    event,
    originalStart: start,
    originalEnd: end,
    initialMouseTime: mouseTime,
    clickOffset,
    initialMouseX: mouseX,
    initialMouseY: mouseY,
    previewStart: start,
    previewEnd: end,
    previewIsAllDay: event.isAllDay,
    snapIntervalSeconds: config.snapInterval,
    isDragging: false,
  };
}

/**
 * Update drag state based on mouse movement
 * @param state Current drag state
 * @param mouseTime Current mouse time
 * @param mouseX Current mouse X
 * @param mouseY Current mouse Y
 * @param containerType The container type the mouse is currently over
 * @param config Drag configuration
 * @returns Updated drag state (or same state if no change)
 */
export function updateDragState(
  state: DragState,
  mouseTime: number,
  mouseX: number,
  mouseY: number,
  containerType: CalendarContainerType | null,
  config: DragConfig
): DragState {
  // Check if we've exceeded the drag threshold
  let isDragging = state.isDragging;
  if (!isDragging) {
    isDragging = isDragThresholdExceeded(
      state.initialMouseX,
      state.initialMouseY,
      mouseX,
      mouseY,
      config.dragThreshold
    );
    if (!isDragging) {
      return state; // Haven't started dragging yet
    }
  }

  // Calculate new times based on mode and click offset
  let previewStart: number;
  let previewEnd: number;
  const eventDuration = state.originalEnd - state.originalStart;

  // Snap resolution depends on container type:
  // - day-column (week view timed): 15-minute intervals
  // - all-day-area, month-cell: full day intervals
  const usesDaySnap = containerType !== 'day-column';
  const snapInterval = usesDaySnap ? 86400 : config.snapInterval; // 86400 = 1 day in seconds
  const minDuration = usesDaySnap ? 86400 : config.minDuration;
  // A move converts between kinds when the drop container disagrees with the event: the all-day
  // row makes a timed event all-day, the timed grid (day-column) makes an all-day event timed. A
  // month cell preserves the event's kind. Recurring events are NOT converted yet:
  // createRecurrenceException threads one isAllDay through both the exception times and the
  // RECURRENCE-ID, so a convert would misformat the RID and orphan the exception — a recurring
  // event dropped across kinds keeps its own kind (moves to that day) instead.
  const canConvert = state.mode === 'move' && !state.event.isRecurring;
  const previewIsAllDay =
    containerType === 'all-day-area'
      ? state.event.isAllDay || canConvert
      : containerType === 'day-column'
        ? state.event.isAllDay && !canConvert
        : state.event.isAllDay;

  switch (state.mode) {
    case 'move': {
      if (previewIsAllDay) {
        // Target is all-day. An all-day event keeps its whole-day span; a converting timed
        // event becomes a single day. Snap the start, then span that many whole days.
        const numDays = state.event.isAllDay ? Math.max(1, Math.round(eventDuration / 86400)) : 1;
        previewStart = moment.unix(mouseTime).startOf('day').unix();
        // Via the helpers, not a raw add: where the drop day's midnight doesn't exist, add()
        // keeps the 01:00 wall clock and snapAllDayTimes then rounds it up an extra day.
        previewEnd = CalendarDateUtils.nextDayStartUnix(
          CalendarDateUtils.addCalendarDays(
            CalendarDateUtils.calendarDateFromUnix(previewStart),
            numDays - 1
          )
        );
      } else if (state.event.isAllDay) {
        // Converting an all-day event into the timed grid (reached only in day-column, the one
        // place previewIsAllDay flips false for an all-day event). It has no clock time to keep,
        // so drop its start at the snapped cursor time and give it the default new-event length.
        previewStart = snapToInterval(mouseTime, snapInterval);
        previewEnd = previewStart + DEFAULT_TIMED_EVENT_DURATION_SECONDS;
      } else if (usesDaySnap) {
        // Timed event on a day-granular surface — a month cell, or a recurring event on the
        // all-day row (not converted). Shift by whole calendar days and keep the clock time;
        // moment add() holds 10am at 10am across a DST change.
        const daysDelta = CalendarDateUtils.calendarDaysBetween(
          CalendarDateUtils.calendarDateFromUnix(state.originalStart),
          CalendarDateUtils.calendarDateFromUnix(mouseTime)
        );
        previewStart = moment.unix(state.originalStart).add(daysDelta, 'days').unix();
        previewEnd = previewStart + eventDuration;
      } else {
        previewStart = snapToInterval(mouseTime - state.clickOffset, snapInterval);
        previewEnd = previewStart + eventDuration;
      }
      break;
    }
    case 'resize-start': {
      if (usesDaySnap) {
        // Clamp to the last day covered rather than subtracting seconds: one calendar day
        // is 82800s on a spring-forward day, so a seconds floor lands off midnight.
        const lastDay = inclusiveAllDayEnd(state.originalEnd);
        previewStart = moment.unix(Math.min(mouseTime, lastDay)).startOf('day').unix();
        previewEnd = exclusiveDayEnd(state.originalEnd, previewStart);
      } else {
        const newStart = Math.min(mouseTime, state.originalEnd - minDuration);
        previewStart = snapToInterval(newStart, snapInterval);
        previewEnd = state.originalEnd;
        // Ensure minimum duration after snapping
        if (previewEnd - previewStart < minDuration) {
          previewStart = previewEnd - minDuration;
        }
      }
      break;
    }
    case 'resize-end': {
      if (usesDaySnap) {
        // mouseTime is the day under the cursor, not an end, so it must not go through
        // inclusiveAllDayEnd — containers hand over an exact midnight and the -1s there
        // would drop the cursor's own day. Include that day, then take the next midnight.
        previewStart = moment.unix(state.originalStart).startOf('day').unix();
        const lastDay = Math.max(moment.unix(mouseTime).startOf('day').unix(), previewStart);
        previewEnd = CalendarDateUtils.nextDayStartUnix(
          CalendarDateUtils.calendarDateFromUnix(lastDay)
        );
      } else {
        const newEnd = Math.max(mouseTime - state.clickOffset, state.originalStart + minDuration);
        previewStart = state.originalStart;
        previewEnd = snapToInterval(newEnd, snapInterval);
        // Ensure minimum duration after snapping
        if (previewEnd - previewStart < minDuration) {
          previewEnd = previewStart + minDuration;
        }
      }
      break;
    }
  }

  // Only create new state if values changed
  if (
    isDragging === state.isDragging &&
    previewStart === state.previewStart &&
    previewEnd === state.previewEnd &&
    previewIsAllDay === state.previewIsAllDay
  ) {
    return state;
  }

  return {
    ...state,
    isDragging,
    previewStart,
    previewEnd,
    previewIsAllDay,
  };
}

/**
 * Check if an event's time can be changed by drag, resize, or keyboard
 * @param event The event occurrence
 * @param isCalendarReadOnly Whether the calendar containing this event is read-only
 * @returns True if the event can be moved
 */
export function canMoveEvent(event: EventOccurrence, isCalendarReadOnly = false): boolean {
  // Don't allow moving events in read-only calendars
  if (isCalendarReadOnly) {
    return false;
  }

  // Don't allow moving cancelled events
  if (event.isCancelled) {
    return false;
  }

  return true;
}

/**
 * Format a time preview string for display during drag
 * @param start Start timestamp
 * @param end End timestamp
 * @param isAllDay Whether this is an all-day event
 * @returns Formatted time string
 */
export function formatDragPreviewTime(start: number, end: number, isAllDay: boolean): string {
  if (isAllDay) {
    const startDate = moment.unix(start).format('MMM D');
    const endDate = moment.unix(end - 1).format('MMM D');
    if (startDate === endDate) {
      return startDate;
    }
    return `${startDate} - ${endDate}`;
  }

  const startTime = moment.unix(start).format('h:mm A');
  const endTime = moment.unix(end).format('h:mm A');
  return `${startTime} - ${endTime}`;
}
