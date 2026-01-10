import moment from 'moment';
import {
  CalendarContainerType,
  DragConfig,
  DragState,
  HitZone,
  ViewDirection,
} from './calendar-drag-types';
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
  const snappedStart = moment
    .unix(start)
    .startOf('day')
    .unix();

  // End at end of day (23:59:59)
  const snappedEnd = moment
    .unix(end)
    .endOf('day')
    .unix();

  return { start: snappedStart, end: snappedEnd };
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
  return {
    ...event,
    id: `${event.id}-drag-preview`,
    start: previewStart,
    end: previewEnd,
    isDragPreview: true,
    originalEventId: event.id,
  };
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
  const filtered = events.filter(e => e.id !== dragState.event.id);
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

  switch (state.mode) {
    case 'move': {
      // For move, calculate new start by subtracting the click offset from current mouse position
      // This keeps the event at the same position relative to the mouse cursor
      // For day-based snapping, ignore click offset since we snap to day boundaries
      const newStart = usesDaySnap ? mouseTime : mouseTime - state.clickOffset;
      if (usesDaySnap) {
        // For day-based moves, snap start to beginning of day and end to end of day
        // Calculate how many days the event spans (minimum 1)
        const numDays = Math.max(1, Math.round(eventDuration / 86400));
        previewStart = moment
          .unix(newStart)
          .startOf('day')
          .unix();
        previewEnd = moment
          .unix(previewStart)
          .add(numDays - 1, 'days')
          .endOf('day')
          .unix();
      } else {
        previewStart = snapToInterval(newStart, snapInterval);
        previewEnd = previewStart + eventDuration;
      }
      break;
    }
    case 'resize-start': {
      // For resize-start, new start is at mouse position
      // For day-based snapping, snap to start of the day the cursor is in
      const newStart = Math.min(mouseTime, state.originalEnd - minDuration);
      if (usesDaySnap) {
        previewStart = moment
          .unix(newStart)
          .startOf('day')
          .unix();
        // Ensure end is at end of day (in case original wasn't properly aligned)
        previewEnd = moment
          .unix(state.originalEnd)
          .endOf('day')
          .unix();
      } else {
        previewStart = snapToInterval(newStart, snapInterval);
        previewEnd = state.originalEnd;
      }
      // Ensure minimum duration after snapping
      if (previewEnd - previewStart < minDuration) {
        previewStart = previewEnd - minDuration;
      }
      break;
    }
    case 'resize-end': {
      // For resize-end, new end is at mouse position
      // For day-based snapping, snap to END of the day the cursor is in (not start)
      // Don't use click offset for day-based operations
      const newEnd = usesDaySnap
        ? mouseTime
        : Math.max(mouseTime - state.clickOffset, state.originalStart + minDuration);
      if (usesDaySnap) {
        // Ensure start is at start of day (in case original wasn't properly aligned)
        previewStart = moment
          .unix(state.originalStart)
          .startOf('day')
          .unix();
        previewEnd = moment
          .unix(newEnd)
          .endOf('day')
          .unix();
      } else {
        previewStart = state.originalStart;
        previewEnd = snapToInterval(newEnd, snapInterval);
      }
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
 * Check if an event can be dragged (not read-only, not cancelled, etc.)
 * @param event The event occurrence
 * @param isCalendarReadOnly Whether the calendar containing this event is read-only
 * @returns True if event can be dragged
 */
export function canDragEvent(event: EventOccurrence, isCalendarReadOnly = false): boolean {
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
