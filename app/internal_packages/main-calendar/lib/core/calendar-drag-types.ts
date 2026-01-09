import { EventOccurrence } from './calendar-data-source';

/**
 * The type of drag operation being performed
 * - 'move': Dragging the center of the event to relocate it
 * - 'resize-start': Dragging the leading edge (top/left) to change start time
 * - 'resize-end': Dragging the trailing edge (bottom/right) to change end time
 */
export type DragMode = 'move' | 'resize-start' | 'resize-end';

/**
 * Direction of the calendar view, affects edge detection and calculations
 * - 'vertical': Week view (time flows top-to-bottom)
 * - 'horizontal': Month view (days flow left-to-right)
 */
export type ViewDirection = 'vertical' | 'horizontal';

/**
 * Type of calendar container, determines snap resolution
 * - 'day-column': Week view timed events (15-minute snap)
 * - 'all-day-area': Week view all-day events (day snap)
 * - 'month-cell': Month view (day snap)
 */
export type CalendarContainerType = 'day-column' | 'all-day-area' | 'month-cell';

/**
 * Result of hit zone detection - determines drag mode and cursor
 */
export interface HitZone {
  mode: DragMode;
  cursor: string; // CSS cursor value
}

/**
 * State tracked during an active drag operation
 */
export interface DragState {
  /** The drag operation type */
  mode: DragMode;

  /** The event occurrence being dragged */
  event: EventOccurrence;

  /** Original start time (unix timestamp) - for calculating deltas and cancellation */
  originalStart: number;

  /** Original end time (unix timestamp) - for calculating deltas and cancellation */
  originalEnd: number;

  /** Unix timestamp at the initial mouse position when drag started */
  initialMouseTime: number;

  /** Offset between click position and event start (for 'move' mode) - preserves grab point */
  clickOffset: number;

  /** Initial mouse X position */
  initialMouseX: number;

  /** Initial mouse Y position */
  initialMouseY: number;

  /** Current preview start time (updated during drag) */
  previewStart: number;

  /** Current preview end time (updated during drag) */
  previewEnd: number;

  /** Time snapping interval in seconds (e.g., 900 for 15 minutes) */
  snapIntervalSeconds: number;

  /** Whether the drag threshold has been exceeded (prevents accidental drags) */
  isDragging: boolean;
}

/**
 * Configuration for drag behavior
 */
export interface DragConfig {
  /** Pixel threshold before drag starts (prevents accidental drags on click) */
  dragThreshold: number;

  /** Time snapping interval in seconds */
  snapInterval: number;

  /** Edge detection zone size in pixels */
  edgeZoneSize: number;

  /** Minimum event duration in seconds */
  minDuration: number;

  /** Direction for edge detection */
  direction: ViewDirection;
}

/**
 * Default configuration values
 */
export const DEFAULT_DRAG_CONFIG: DragConfig = {
  dragThreshold: 5,
  snapInterval: 900, // 15 minutes
  edgeZoneSize: 12, // Larger zone for easier grab
  minDuration: 900, // 15 minutes
  direction: 'vertical',
};

/**
 * Month view specific configuration
 */
export const MONTH_VIEW_DRAG_CONFIG: DragConfig = {
  dragThreshold: 5,
  snapInterval: 86400, // 1 day
  edgeZoneSize: 12, // Larger zone for easier grab
  minDuration: 86400, // 1 day
  direction: 'horizontal',
};
