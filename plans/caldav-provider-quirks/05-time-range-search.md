# CalDAV Time-Range Search Compatibility Issues

## Issue Summary

Time-range searches are one of the most problematic areas in CalDAV server implementations. Despite being clearly specified in RFC 4791 section 9.9, servers exhibit widely varying behaviors that often violate the specification. The core issues include:

1. **Inaccurate time-range filtering**: Servers return events/todos outside the requested time range
2. **Broken VTODO handling**: Many servers cannot properly handle todos without DTSTART or DUE properties
3. **Duration ignored in calculations**: Some servers only check DTSTART/DTEND and ignore DURATION
4. **Recurring event problems**: Incorrect handling of implicit recurrences, infinite recurrences, and recurrence expansion
5. **Alarm time-range unsupported**: Few servers support searching by alarm trigger times
6. **Open-ended search failures**: Some servers fail when only start or only end is specified

These issues force CalDAV clients to implement extensive client-side post-filtering to ensure correct results.

## RFC 4791 Section 9.9 Specification

RFC 4791 section 9.9 defines the CALDAV:time-range XML element for filtering calendar components and properties based on time ranges. Here are the key requirements:

### VEVENT Overlap Calculation

For VEVENT components, the RFC specifies that a component overlaps a time range if:

```
(start < search_end) AND (end > search_start)
```

The component's start and end are determined as follows:

- **With DTEND**: `start = DTSTART`, `end = DTEND`
- **With DURATION**: `start = DTSTART`, `end = DTSTART + DURATION`
- **DATE-only DTSTART**: The event is treated as lasting the entire day
- **Missing DTEND and DURATION**: The event is assumed to have zero duration (instant)

Example from RFC 4791:
```xml
<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop xmlns:D="DAV:">
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="20060104T000000Z"
                      end="20060105T000000Z"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>
```

### VTODO Overlap Calculation

For VTODO components, the specification is more complex due to todos often lacking specific start/end times:

**Case 1: VTODO with both DTSTART and DUE (or DURATION)**
- Same as VEVENT: overlaps if `(DTSTART < search_end) AND (DUE > search_start)`

**Case 2: VTODO with DTSTART but no DUE**
- Per RFC 4791 section 9.9: "a `VTODO` component is said to overlap a given time range if... the start date or the end date for the to-do is in the range"
- However, the RFC also states that a todo without a due date is considered to have an **infinite duration**
- This creates ambiguity: should it match any search range that starts after DTSTART?

**Case 3: VTODO with DUE but no DTSTART**
- Similar ambiguity: infinite duration extending backward from DUE
- Should match any search range that ends before DUE?

**Case 4: VTODO with neither DTSTART nor DUE**
- RFC 4791: "If there is no `DTSTART` and no `DUE` date, then the `VTODO` component does not overlap the time range."
- However, many calendar applications use such todos for "someday/maybe" tasks
- Some servers incorrectly return these in all searches

### Recurring Events and Implicit Recurrences

RFC 4791 section 7.4 states:

> "The server MUST expand recurring components to determine whether any recurrence instances overlap the specified time range."

This means:
- A recurring event with `DTSTART=2004-01-01` and `RRULE:FREQ=YEARLY` should match a search for year 2025
- The search is checking **recurrence instances**, not the master event's DTSTART
- This is called "implicit recurrences" - instances that haven't been explicitly created yet

**Critical requirement**: Even for a search range far in the future (e.g., year 2050), a yearly recurring event from 2004 should be returned.

### Alarm Time-Range

RFC 4791 section 9.9 also defines time-range filtering for VALARM components:

> "A VALARM component is said to overlap a given time range if the alarm would trigger during the time range."

The alarm trigger time is calculated relative to the event/todo:
- `TRIGGER;VALUE=DATE-TIME:20060104T060000Z` - absolute trigger time
- `TRIGGER;VALUE=DURATION:-PT15M` - 15 minutes before the event start
- `TRIGGER;RELATED=END;VALUE=DURATION:-PT5M` - 5 minutes before the event end

