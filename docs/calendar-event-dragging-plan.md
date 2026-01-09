# Calendar Event Dragging Implementation Plan

## Overview

This document outlines the implementation plan for adding drag-and-drop interactions to calendar events in Mailspring's calendar views. The goal is to allow users to:

1. **Week View**: Drag event center to move, drag top edge to adjust start time, drag bottom edge to adjust end time
2. **Month View**: Drag event center to move, drag left edge to adjust start date, drag right edge to adjust end date

## Current Architecture

### Key Files
- `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx` - Root component with empty mouse handlers ready for implementation
- `app/internal_packages/main-calendar/lib/core/calendar-event-container.tsx` - Mouse event delegation with time calculation from position
- `app/internal_packages/main-calendar/lib/core/calendar-event.tsx` - Event rendering component
- `app/internal_packages/main-calendar/lib/core/week-view.tsx` - Week view with vertical time layout
- `app/internal_packages/main-calendar/lib/core/month-view.tsx` - Month view with day cell layout
- `app/src/flux/tasks/syncback-event-task.ts` - Task for persisting event changes

### Existing Infrastructure
- `CalendarEventContainer` already provides mouse event delegation with `CalendarEventArgs` containing:
  - `event` - The event occurrence under the mouse
  - `time` - Calculated time from mouse Y position
  - `x`, `y` - Mouse coordinates
  - `mouseIsDown` - Mouse button state tracking
- Mouse handlers in `MailspringCalendar` are currently no-ops, ready for implementation

---

## Implementation Plan

### Phase 1: Shared Drag Infrastructure

#### 1.1 Create Drag Types and Interfaces

**New File: `lib/core/calendar-drag-types.ts`**

```typescript
// Drag operation modes
export type DragMode = 'move' | 'resize-start' | 'resize-end';

// Direction of the view (affects resize edge detection)
export type ViewDirection = 'vertical' | 'horizontal';

// State tracked during a drag operation
export interface DragState {
  mode: DragMode;
  event: EventOccurrence;

  // Original values (for calculating deltas and cancellation)
  originalStart: number;
  originalEnd: number;

  // Initial mouse position
  initialMouseTime: number;  // Unix timestamp at drag start
  initialMouseX: number;
  initialMouseY: number;

  // Current preview values (updated during drag)
  previewStart: number;
  previewEnd: number;

  // Snapping configuration
  snapIntervalSeconds: number;  // 15 minutes = 900, 30 minutes = 1800
}

// Drag event callbacks
export interface DragCallbacks {
  onDragStart: (state: DragState) => void;
  onDragMove: (state: DragState) => void;
  onDragEnd: (state: DragState, cancelled: boolean) => void;
}

// Hit zone detection result
export interface HitZone {
  mode: DragMode;
  cursor: string;  // CSS cursor value
}
```

#### 1.2 Create Shared Drag Logic Hook

**New File: `lib/core/use-calendar-drag.ts`**

```typescript
import { EventOccurrence } from './calendar-data-source';
import { DragState, DragMode, HitZone } from './calendar-drag-types';

// Configuration for drag behavior
interface UseDragConfig {
  // Pixel threshold before drag starts (prevents accidental drags on click)
  dragThreshold: number;  // Default: 5px

  // Time snapping interval in seconds
  snapInterval: number;  // Default: 900 (15 minutes)

  // Edge detection zone size in pixels
  edgeZoneSize: number;  // Default: 8px

  // Minimum event duration in seconds
  minDuration: number;  // Default: 900 (15 minutes)

  // Direction for edge detection
  direction: 'vertical' | 'horizontal';
}

// Returns drag state and handlers to integrate with CalendarEventContainer
export function useCalendarDrag(config: UseDragConfig): {
  dragState: DragState | null;

  // Call from onMouseDown on an event
  handleEventMouseDown: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone
  ) => void;

  // Call from CalendarEventContainer's onCalendarMouseMove
  handleMouseMove: (args: CalendarEventArgs) => void;

  // Call from CalendarEventContainer's onCalendarMouseUp
  handleMouseUp: (args: CalendarEventArgs) => void;

  // Detect which zone was hit (move vs resize edges)
  detectHitZone: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    elementBounds: DOMRect
  ) => HitZone;

  // Cancel current drag operation
  cancelDrag: () => void;
};
```

**Core Logic Functions:**

