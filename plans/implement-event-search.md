# Event Search Implementation Plan

**Date:** January 2026
**Feature:** Event Search in Calendar
**Current State:** Stubbed out (returns `<span />`)
**Location:** `app/internal_packages/main-calendar/lib/core/event-search-bar.tsx`

---

## Overview

Implement a functional event search feature for the calendar that allows users to search for events by title, description, location, or participants. The implementation will follow the same patterns used by email/thread search in Mailspring.

---

## How Email Search Works in Mailspring (Reference)

The email search system provides a good template:

### Architecture Components

1. **Search UI** (`thread-search-bar.tsx`)
   - Text input with autocomplete suggestions
   - Keyboard navigation (arrow keys, Enter, Escape)
   - Token highlighting for search operators (`from:`, `is:`, etc.)

2. **Query Parsing** (`search-query-parser.ts`)
   - Parses search strings into AST (Abstract Syntax Tree)
   - Supports operators: `from:`, `to:`, `is:`, `has:`, `in:`, `before:`, `since:`
   - Boolean logic: AND, OR, NOT

3. **Database Query** (`matcher.ts`)
   - `Matcher.Search` generates FTS5 SQL queries
   - Uses `{ModelName}Search` table for full-text search
   - SQL pattern: `` `Model`.`id` IN (SELECT `content_id` FROM `ModelSearch` WHERE `ModelSearch` MATCH '"query"*') ``

4. **Data Flow**
   ```
   User Types → searchQueryChanged Action → Update suggestions
   User Presses Enter → searchQuerySubmitted Action → Create perspective → Execute query
   Results → QuerySubscription → Update UI
   ```

### Event Model Already Configured for Search

The `Event` model (`app/src/flux/models/event.ts`) is already configured:

```typescript
static searchable = true;
static searchFields = ['title', 'description', 'location', 'participants'];
```

This means:
- An `EventSearch` FTS5 table should already exist in the database
- The sync engine indexes events into this table
- `DatabaseStore.findAll<Event>(Event).search(query)` should work

---

## Implementation Plan

### Phase 1: Basic Search UI Component

**File:** `app/internal_packages/main-calendar/lib/core/event-search-bar.tsx`

#### Step 1.1: Create Search Input with Dropdown

Replace the stubbed component with a functional search bar using existing components:

```typescript
// Use Menu component for dropdown suggestions
import { Menu, KeyCommandsRegion } from 'mailspring-component-kit';
```

**Required UI Elements:**
- Search input field with placeholder "Search events..."
- Dropdown menu showing matching events
- Clear button (×) to reset search
- Loading indicator during search

**Keyboard Navigation:**
- Arrow Up/Down: Navigate suggestions
- Enter: Select highlighted suggestion
- Escape: Clear search/close dropdown

#### Step 1.2: Search Input Handler

The existing `onSearchQueryChanged` method already has the right structure:

```typescript
onSearchQueryChanged = query => {
  this.setState({ query });
  if (query.length <= 1) {
    this.onClearSearchSuggestions();
    return;
  }

  let dbQuery = DatabaseStore.findAll<Event>(Event).distinct();
  if (disabledCalendars.length > 0) {
    dbQuery = dbQuery.where(Event.attributes.calendarId.notIn(disabledCalendars));
  }

  dbQuery.search(query).limit(10).then(events => {
    this.setState({
      suggestions: occurrencesForEvents(events, {
        startUnix: moment().add(-2, 'years').unix(),
        endUnix: moment().add(2, 'years').unix(),
      }),
    });
  });
};
```

**Improvements needed:**
- Add debouncing (300ms) to avoid excessive queries
- Add loading state
- Handle query cancellation when user types again

### Phase 2: Search Result Display

#### Step 2.1: Event Suggestion Item Renderer

Create a proper renderer for search results showing:
- Event title
- Event date/time (formatted)
- Event location (if available)
- Calendar color indicator

**Example format:**
```
[●] Meeting with Team
    Jan 15, 2026 at 2:00 PM - 3:00 PM
    Conference Room A
```

#### Step 2.2: Empty State and No Results

- Show helpful message when no results found
- Suggest different search terms