Most CalDAV servers do not implement this correctly or at all.

## Real-World Server Behaviors

### Servers with Inaccurate Time-Range Filtering

**Bedework** (marked as `search.time-range.accurate: unsupported`):
- Returns recurring events whose future recurrences fall outside (after) the search interval
- May return events with no recurrences in the requested time range at all
- Workaround: Client must post-filter all results to verify actual overlap

**SOGo** (marked as `search.time-range.accurate: unsupported`):
```python
sogo = {
    "search.time-range.accurate": {
        "support": "unsupported",
        "description": "SOGo returns events/todos that fall outside the requested time range..."
    },
    "search.time-range.event": {"support": "unsupported"},
    "search.time-range.todo": {"support": "unsupported"},
}
```
- Time-range searches are essentially broken across the board
- Returns incorrect results for both events and todos
- Client-side filtering is mandatory

### Servers Ignoring DURATION

From `compatibility_hints.py`:

```python
'date_search_ignores_duration':
    """Date search with search interval overlapping event interval works on
    events with dtstart and dtend, but not on events with dtstart and duration"""

'date_todo_search_ignores_duration':
    """Same as above, but specifically for tasks"""
```

**Xandikos** has this flag set, meaning:
- An event with `DTSTART=2023-01-01T10:00:00Z` and `DURATION=PT2H` should end at `12:00:00Z`
- A search for `11:00:00Z to 11:30:00Z` should match (overlaps)
- But Xandikos ignores the DURATION, treats the event as zero-duration
- Workaround: Client expands DURATION to DTEND before searching, or post-filters

### VTODO Without DTSTART

This is one of the most common compatibility issues. Multiple flags exist:

**`vtodo_datesearch_nodtstart_task_is_skipped`** (Zimbra, DAViCal, Synology):
```python
'vtodo_datesearch_nodtstart_task_is_skipped':
    """date searches for todo-items will not find tasks without a dtstart"""
```
- Affects: DAViCal, Synology, and others
- A todo with only DUE set won't be returned in time-range searches
- Violates RFC 4791 (should have infinite duration extending to DUE)

**`vtodo_datesearch_nodtstart_task_is_skipped_in_closed_date_range`** (Xandikos):
```python
'vtodo_datesearch_nodtstart_task_is_skipped_in_closed_date_range':
    """only open-ended date searches for todo-items will find tasks without a dtstart"""
```
- More specific: closed ranges (both start and end specified) skip these todos
- Open-ended searches (only start, or only end) may work

**`vtodo_datesearch_notime_task_is_skipped`** (Zimbra):
```python
'vtodo_datesearch_notime_task_is_skipped':
    """date searches for todo-items will (only) find tasks that has either
    a dtstart or due set"""
```
- Todos with neither DTSTART nor DUE are always skipped
- Actually compliant with RFC, but many clients expect to find these

### VTODO Infinite Duration Issues

**`vtodo_no_due_infinite_duration`** (server treats as truly infinite):
```python
'vtodo_no_due_infinite_duration':
    """date search will find todo-items without due if dtstart is
    before the date search interval. This is in breach of rfc4791 section 9.9"""
```
- A todo with DTSTART but no DUE is treated as extending infinitely into the future
- Will match any search range that starts after DTSTART
- Technically violates RFC but arguably more intuitive

**`vtodo_no_dtstart_infinite_duration`**:
```python
'vtodo_no_dtstart_infinite_duration':
    """date search will find todo-items without dtstart if due is
    after the date search interval. This is in breach of rfc4791 section 9.9"""
```
- Mirror issue: VTODO with DUE but no DTSTART extends infinitely into the past

### Open-Ended Search Failures

**Radicale**, **GMX** (marked with `no_search_openended`):
```python
'no_search_openended':
    """An open-ended search will not work"""
```
- Searches with only `start` (no `end`) fail
- Searches with only `end` (no `start`) fail
- Client must provide both bounds, even if conceptually open-ended
- Workaround: Use a date far in the future (2099) or past (1970) as the bound