```typescript
// Snap a timestamp to the nearest interval
export function snapToInterval(timestamp: number, intervalSeconds: number): number {
  return Math.round(timestamp / intervalSeconds) * intervalSeconds;
}

// Calculate new times based on drag mode and delta
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
    case 'resize-start':
      const newStart = Math.min(originalStart + timeDelta, originalEnd - minDuration);
      return {
        start: newStart,
        end: originalEnd,
      };
    case 'resize-end':
      const newEnd = Math.max(originalEnd + timeDelta, originalStart + minDuration);
      return {
        start: originalStart,
        end: newEnd,
      };
  }
}

// Detect hit zone based on mouse position within event element
export function detectHitZone(
  mouseX: number,
  mouseY: number,
  bounds: DOMRect,
  edgeZoneSize: number,
  direction: 'vertical' | 'horizontal'
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
```

#### 1.3 Create Drag Preview Component

**New File: `lib/core/calendar-event-drag-preview.tsx`**

A lightweight component that renders a "ghost" preview of the event during drag:

```typescript
interface DragPreviewProps {
  dragState: DragState;
  direction: 'vertical' | 'horizontal';
  scopeStart: number;
  scopeEnd: number;
}

export function CalendarEventDragPreview(props: DragPreviewProps) {
  // Renders a semi-transparent version of the event at the preview position
  // Uses same positioning logic as CalendarEvent but with preview times
}
```

---

### Phase 2: Update CalendarEvent Component

#### 2.1 Add Edge Detection and Cursor Feedback

**File: `lib/core/calendar-event.tsx`**

Add hover state tracking to show appropriate resize cursors:

```typescript
interface CalendarEventState {
  hitZone: HitZone | null;
}

// In render, add onMouseMove handler to detect edge zones
<div
  className={classNames}
  style={style}
  onMouseMove={this._onMouseMove}
  onMouseLeave={this._onMouseLeave}
  onMouseDown={this._onMouseDown}
  // ... existing handlers
>
```

```typescript
_onMouseMove = (e: React.MouseEvent) => {
  const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const hitZone = detectHitZone(
    e.clientX,
    e.clientY,
    bounds,
    8, // edgeZoneSize
    this.props.direction
  );
  this.setState({ hitZone });
};

_onMouseLeave = () => {
  this.setState({ hitZone: null });
};

_onMouseDown = (e: React.MouseEvent) => {
  // Prevent default to avoid text selection during drag
  e.preventDefault();

  // Notify parent of drag start with detected hit zone
  if (this.props.onDragStart && this.state.hitZone) {
    this.props.onDragStart(this.props.event, e, this.state.hitZone);
  }
};
```

#### 2.2 Add Visual Indicators for Resize Zones

Update styles to show resize affordances on hover:

**File: `lib/styles/nylas-calendar.less`**

```less
.calendar-event {
  // Resize handle indicators (visible on hover)
  &.vertical {
    &:hover::before,
    &:hover::after {
      content: '';
      position: absolute;
      left: 25%;
      right: 25%;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 2px;
    }
    &:hover::before { top: 2px; }
    &:hover::after { bottom: 2px; }
  }

  &.horizontal {
    &:hover::before,
    &:hover::after {
      content: '';
      position: absolute;
      top: 25%;
      bottom: 25%;
      width: 3px;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 2px;
    }
    &:hover::before { left: 2px; }
    &:hover::after { right: 2px; }
  }

  // Dragging state
  &.dragging {
    opacity: 0.5;
  }
}

// Drag preview
.calendar-event-drag-preview {
  position: absolute;
  pointer-events: none;
  opacity: 0.7;
  z-index: 1000;
  border: 2px dashed @accent-primary;
}
```

---

### Phase 3: Week View Integration

#### 3.1 Update WeekView Component

**File: `lib/core/week-view.tsx`**

```typescript
interface WeekViewState {
  // ... existing state
  dragState: DragState | null;
}

// Initialize drag hook
const dragHandlers = useCalendarDrag({
  dragThreshold: 5,
  snapInterval: 900, // 15 minutes
  edgeZoneSize: 8,
  minDuration: 900,
  direction: 'vertical',
});

// Pass drag handlers to CalendarEventContainer
<CalendarEventContainer
  onCalendarMouseDown={this._onCalendarMouseDown}
  onCalendarMouseMove={this._onCalendarMouseMove}
  onCalendarMouseUp={this._onCalendarMouseUp}
>
```

#### 3.2 Time Calculation for Week View

Week view already calculates time from mouse position in `CalendarEventContainer`. The key calculations:

```typescript
// Time from Y position in week view
function timeFromYPosition(y: number, gridHeight: number, dayStart: number, dayEnd: number): number {
  const percentDay = y / gridHeight;
  const dayDuration = dayEnd - dayStart;
  return dayStart + (dayDuration * percentDay);
}

// Y position from time
function yPositionFromTime(time: number, gridHeight: number, dayStart: number, dayEnd: number): number {
  const dayDuration = dayEnd - dayStart;
  const percentDay = (time - dayStart) / dayDuration;
  return percentDay * gridHeight;
}
```