### Phase 3: Navigation and Integration

#### Step 3.1: Event Selection Handler

When user selects an event from search:
1. Close the search dropdown
2. Clear the search query
3. Navigate calendar to the event's date
4. Highlight/focus the event

The existing `onSelectEvent` callback does this:
```typescript
onSelectEvent = event => {
  this.onClearSearchQuery();
  setImmediate(() => {
    this.props.onSelectEvent(event);  // Navigates to event date
  });
};
```

#### Step 3.2: Calendar Integration

The `MailspringCalendar` component already has the handler:
```typescript
_focusEvent = (event: EventOccurrence) => {
  this.setState({
    focusedMoment: moment(event.start * 1000),
    focusedEvent: event
  });
};
```

### Phase 4: Styling

**File:** `app/internal_packages/main-calendar/styles/main-calendar.less`

Add styles for:
- `.event-search-bar` - Container styles
- `.event-search-input` - Input field styling
- `.event-search-suggestions` - Dropdown styling
- `.event-search-item` - Individual result styling
- `.event-search-item-title` - Title text
- `.event-search-item-time` - Date/time text
- `.event-search-item-location` - Location text
- `.event-search-calendar-dot` - Calendar color indicator

Follow existing Mailspring design patterns:
- Use `@import 'ui-variables'` for consistent colors
- Use `@font-size-small`, `@text-color-subtle`, etc.
- Match the ThreadSearchBar styling where appropriate

---

## Detailed Component Structure

```typescript
// event-search-bar.tsx
interface EventSearchBarState {
  query: string;
  suggestions: EventOccurrence[];
  selectedIndex: number;
  focused: boolean;
  loading: boolean;
}

export class EventSearchBar extends Component<EventSearchBarProps, EventSearchBarState> {
  private _searchDebounce: NodeJS.Timeout | null = null;

  constructor(props) {
    super(props);
    this.state = {
      query: '',
      suggestions: [],
      selectedIndex: 0,
      focused: false,
      loading: false,
    };
  }

  _onSearchQueryChanged = (query: string) => {
    // Debounced search implementation
  };

  _onKeyDown = (e: React.KeyboardEvent) => {
    // Arrow key navigation, Enter, Escape handling
  };

  _renderSuggestion = (event: EventOccurrence) => {
    // Render individual search result
  };

  render() {
    // Search input + Menu component for dropdown
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `app/internal_packages/main-calendar/lib/core/event-search-bar.tsx` | Full rewrite - implement search UI |
| `app/internal_packages/main-calendar/styles/main-calendar.less` | Add search bar styles |

## Files to Reference (No Changes)

| File | Purpose |
|------|---------|
| `app/internal_packages/thread-search/lib/thread-search-bar.tsx` | Pattern reference for search UI |
| `app/src/components/menu.tsx` | Menu component for dropdown |
| `app/src/flux/models/event.ts` | Event model (already configured for search) |
| `app/internal_packages/main-calendar/lib/core/calendar-data-source.ts` | occurrencesForEvents function |

---

## Testing Considerations

1. **Manual Testing:**
   - Search for events by title
   - Search for events by location
   - Search for events by participant email
   - Verify navigation to event works
   - Test with no results
   - Test with disabled calendars

2. **Edge Cases:**
   - Very long event titles (truncation)
   - Events with no location
   - All-day events (date-only display)
   - Recurring events (multiple occurrences)
   - Special characters in search query

---

## Future Enhancements (Not in Initial Scope)

1. **Advanced Search Operators:**
   - `in:calendar-name` - Filter by calendar
   - `before:date` / `after:date` - Date range filters
   - `is:recurring` - Filter recurring events
   - `with:email@domain.com` - Attendee filter

2. **Search Persistence:**
   - Recent searches history
   - Save searches

3. **Full Search View:**
   - Dedicated search results panel
   - Sort and filter options

---

## Implementation Order

1. **Step 1:** Create basic search input that displays suggestions
2. **Step 2:** Implement debounced search query execution
3. **Step 3:** Add keyboard navigation (arrow keys, Enter, Escape)
4. **Step 4:** Style the search results with event details
5. **Step 5:** Test and polish the integration with calendar navigation