### Alarm Time-Range Support

Most servers mark alarm searches as **unsupported** or **ungraceful**:

```python
# Xandikos v0.2.12
'search.time-range.alarm': {'support': 'ungraceful', 'behaviour': '500 internal server error'}

# Zimbra
'search.time-range.alarm': {'support': 'unsupported'}

# Bedework
'search.time-range.alarm': {'support': 'unsupported'}
```

- **Ungraceful**: Server returns 500 Internal Server Error when alarm time-range is used
- **Unsupported**: Server silently ignores the alarm filter
- **Result**: Clients cannot rely on server-side alarm filtering at all

### Recurring Event Issues

**Infinite scope problems** (Bedework, SOGo):
```python
"search.recurrences.includes-implicit.infinite-scope": {
    "support": "unsupported"
}
```
- A yearly recurring event from 2004 should match a search for 2050
- These servers fail for searches "too far" from the master event
- Likely due to performance concerns (expanding 50 years of recurrences)
- No clear documentation on the cutoff distance

**Implicit recurrence failures** (many servers):
```python
# Nextcloud
'search.recurrences.includes-implicit.todo': {'support': 'unsupported'}

# Xandikos (old versions)
'search.recurrences.includes-implicit': {'support': 'unsupported'}
```
- Server only checks the master event's DTSTART, not expanded instances
- A weekly meeting starting Jan 1 won't match a search for Feb 1
- Workaround: Client must do server-side expansion or client-side filtering

## python-caldav Workarounds

The library implements several layers of workarounds to handle these server incompatibilities.

### Client-Side Post-Filtering

When `search.time-range.accurate` is not supported, the library enables post-filtering:

```python
# From search.py line 276-284
## Setting default value for post_filter
if post_filter is None and (
    (self.todo and not self.include_completed)
    or self.expand
    or "categories" in self._property_filters
    or "category" in self._property_filters
    or not calendar.client.features.is_supported("search.text.case-sensitive")
    or not calendar.client.features.is_supported("search.time-range.accurate")
):
    post_filter = True
```

When `post_filter=True`, every result from the server is validated client-side:

```python
# From search.py filter() method
if post_filter or self.expand or (split_expanded and server_expand):
    objects_ = objects
    objects = []
    for o in objects_:
        if self.expand or post_filter:
            filtered = self.check_component(o, expand_only=not post_filter)
            if not filtered:
                continue
```

The `check_component` method (inherited from icalendar-searcher base class) performs true time-range overlap checking according to RFC 4791.

### VTODO Special Handling: Three-Query Strategy

For pending todos, python-caldav may send **three separate queries** to work around server quirks:

```python
# From search.py lines 417-433
if (
    calendar.client.features.is_supported("search.text")
    and calendar.client.features.is_supported("search.combined-is-logical-and")
    and (not calendar.client.features.is_supported("search.recurrences.includes-implicit.todo")
         or calendar.client.features.is_supported("search.recurrences.includes-implicit.todo.pending"))
):
    matches = []
    for hacks in ("ignore_completed1", "ignore_completed2", "ignore_completed3"):
        matches.extend(
            clone.search(calendar, server_expand, split_expanded=False,
                        props=props, xml=xml, _hacks=hacks)
        )
```

Each "hack" builds a different XML query targeting different edge cases:

**Query 1: `ignore_completed1`** (RFC-compliant approach):
```python
# From search.py lines 659-661
if _hacks == "ignore_completed1":
    ## This query is quite much in line with RFC4791 section 7.8.9
    filters.extend([vNoCompleteDate, vStatusNotCompleted, vStatusNotCancelled])
```

Generated XML:
```xml
<C:comp-filter name="VTODO">
  <C:time-range start="..." end="..."/>
  <C:prop-filter name="COMPLETED">
    <C:is-not-defined/>
  </C:prop-filter>
  <C:prop-filter name="STATUS">
    <C:text-match negate-condition="yes">COMPLETED</C:text-match>
  </C:prop-filter>
  <C:prop-filter name="STATUS">
    <C:text-match negate-condition="yes">CANCELLED</C:text-match>
  </C:prop-filter>
</C:comp-filter>
```