#### 3.3 Render Drag Preview in Week View

Add preview rendering alongside events:

```typescript
render() {
  return (
    <CalendarEventContainer ...>
      {/* Existing week view content */}

      {this.state.dragState && (
        <CalendarEventDragPreview
          dragState={this.state.dragState}
          direction="vertical"
          scopeStart={this._scopeStart()}
          scopeEnd={this._scopeEnd()}
        />
      )}
    </CalendarEventContainer>
  );
}
```

---

### Phase 4: Month View Integration

#### 4.1 Update MonthView Component

**File: `lib/core/month-view.tsx`**

```typescript
interface MonthViewState {
  // ... existing state
  dragState: DragState | null;
}

// Initialize drag hook with horizontal direction
const dragHandlers = useCalendarDrag({
  dragThreshold: 5,
  snapInterval: 86400, // 1 day
  edgeZoneSize: 8,
  minDuration: 86400,
  direction: 'horizontal',
});
```

#### 4.2 Day Calculation for Month View

Month view needs to calculate day from X position:

```typescript
// Calculate which day cell contains the mouse position
function dayFromXPosition(
  x: number,
  gridBounds: DOMRect,
  weekStart: Moment
): number {
  const cellWidth = gridBounds.width / 7;
  const dayIndex = Math.floor((x - gridBounds.left) / cellWidth);
  return weekStart.clone().add(dayIndex, 'days').startOf('day').unix();
}
```

#### 4.3 Multi-Day Event Handling in Month View

For events spanning multiple days in month view, update `MonthViewEvent` to:
1. Show resize handles on the left edge of the first day segment
2. Show resize handles on the right edge of the last day segment
3. Handle dragging across week boundaries

---

### Phase 5: Persist Changes with SyncbackEventTask

#### 5.1 Event Update Logic

**File: `lib/core/mailspring-calendar.tsx`**

When a drag completes successfully:

```typescript
async _onDragEnd(dragState: DragState, cancelled: boolean) {
  if (cancelled) {
    this.setState({ dragState: null });
    return;
  }

  // Get the actual Event model from the database
  const eventId = dragState.event.id.replace(/-e\d+$/, '');
  const event = await DatabaseStore.find<Event>(Event, eventId);

  if (!event) {
    console.error('Could not find event to update');
    return;
  }

  // Update the event times
  event.recurrenceStart = dragState.previewStart;
  event.recurrenceEnd = dragState.previewEnd;

  // Queue the syncback task
  const task = SyncbackEventTask.forUpdating({ event });
  Actions.queueTask(task);

  // Clear drag state
  this.setState({ dragState: null });
}
```

#### 5.2 Optimistic Updates

For smooth UX, update the UI immediately while the task runs:

```typescript
// The CalendarDataSource will automatically update when the database changes
// from the sync engine's response, but we can show preview during the sync
```

---

### Phase 6: Handle Edge Cases

#### 6.1 Recurring Events

When dragging a recurring event occurrence:
1. Show a confirmation dialog: "Modify this occurrence only, or all occurrences?"
2. If "this occurrence only" - create an exception event
3. If "all occurrences" - modify the master event's recurrence rule

```typescript
// In _onDragEnd
if (dragState.event.isRecurring && !dragState.event.isException) {
  const result = await this._showRecurringEventDialog();
  if (result === 'cancel') {
    this.setState({ dragState: null });
    return;
  }
  // Handle based on user choice
}
```

#### 6.2 All-Day Events

All-day events in week view have special handling:
- Can only be moved to different days (not times)
- Resize changes the number of days
- Snap to day boundaries

```typescript
if (dragState.event.isAllDay) {
  // Snap to day boundaries
  previewStart = moment.unix(previewStart).startOf('day').unix();
  previewEnd = moment.unix(previewEnd).endOf('day').unix();
}
```

#### 6.3 Multi-Day Events

Events spanning multiple days need special handling:
- In week view, they appear in the all-day section
- In month view, they span multiple day cells
- Dragging should preserve duration unless resizing

#### 6.4 Boundary Constraints

Prevent events from being dragged outside valid boundaries:
- Don't allow negative durations
- Maintain minimum event duration (15 minutes for timed, 1 day for all-day)
- Consider calendar-specific constraints (e.g., read-only calendars)

```typescript
// Check if calendar is writable
const calendar = CalendarStore.calendarForId(event.calendarId);
if (!calendar || calendar.readOnly) {
  return; // Don't allow drag
}
```

---

