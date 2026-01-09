# Plan: Synthetic Event Drag Preview

## Current Approach Analysis

The current drag preview implementation:

1. **CalendarEventDragPreview** component (`calendar-event-drag-preview.tsx`) - ~133 lines
   - Duplicates positioning logic from CalendarEvent
   - Calculates its own dimensions based on `previewStart`/`previewEnd`

2. **Per-view rendering methods** - Each view decides whether to render the preview:
   - `week-view-event-column.tsx`: `_shouldRenderDragPreview()` + renders CalendarEventDragPreview
   - `week-view-all-day-events.tsx`: `_shouldRenderDragPreview()` + renders CalendarEventDragPreview
   - `month-view-day-cell.tsx`: Custom `_renderDragPreview()` with inline styling

3. **Limitation**: Multi-day events only show preview in the column where `previewStart` falls, not across all spanned days

## Proposed Alternative: Synthetic Event Approach

### Core Concept

Instead of a separate preview component, create a **synthetic EventOccurrence** from `dragState` and inject it into the normal events data flow. This leverages:

- `eventsGroupedByDay()` - automatically splits multi-day events across columns
- `CalendarEvent` - existing positioning and rendering logic
- Overlap calculation - proper stacking with concurrent events

### Benefits

1. **Multi-day spanning works automatically** - A dragged event spanning Wed-Fri would show preview in all three day columns
2. **Removes ~300 lines of duplicate code** - CalendarEventDragPreview + _shouldRenderDragPreview methods
3. **Consistent positioning** - Uses the same well-tested logic as regular events
4. **Overlap handling** - Preview properly stacks with other events

### Implementation Steps

#### Phase 1: Extend EventOccurrence Interface

**File**: `calendar-data-source.ts`

```typescript
export interface EventOccurrence {
  // ... existing fields ...

  /** True if this is a synthetic drag preview event */
  isDragPreview?: boolean;

  /** If this is a preview, the ID of the original event being dragged */
  originalEventId?: string;
}
```

#### Phase 2: Create Synthetic Event Factory

**File**: `calendar-drag-utils.ts` (new function)

```typescript
/**
 * Create a synthetic EventOccurrence from drag state for preview rendering
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
```

#### Phase 3: Inject Synthetic Event in Views

**File**: `week-view.tsx`

Before calling `eventsGroupedByDay()`:

```typescript
render() {
  const days = this._daysInView();

  // Create events array, potentially with drag preview
  let events = this.state.events;
  const { dragState } = this.props;

  if (dragState?.isDragging) {
    // Filter out the original event being dragged
    events = events.filter(e => e.id !== dragState.event.id);
    // Add synthetic preview event
    events = [...events, createDragPreviewEvent(dragState)];
  }

  const eventsByDay = eventsGroupedByDay(events, days);
  // ... rest of render
}
```

**File**: `month-view.tsx` - Similar pattern

#### Phase 4: Update CalendarEvent Styling

**File**: `calendar-event.tsx`

Add `isDragPreview` class and apply preview styling:

```typescript
render() {
  const classNames = [
    'calendar-event',
    direction,
    selected && 'selected',
    event.isCancelled && 'cancelled',
    event.isException && 'exception',
    isDragging && 'dragging',
    this._canDrag() && 'draggable',
    event.isDragPreview && 'drag-preview',  // NEW
  ]
    .filter(Boolean)
    .join(' ');
```

Also disable interactions for preview events:
- Don't show resize handles
- Don't respond to clicks
- Add `pointer-events: none`

**File**: `nylas-calendar.less`

```less
.calendar-event.drag-preview {
  opacity: 0.7;
  border: 2px dashed;
  pointer-events: none;
  z-index: 1000;

  // Hide resize handles
  &::before, &::after {
    display: none;
  }
}
```

#### Phase 5: Handle All-Day Events Section

The all-day section has special positioning with `fixedSize` and `order` props for vertical stacking.

**Option A**: Keep minimal special handling in `week-view-all-day-events.tsx`
- Still need to calculate `order` for vertical position in the all-day bar
- But can use synthetic event approach for horizontal positioning

**Option B**: Extend `eventsGroupedByDay` to include order calculation
- The `overlapForEvents` function already calculates this
- Could store the order in the synthetic event

#### Phase 6: Remove Deprecated Code

Delete:
- `calendar-event-drag-preview.tsx` (entire file)
- `_shouldRenderDragPreview()` in week-view-event-column.tsx
- `_shouldRenderDragPreview()` in week-view-all-day-events.tsx
- `_renderDragPreview()` in month-view-day-cell.tsx
- CalendarEventDragPreview imports and usages

#### Phase 7: Add Time Tooltip

The current drag preview shows a time tooltip. Two options:

**Option A**: Add tooltip rendering in CalendarEvent when `isDragPreview` is true
```typescript
{event.isDragPreview && (
  <div className="drag-preview-time-tooltip">
    {formatDragPreviewTime(event.start, event.end, event.isAllDay)}
  </div>
)}
```

**Option B**: Use CSS pseudo-element with `content: attr(data-time)`
- Set `data-time` attribute on the element
- Less flexible but keeps component simpler

### Edge Cases to Handle

1. **Original event visibility**: Hide the original event being dragged (show only preview)
   - Filter by `originalEventId` in the events list

2. **All-day to timed event conversion**: If dragging from all-day area to timed column
   - Synthetic event's `isAllDay` should reflect the target container type
   - May need to update based on `containerType` during drag

3. **Cross-week dragging**: Preview should appear even if dragged outside current week
   - The synthetic event with `previewStart`/`previewEnd` handles this naturally

4. **Performance**: Creating new array on every drag move
   - Consider memoization or only updating when preview times actually change
   - Current approach already recreates state on each move

### Files Changed Summary

| File | Change |
|------|--------|
| `calendar-data-source.ts` | Add `isDragPreview`, `originalEventId` to interface |
| `calendar-drag-utils.ts` | Add `createDragPreviewEvent()` function |
| `calendar-event.tsx` | Add `drag-preview` class, disable interactions |
| `nylas-calendar.less` | Add `.drag-preview` styles |
| `week-view.tsx` | Inject synthetic event before `eventsGroupedByDay` |
| `month-view.tsx` | Inject synthetic event before grouping |
| `week-view-all-day-events.tsx` | Remove preview rendering, may keep order calc |
| `week-view-event-column.tsx` | Remove `_shouldRenderDragPreview` and preview rendering |
| `month-view-day-cell.tsx` | Remove `_renderDragPreview` |
| `calendar-event-drag-preview.tsx` | **DELETE** |

### Estimated Impact

- **Lines removed**: ~300 (preview component + per-view methods)
- **Lines added**: ~50 (synthetic event factory + view integration + styles)
- **Net reduction**: ~250 lines
- **Multi-day support**: Automatic (major improvement)

### Testing Considerations

1. Drag timed event within same day - preview appears in correct position
2. Drag timed event across multiple days - preview spans all relevant columns
3. Drag all-day event - preview shows in all-day bar with correct width
4. Drag from all-day to timed area (if supported) - preview converts correctly
5. Preview styling - dashed border, semi-transparent, no interactions
6. Original event hidden while dragging
7. Performance - smooth dragging without jank