**Query 2: `ignore_completed2`** (workaround for Nextcloud/Baikal):
```python
# From search.py lines 662-670
elif _hacks == "ignore_completed2":
    ## some server implementations (i.e. NextCloud and Baikal) will yield
    ## "false" on a negated TextMatch if the field is not defined.
    filters.extend([vNoCompleteDate, vStatusNotDefined])
```

These servers have a bug where `<text-match negate-condition="yes">COMPLETED</text-match>` returns false if STATUS is not defined at all. So we need a separate query asking for todos where STATUS is not defined.

**Query 3: `ignore_completed3`** (recurring tasks):
```python
# From search.py lines 671-676
elif _hacks == "ignore_completed3":
    ## considering recurring tasks we need to look a third time for any
    ## task with the NEEDS-ACTION status set
    filters.extend([vStatusNeedsAction])
```

Recurring tasks may have some completed instances but future pending instances. This query finds tasks explicitly marked NEEDS-ACTION.

The results from all three queries are deduplicated:
```python
# From search.py lines 444-449
objects = []
match_set = set()
for item in matches:
    if item.url not in match_set:
        match_set.add(item.url)
        objects.append(item)
```

### The `vtodo_datesearch_*` Compatibility Flags

These flags modify client behavior based on known server bugs:

**In test code** (`test_caldav.py` lines 2621-2627):
```python
foo = 5  # Expected number of todos
if not self.is_supported("search.recurrences.includes-implicit.todo"):
    foo -= 1  ## t6 (recurring todo) will not be returned
if self.check_compatibility_flag("vtodo_datesearch_nodtstart_task_is_skipped") or \
   self.check_compatibility_flag("vtodo_datesearch_nodtstart_task_is_skipped_in_closed_date_range"):
    foo -= 2  ## t1 and t4 (todos without DTSTART) not returned
elif self.check_compatibility_flag("vtodo_datesearch_notime_task_is_skipped"):
    foo -= 1  ## t4 (todo with neither DTSTART nor DUE) not returned
assert len(todos1) == foo
```

The test adjusts expectations based on server capabilities, but in production code these flags would trigger:
1. Client-side post-filtering (to catch missing todos)
2. Alternative query strategies (e.g., fetch all todos, filter client-side)
3. Warning messages to the application

### Handling Recurrences in Time-Range Searches

When `search.recurrences.includes-implicit` is unsupported, the library has two options:

**Option 1: Server-side expansion** (if supported):
```python
# From search.py lines 286-292
if self.expand or server_expand:
    if not self.start or not self.end:
        raise error.ReportError("can't expand without a date range")
```

This asks the server to expand recurrences into individual instances:
```xml
<C:calendar-query>
  <D:prop>
    <C:calendar-data>
      <C:expand start="20230101T000000Z" end="20230201T000000Z"/>
    </C:calendar-data>
  </D:prop>
  <!-- ... filters ... -->
</C:calendar-query>
```

**Option 2: Client-side expansion** (default since v2.0):
```python
# From search.py lines 313-314
# Expanded date searches will now by default do client-side expand
# This gives better consistency and probably improved performance
```

Client-side expansion:
1. Fetch master recurring event from server
2. Use icalendar library to expand RRULE into instances
3. Check each instance against time range
4. Return matching instances

This is more reliable because:
- Many servers have broken server-side expansion
- Client has full control over the expansion algorithm
- Consistent behavior across all servers

## Implementation Guidance

For developers building a new CalDAV client, here's how to implement robust time-range searches:

### 1. Detecting Time-Range Accuracy

**Probe the server** (if you maintain a server compatibility database):

