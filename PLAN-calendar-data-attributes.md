# Plan: Simplify Calendar Drag Implementation with Unified Data Attributes

## Problem Statement

The current calendar drag-and-drop implementation has grown complex due to:

1. **Inconsistent data attributes across views:**
   - Week view columns: `data-start`, `data-end` (milliseconds)
   - Month view cells: `data-day-start` (unix seconds)
   - All-day area: No data attributes (relies on finding adjacent columns)

2. **Complex DOMCache with 9+ cached properties:**
   ```typescript
   _DOMCache: {
     eventColumn?: any;
     gridWrap?: any;
     calWrap?: any;
     calWrapRect?: any;
     rect?: any;
     allDayArea?: any;
     allDayRect?: any;
     monthGrid?: any;
     weekHeader?: any;
   }
   ```

3. **View-specific detection logic with CSS class chains:**
   - Week timed: `.event-grid-wrap .scroll-region-content-inner` + `.calendar-area-wrap`
   - Week all-day: `.all-day-events` + lookup columns from adjacent grid
   - Month: `.month-view-grid` + `_findMonthDayCellAtPosition()`

4. **Inconsistent time units:**
   - Week view uses JavaScript milliseconds
   - Month view uses Unix seconds
   - Conversions are error-prone

## Proposed Solution

### 1. Unified Data Attribute Scheme

Add consistent data attributes to ALL time-representing containers:

```html
<!-- Attribute naming convention -->
data-calendar-start="<unix_seconds>"   <!-- Start time of container -->
data-calendar-end="<unix_seconds>"     <!-- End time of container -->
data-calendar-type="<type>"            <!-- 'day-column' | 'all-day-column' | 'month-cell' -->
```

**Why Unix seconds?**
- Matches existing month view (which works correctly)
- Avoids JavaScript's millisecond timestamp confusion
- Consistent with moment.unix() usage

### 2. Apply to All Container Types

#### Week View Event Columns (`week-view-event-column.tsx`)
```jsx
// BEFORE
<div className="event-column"
     data-start={day.valueOf()}
     data-end={end}>

// AFTER
<div className="event-column"
     data-calendar-start={day.unix()}
     data-calendar-end={day.clone().endOf('day').unix()}
     data-calendar-type="day-column">
```

#### Week View All-Day Columns (NEW - `week-view-all-day-events.tsx`)
Add individual column divs for each day with data attributes:
```jsx
// AFTER - wrap each day's all-day events in a column
<div className="all-day-column"
     data-calendar-start={dayStart.unix()}
     data-calendar-end={dayEnd.unix()}
     data-calendar-type="all-day-column">
  {/* all-day events for this day */}
</div>
```

#### Month View Day Cells (`month-view-day-cell.tsx`)
```jsx
// BEFORE
<div className="month-view-day-cell"
     data-day-start={day.clone().startOf('day').unix()}>

// AFTER
<div className="month-view-day-cell"
     data-calendar-start={day.clone().startOf('day').unix()}
     data-calendar-end={day.clone().endOf('day').unix()}
     data-calendar-type="month-cell">
```

### 3. Simplified Detection Logic

Replace the complex view-specific detection with a single unified approach:

```typescript
_dataFromMouseEvent(event) {
  // Single query: find any element with calendar time data
  const timeContainer = event.target.closest('[data-calendar-start]');

  if (!timeContainer) {
    return { x: null, y: null, width: null, height: null, time: null };
  }

  const containerType = timeContainer.dataset.calendarType;
  const startTime = parseInt(timeContainer.dataset.calendarStart, 10);
  const endTime = parseInt(timeContainer.dataset.calendarEnd, 10);
  const rect = timeContainer.getBoundingClientRect();

  let time: moment.Moment;

  switch (containerType) {
    case 'day-column': {
      // Week view timed: calculate time from Y position
      const percentDay = (event.clientY - rect.top) / rect.height;
      const timeOffset = (endTime - startTime) * percentDay;
      time = moment.unix(startTime + timeOffset);
      break;
    }
    case 'all-day-column':
    case 'month-cell': {
      // All-day and month: just use day start
      time = moment.unix(startTime);
      break;
    }
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    time,
  };
}
```

### 4. Simplified DOMCache

With the unified approach, we can reduce caching significantly:

```typescript
// BEFORE: 9 cached properties
_DOMCache: {
  eventColumn?: any;
  gridWrap?: any;
  calWrap?: any;
  calWrapRect?: any;
  rect?: any;
  allDayArea?: any;
  allDayRect?: any;
  monthGrid?: any;
  weekHeader?: any;
}

// AFTER: Just cache the active container and its rect
_DOMCache: {
  container?: HTMLElement;
  containerRect?: DOMRect;
}
```

Or potentially eliminate the cache entirely since `closest()` and `getBoundingClientRect()` are fast operations on modern browsers.

### 5. Optional: Event Data Attributes

For even more simplification, add data attributes to events themselves:

```html
<div class="calendar-event"
     data-event-id="event-123"
     data-event-start="1704672000"
     data-event-end="1704675600">
```

This could simplify hit zone detection and event identification during drags.

---

## Implementation Phases

### Phase 1: Standardize Week View Columns
1. Update `week-view-event-column.tsx` to use new data attributes
2. Update `CalendarEventContainer` to read new attributes
3. Keep backward compatibility during transition (check both old and new attributes)

### Phase 2: Add All-Day Column Containers
1. Modify `week-view-all-day-events.tsx` to wrap each day in a column with data attributes
2. Update CSS to maintain existing layout
3. Remove the `_findEventColumnAtX()` workaround from all-day detection

### Phase 3: Standardize Month View Cells
1. Update `month-view-day-cell.tsx` to use new data attributes (rename from `data-day-start`)
2. Remove `_findMonthDayCellAtPosition()` - use `closest()` instead

### Phase 4: Simplify CalendarEventContainer
1. Replace view-specific detection with unified logic
2. Reduce or eliminate DOMCache
3. Remove helper methods that are no longer needed

### Phase 5: Cleanup
1. Remove old data attributes
2. Remove unused CSS class references in detection code
3. Update any related tests

---

## Benefits

1. **Simpler mental model**: One pattern works everywhere
2. **Less code**: Remove ~100 lines of view-specific detection logic
3. **Easier to extend**: Adding a new view type just means adding the right data attributes
4. **Better performance**: Fewer DOM queries, simpler cache
5. **Fewer bugs**: Consistent time units prevent off-by-one errors
6. **Self-documenting**: Data attributes make DOM inspection clearer

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Implement incrementally with backward compatibility |
| All-day layout changes | Ensure new column wrappers don't affect CSS layout |
| Performance regression from removing cache | Benchmark before/after; `closest()` is O(depth) which is small |

---

## Questions to Resolve

1. Should we keep `data-calendar-end` for containers where only start matters (month, all-day)?
   - Recommendation: Yes, for consistency. It also enables future features like partial-day display.

2. Should the cache be eliminated entirely?
   - Recommendation: Test performance first. If acceptable, remove it for simplicity.

3. Should we add data attributes to individual events?
   - Recommendation: Consider for Phase 5 as an optimization, not required initially.