### Phase 7: Polish and Accessibility

#### 7.1 Keyboard Support

Add keyboard alternatives for drag operations:
- Arrow keys to move selected event by 15-minute increments
- Shift+Arrow keys to resize selected event

```typescript
// In MailspringCalendar
_onKeyDown = (e: React.KeyboardEvent) => {
  if (!this.state.selectedEvents.length) return;

  const event = this.state.selectedEvents[0];
  const delta = e.shiftKey ? 3600 : 900; // 1 hour or 15 minutes

  switch (e.key) {
    case 'ArrowUp':
      this._moveEvent(event, -delta);
      break;
    case 'ArrowDown':
      this._moveEvent(event, delta);
      break;
    // etc.
  }
};
```

#### 7.2 Undo Support

Integrate with Mailspring's undo system:

```typescript
// After successful drag
UndoStack.push({
  redo: () => {
    // Apply the new times
    event.recurrenceStart = newStart;
    event.recurrenceEnd = newEnd;
    Actions.queueTask(SyncbackEventTask.forUpdating({ event }));
  },
  undo: () => {
    // Restore original times
    event.recurrenceStart = originalStart;
    event.recurrenceEnd = originalEnd;
    Actions.queueTask(SyncbackEventTask.forUpdating({ event }));
  },
});
```

#### 7.3 Visual Feedback

- Show time tooltip during drag (e.g., "2:00 PM - 3:30 PM")
- Highlight affected time slots/day cells
- Show snap guides when approaching interval boundaries

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `lib/core/calendar-drag-types.ts` | Type definitions for drag operations |
| `lib/core/use-calendar-drag.ts` | Shared drag logic hook |
| `lib/core/calendar-event-drag-preview.tsx` | Ghost preview component |
| `lib/core/calendar-drag-utils.ts` | Utility functions for time snapping, hit detection |

### Modified Files

| File | Changes |
|------|---------|
| `lib/core/calendar-event.tsx` | Add edge detection, drag start handlers, cursor styles |
| `lib/core/week-view.tsx` | Integrate drag hook, render preview |
| `lib/core/month-view.tsx` | Integrate drag hook, render preview |
| `lib/core/month-view-event.tsx` | Add resize handles for multi-day events |
| `lib/core/mailspring-calendar.tsx` | Handle drag completion, persist changes |
| `lib/core/calendar-event-container.tsx` | Minor updates to mouse event handling |
| `lib/styles/nylas-calendar.less` | Drag preview styles, cursor styles, resize affordances |

---

## Implementation Order

1. **Phase 1**: Create shared drag infrastructure (types, hook, utilities)
2. **Phase 2**: Update CalendarEvent with edge detection and cursor feedback
3. **Phase 3**: Implement week view drag (move + resize)
4. **Phase 4**: Implement month view drag (move + resize)
5. **Phase 5**: Integrate SyncbackEventTask for persistence
6. **Phase 6**: Handle edge cases (recurring, all-day, multi-day)
7. **Phase 7**: Polish (keyboard support, undo, visual feedback)

---

## Testing Considerations

### Manual Testing Scenarios

1. **Week View - Move**: Drag event center to new time
2. **Week View - Resize Start**: Drag top edge to change start time
3. **Week View - Resize End**: Drag bottom edge to change end time
4. **Month View - Move**: Drag event to different day
5. **Month View - Resize**: Drag edges to change date range
6. **All-Day Events**: Drag in all-day section
7. **Multi-Day Events**: Drag across week boundaries
8. **Recurring Events**: Verify exception handling
9. **Keyboard Navigation**: Arrow key event adjustments
10. **Undo/Redo**: Verify changes can be undone

### Edge Cases to Test

- Dragging event past midnight
- Dragging event across DST boundaries
- Very short events (< 15 minutes)
- Very long events (multi-week)
- Read-only calendars (should not drag)
- Network failures during sync
- Concurrent edits from other clients

---

## Technical Notes

### React Hooks vs Class Components

The current codebase uses class components. The drag hook could be implemented as:
1. A custom hook (would require converting components to functional)
2. A higher-order component (HOC) pattern
3. A render props component
4. Plain utility functions called from class component methods

**Recommendation**: Use utility functions + component state for consistency with existing codebase.

### Performance Considerations

- Use `requestAnimationFrame` for smooth drag preview updates
- Debounce or throttle expensive calculations during drag
- Consider using CSS transforms instead of top/left for preview positioning
- Avoid re-rendering entire event list during drag

### State Management

Drag state should be kept in the view component (WeekView/MonthView) rather than a global store because:
- It's transient UI state
- Different views may have independent drag operations
- Simplifies cleanup on unmount