```python
from caldav import DAVClient

client = DAVClient(url="https://example.com/caldav", username="user", password="pass")

# Check feature support
if client.features.is_supported("search.time-range.accurate"):
    # Server claims accurate time-range filtering
    use_server_filtering = True
else:
    # Server is known to return extra results
    use_server_filtering = False
    enable_client_side_filtering = True
```

**Test empirically**:
1. Create a test event: `DTSTART=2023-01-15T10:00:00Z`, `DTEND=2023-01-15T11:00:00Z`
2. Search for time range: `2023-01-16` to `2023-01-17` (should NOT match)
3. If server returns the event, mark `search.time-range.accurate: unsupported`

**Test with recurring events**:
1. Create: `DTSTART=2023-01-01`, `RRULE:FREQ=WEEKLY;COUNT=4` (4 weeks only)
2. Search for `2023-03-01` to `2023-03-31` (should NOT match - last instance is ~Jan 22)
3. If server returns it, mark `search.time-range.accurate: unsupported`

### 2. Implementing Client-Side Time-Range Filtering

**Basic algorithm**:

```python
from datetime import datetime, timedelta
from icalendar import Calendar, Event as iCalEvent

def event_overlaps_range(event: iCalEvent, search_start: datetime, search_end: datetime) -> bool:
    """
    Check if an event overlaps the search range per RFC 4791 section 9.9.

    Returns True if: (event_start < search_end) AND (event_end > search_start)
    """
    dtstart = event.get('DTSTART').dt

    # Determine event end
    if 'DTEND' in event:
        dtend = event.get('DTEND').dt
    elif 'DURATION' in event:
        duration = event.get('DURATION').dt
        dtend = dtstart + duration
    else:
        # No DTEND or DURATION: zero-duration event
        dtend = dtstart

    # Handle DATE vs DATETIME
    if not isinstance(dtstart, datetime):
        # DATE-only: treat as all-day (entire day)
        dtstart = datetime.combine(dtstart, datetime.min.time())
        dtend = datetime.combine(dtend, datetime.max.time())

    # Check overlap
    return (dtstart < search_end) and (dtend > search_start)
```

**For recurring events**, use the icalendar library's recurrence expansion:

```python
from icalendar import Calendar
from dateutil.rrule import rrulestr

def get_recurrence_instances(event: iCalEvent, search_start: datetime, search_end: datetime):
    """
    Expand recurring event into instances within the search range.
    """
    dtstart = event.get('DTSTART').dt
    rrule_str = event.get('RRULE').to_ical().decode('utf-8')

    # Parse RRULE
    rrule = rrulestr(rrule_str, dtstart=dtstart)

    # Get instances in range (with some buffer for all-day events)
    buffer = timedelta(days=1)
    instances = rrule.between(search_start - buffer, search_end + buffer, inc=True)

    # Check each instance for actual overlap
    matches = []
    duration = get_event_duration(event)
    for instance_start in instances:
        instance_end = instance_start + duration
        if (instance_start < search_end) and (instance_end > search_start):
            matches.append(instance_start)

    return matches
```

### 3. Handling Edge Cases

**Case 1: VTODO without DTSTART**

```python
def todo_overlaps_range(todo: iCalEvent, search_start: datetime, search_end: datetime) -> bool:
    """
    Handle todos per RFC 4791 section 9.9.
    """
    dtstart = todo.get('DTSTART')
    due = todo.get('DUE')

    if not dtstart and not due:
        # No dates: does not overlap any range (per RFC)
        return False

    if dtstart and due:
        # Both present: same as VEVENT
        dtstart = dtstart.dt
        due = due.dt
        return (dtstart < search_end) and (due > search_start)

    if dtstart and not due:
        # DTSTART only: infinite duration into future
        # Overlap if DTSTART < search_end
        dtstart = dtstart.dt
        return dtstart < search_end

    if due and not dtstart:
        # DUE only: infinite duration into past
        # Overlap if DUE > search_start
        due = due.dt
        return due > search_start
```

**However**, many servers don't implement this correctly. **Better approach**: If you know the server has `vtodo_datesearch_nodtstart_task_is_skipped`, skip the server-side time filter for todos and do it all client-side:

