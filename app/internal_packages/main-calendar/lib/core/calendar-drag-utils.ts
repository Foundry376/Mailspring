import moment from 'moment';
import { DragMode, DragState, DragConfig, HitZone, ViewDirection } from './calendar-drag-types';
import { EventOccurrence } from './calendar-data-source';

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
 * Snap all-day event times to day boundaries
 * Start should be at the beginning of a day, end should be at end of day
 * @param start Start timestamp
 * @param end End timestamp
 * @returns Snapped start and end times
 */
export function snapAllDayTimes(start: number, end: number): { start: number; end: number } {
  // Start at beginning of day
  const snappedStart = moment.unix(start).startOf('day').unix();

  // End at end of day (23:59:59)
  const snappedEnd = moment.unix(end).endOf('day').unix();

  return { start: snappedStart, end: snappedEnd };
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
 * Calculate new event times based on drag mode and time delta
 * @param mode The drag operation type
 * @param originalStart Original event start time
 * @param originalEnd Original event end time
 * @param timeDelta Time difference from drag start position
 * @param minDuration Minimum allowed event duration
 * @returns New start and end times
 */
export function calculateDragTimes(
  mode: DragMode,
  originalStart: number,
  originalEnd: number,
  timeDelta: number,
  minDuration: number
): { start: number; end: number } {
  switch (mode) {
    case 'move':
      return {
        start: originalStart + timeDelta,
        end: originalEnd + timeDelta,
      };
    case 'resize-start': {
      // Don't allow start to go past end - minDuration
      const newStart = Math.min(originalStart + timeDelta, originalEnd - minDuration);
      return {
        start: newStart,
        end: originalEnd,
      };
    }
    case 'resize-end': {
      // Don't allow end to go before start + minDuration
      const newEnd = Math.max(originalEnd + timeDelta, originalStart + minDuration);
      return {
        start: originalStart,
        end: newEnd,
      };
    }
  }
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
  // Calculate click offset for 'move' mode - this is the time difference between
  // where the user clicked and the event's start time. We'll preserve this offset
  // so the event doesn't jump when dragging starts.
  let clickOffset = 0;
  if (hitZone.mode === 'move') {
    clickOffset = mouseTime - event.start;
  } else if (hitZone.mode === 'resize-end') {
    // For resize-end, offset is from the end of the event
    clickOffset = mouseTime - event.end;
  }
  // For resize-start, no offset needed (we resize from start time)

  return {
    mode: hitZone.mode,
    event,
    originalStart: event.start,
    originalEnd: event.end,
    initialMouseTime: mouseTime,
    clickOffset,
    initialMouseX: mouseX,
    initialMouseY: mouseY,
    previewStart: event.start,
    previewEnd: event.end,
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
 * @param config Drag configuration
 * @returns Updated drag state (or same state if no change)
 */
export function updateDragState(
  state: DragState,
  mouseTime: number,
  mouseX: number,
  mouseY: number,
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

  // All-day events should snap to day boundaries regardless of config
  const isAllDay = state.event.isAllDay;
  const snapInterval = isAllDay ? 86400 : config.snapInterval; // 86400 = 1 day in seconds
  const minDuration = isAllDay ? 86400 : config.minDuration;

  switch (state.mode) {
    case 'move': {
      // For move, calculate new start by subtracting the click offset from current mouse position
      // This keeps the event at the same position relative to the mouse cursor
      const newStart = mouseTime - state.clickOffset;
      previewStart = snapToInterval(newStart, snapInterval);
      previewEnd = previewStart + eventDuration;
      break;
    }
    case 'resize-start': {
      // For resize-start, new start is at mouse position
      const newStart = Math.min(mouseTime, state.originalEnd - minDuration);
      previewStart = snapToInterval(newStart, snapInterval);
      previewEnd = state.originalEnd;
      // Ensure minimum duration after snapping
      if (previewEnd - previewStart < minDuration) {
        previewStart = previewEnd - minDuration;
      }
      break;
    }
    case 'resize-end': {
      // For resize-end, new end is at mouse position (adjusted by offset)
      const newEnd = Math.max(mouseTime - state.clickOffset, state.originalStart + minDuration);
      previewStart = state.originalStart;
      previewEnd = snapToInterval(newEnd, snapInterval);
      // Ensure minimum duration after snapping
      if (previewEnd - previewStart < minDuration) {
        previewEnd = previewStart + minDuration;
      }
      break;
    }
  }

  // Only create new state if values changed
  if (
    isDragging === state.isDragging &&
    previewStart === state.previewStart &&
    previewEnd === state.previewEnd
  ) {
    return state;
  }

  return {
    ...state,
    isDragging,
    previewStart,
    previewEnd,
  };
}

/**
 * Calculate time from Y position in week view
 * @param y Y position within grid
 * @param gridHeight Total grid height
 * @param dayStart Start of day (unix timestamp)
 * @param dayEnd End of day (unix timestamp)
 * @returns Unix timestamp
 */
export function timeFromYPosition(
  y: number,
  gridHeight: number,
  dayStart: number,
  dayEnd: number
): number {
  const percentDay = y / gridHeight;
  const dayDuration = dayEnd - dayStart;
  return dayStart + dayDuration * percentDay;
}

/**
 * Calculate Y position from time in week view
 * @param time Unix timestamp
 * @param gridHeight Total grid height
 * @param dayStart Start of day (unix timestamp)
 * @param dayEnd End of day (unix timestamp)
 * @returns Y position in pixels
 */
export function yPositionFromTime(
  time: number,
  gridHeight: number,
  dayStart: number,
  dayEnd: number
): number {
  const dayDuration = dayEnd - dayStart;
  const percentDay = (time - dayStart) / dayDuration;
  return percentDay * gridHeight;
}

/**
 * Calculate day index from X position in month view
 * @param x X position within grid
 * @param gridWidth Total grid width
 * @param daysInWeek Number of days (usually 7)
 * @returns Day index (0-6)
 */
export function dayIndexFromXPosition(
  x: number,
  gridWidth: number,
  daysInWeek: number = 7
): number {
  const cellWidth = gridWidth / daysInWeek;
  return Math.floor(x / cellWidth);
}

/**
 * Check if an event occurrence is from a recurring event
 * We detect this by looking at the occurrence ID pattern - recurring events
 * generate multiple occurrences with indices > 0
 * @param event The event occurrence
 * @returns True if this is a recurring event occurrence (not an exception)
 */
export function isRecurringOccurrence(event: EventOccurrence): boolean {
  // The occurrence ID format is `${eventId}-e${idx}`
  // Non-recurring events only have index 0
  // Recurring events that are exceptions have isException = true
  const match = event.id.match(/-e(\d+)$/);
  if (!match) {
    return false;
  }

  // If this is an exception, it's a modified occurrence that can be edited
  if (event.isException) {
    return false;
  }

  // For now, we can't easily tell if an event is recurring just from the occurrence
  // We'll allow dragging all events except cancelled ones
  // The actual recurring event check would require looking at the ICS data
  return false;
}

/**
 * Check if an event can be dragged (not read-only, not cancelled, etc.)
 * @param event The event occurrence
 * @param isCalendarReadOnly Whether the calendar containing this event is read-only
 * @returns True if event can be dragged
 */
export function canDragEvent(event: EventOccurrence, isCalendarReadOnly: boolean = false): boolean {
  // Don't allow dragging events in read-only calendars
  if (isCalendarReadOnly) {
    return false;
  }

  // Don't allow dragging cancelled events
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
    const endDate = moment.unix(end).format('MMM D');
    if (startDate === endDate) {
      return startDate;
    }
    return `${startDate} - ${endDate}`;
  }

  const startTime = moment.unix(start).format('h:mm A');
  const endTime = moment.unix(end).format('h:mm A');
  return `${startTime} - ${endTime}`;
}