```python
if server_has_flag('vtodo_datesearch_nodtstart_task_is_skipped'):
    # Fetch ALL todos, filter client-side
    todos = calendar.search(comp_filter='VTODO')  # No time filter
    todos = [t for t in todos if todo_overlaps_range(t, start, end)]
else:
    # Server is reliable, use server-side filtering
    todos = calendar.search(comp_filter='VTODO', start=start, end=end)
```

**Case 2: Infinite recurrences**

For `RRULE:FREQ=YEARLY` with no COUNT or UNTIL, you cannot expand infinitely. Options:

1. **Limit expansion** to a reasonable range (e.g., 10 years from search_start):
```python
if rrule.count is None and rrule.until is None:
    # Infinite recurrence: limit expansion
    expansion_limit = search_start + timedelta(days=365 * 10)
    instances = rrule.between(search_start, min(search_end, expansion_limit), inc=True)
```

2. **Check if master event would recur** into the search range mathematically:
```python
def infinite_rrule_overlaps(dtstart, freq, search_start, search_end):
    """
    For infinite recurrences, check if *any* instance could fall in range.
    """
    if freq == 'YEARLY':
        # Would it recur into this year?
        years_diff = search_start.year - dtstart.year
        if years_diff < 0:
            return True  # Master is in future
        # Check if an instance falls in search range
        candidate = dtstart.replace(year=search_start.year)
        if candidate >= search_start and candidate < search_end:
            return True
        candidate = dtstart.replace(year=search_end.year)
        if candidate >= search_start and candidate < search_end:
            return True
    # Similar logic for MONTHLY, WEEKLY, DAILY
    return False
```

**Case 3: Open-ended searches**

If the server has `no_search_openended`, provide bounds:

```python
if search_start and not search_end:
    if server_has_flag('no_search_openended'):
        # Provide a far-future end date
        search_end = datetime(2099, 12, 31, 23, 59, 59)

if search_end and not search_start:
    if server_has_flag('no_search_openended'):
        # Provide a far-past start date
        search_start = datetime(1970, 1, 1, 0, 0, 0)
```

### 4. Best Practices for Todo Time-Range Searches

Given the widespread server incompatibility with todo searches, **best practice** is:

**For small calendars**: Always fetch all todos, filter client-side
```python
def search_todos_robust(calendar, start=None, end=None, include_completed=False):
    """
    Robust todo search that works on all servers.
    """
    # Fetch all todos (no server-side time filter)
    all_todos = calendar.search(comp_filter='VTODO')

    # Client-side filtering
    results = []
    for todo in all_todos:
        # Filter by completion status
        if not include_completed and todo.get('STATUS') in ['COMPLETED', 'CANCELLED']:
            continue
        if not include_completed and todo.get('COMPLETED'):
            continue

        # Filter by time range
        if start or end:
            if not todo_overlaps_range(todo, start, end):
                continue

        results.append(todo)

    return results
```

**For large calendars**: Try server-side filtering first, validate results client-side
```python
def search_todos_hybrid(calendar, start=None, end=None):
    """
    Hybrid approach: try server filtering, validate client-side.
    """
    # Try server-side filter
    todos = calendar.search(comp_filter='VTODO', start=start, end=end)

    # Validate each result
    validated = []
    for todo in todos:
        if todo_overlaps_range(todo, start, end):
            validated.append(todo)
        else:
            logging.warning(f"Server returned out-of-range todo: {todo.get('UID')}")

    # Check if we might be missing results
    if calendar.client.features.is_supported('vtodo_datesearch_nodtstart_task_is_skipped'):
        # Fetch todos without DTSTART separately
        all_todos = calendar.search(comp_filter='VTODO')
        for todo in all_todos:
            if todo not in validated:
                if not todo.get('DTSTART') and todo_overlaps_range(todo, start, end):
                    validated.append(todo)

    return validated
```

### 5. Complete Example: Robust Search Implementation

```python
from caldav import DAVClient, Calendar
from datetime import datetime, timedelta
from icalendar import Calendar as iCalendar
import logging

class RobustCalDAVSearch:
    def __init__(self, calendar: Calendar):
        self.calendar = calendar
        self.client = calendar.client

    def search_events(self, start: datetime, end: datetime, post_filter=None):
        """
        Search for events with automatic workarounds.
        """
        # Auto-detect if post-filtering is needed
        if post_filter is None:
            post_filter = not self.client.features.is_supported("search.time-range.accurate")

        # Perform server-side search
        events = self.calendar.search(
            start=start,
            end=end,
            event=True,
            expand=True  # Client-side expansion for reliability
        )

        if post_filter:
            # Validate each result
            events = [e for e in events if self._event_overlaps(e, start, end)]

        return events

    def search_todos(self, start: datetime = None, end: datetime = None,
                     include_completed=False):
        """
        Search for todos with extensive workarounds.
        """
        # Check if server has known todo search issues
        has_dtstart_issue = self.client.features.is_supported(
            "vtodo_datesearch_nodtstart_task_is_skipped"
        )

        if has_dtstart_issue or not self.client.features.is_supported("search.time-range.todo"):
            # Fetch all todos, filter client-side
            todos = self.calendar.search(todo=True)
        else:
            # Try server-side filtering
            todos = self.calendar.search(todo=True, start=start, end=end)

        # Client-side filtering
        results = []
        for todo in todos:
            # Completion filter
            if not include_completed:
                if todo.icalendar_instance.get('STATUS') in ['COMPLETED', 'CANCELLED']:
                    continue
                if todo.icalendar_instance.get('COMPLETED'):
                    continue

            # Time range filter
            if start or end:
                if not self._todo_overlaps(todo, start, end):
                    continue

            results.append(todo)

        return results

    def _event_overlaps(self, event, search_start, search_end):
        """Client-side overlap check for events."""
        component = event.icalendar_component

        dtstart = component.get('DTSTART').dt if component.get('DTSTART') else None
        if not dtstart:
            return False

        # Calculate end
        if component.get('DTEND'):
            dtend = component.get('DTEND').dt
        elif component.get('DURATION'):
            dtend = dtstart + component.get('DURATION').dt
        else:
            dtend = dtstart

        # Handle DATE-only
        if not isinstance(dtstart, datetime):
            dtstart = datetime.combine(dtstart, datetime.min.time())
            dtend = datetime.combine(dtend, datetime.max.time())

        return (dtstart < search_end) and (dtend > search_start)

    def _todo_overlaps(self, todo, search_start, search_end):
        """Client-side overlap check for todos."""
        component = todo.icalendar_component

        dtstart = component.get('DTSTART')
        due = component.get('DUE')

        if not dtstart and not due:
            # Per RFC: no overlap
            # But some clients may want to include these as "inbox tasks"
            return False

        if dtstart and due:
            dtstart = dtstart.dt
            due = due.dt
            return (dtstart < search_end) and (due > search_start)

        if dtstart:
            dtstart = dtstart.dt
            # Infinite into future: overlap if starts before search_end
            return dtstart < search_end if search_end else True

        if due:
            due = due.dt
            # Infinite into past: overlap if due after search_start
            return due > search_start if search_start else True
```

## Summary

Time-range searches are fundamentally broken on many CalDAV servers. The python-caldav library demonstrates that **robust CalDAV clients must**:

1. **Never trust server-side time-range filtering** without validation
2. **Implement complete client-side filtering** logic per RFC 4791 section 9.9
3. **Use server compatibility flags** to adapt behavior per server
4. **Prefer client-side recurrence expansion** over server-side
5. **Handle todos specially** with multiple fallback strategies
6. **Validate all results** when server reliability is unknown

The complexity of these workarounds highlights a critical failure in CalDAV server implementations to comply with a core specification. Until server implementations improve, CalDAV client developers must treat time-range searches as advisory at best, always verifying results client-side.
