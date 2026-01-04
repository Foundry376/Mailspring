# Recurrence Expansion Compatibility Issues

## 1. Issue Summary

**The Problem:** When searching for recurring calendar events or tasks with time ranges, CalDAV servers are supposed to "expand" the recurrence rules to show individual occurrences within that range. According to RFC 4791, servers **MUST** support expansion when requested via the `<expand>` element. However, in practice, many popular CalDAV servers either:

1. **Don't expand at all** - They ignore the expand request and return the master event with RRULE intact
2. **Expand but deliver broken data** - Most commonly missing the critical `RECURRENCE-ID` property that identifies which occurrence this is
3. **Handle exceptions incorrectly** - When a recurring event has modified or deleted instances (via EXDATE, EXRULE, or overridden instances), expansion may produce incorrect results

This is particularly problematic because:
- Without `RECURRENCE-ID`, clients cannot distinguish between different occurrences
- Modified instances in a recurrence set cannot be properly identified
- Timezone information may be lost or corrupted during expansion
- Different behavior between events (VEVENT) and todos (VTODO)

**python-caldav's Solution (v2.0+):** The library defaults to **client-side expansion** regardless of server capabilities, using the `recurring_ical_events` library. This ensures consistent behavior across all servers, though at the cost of potentially transferring more data.

---

## 2. RFC Specification

### RFC 4791 Section 9.6.5 - CALDAV:expand XML Element

**Specification:** [https://datatracker.ietf.org/doc/html/rfc4791#section-9.6.5](https://datatracker.ietf.org/doc/html/rfc4791#section-9.6.5)

**What the RFC Says:**

The `<expand>` element is used in a `CALDAV:calendar-query` REPORT to request that the server expand recurring components within a specified time range.

```xml
<!ELEMENT expand EMPTY>
<!ATTLIST expand start CDATA #REQUIRED
                 end   CDATA #REQUIRED>
```

**Server Requirements:**

1. **MUST expand recurring components** - "The server MUST expand recurrences that overlap the time range specified in the start/end attributes"

2. **MUST add RECURRENCE-ID** - Each expanded instance MUST include a `RECURRENCE-ID` property indicating which occurrence of the recurrence it represents

3. **MUST preserve timezone information** - The server MUST maintain accurate timezone data for each occurrence

4. **MUST handle exceptions** - Events with `EXDATE`, `EXRULE`, or modified instances must be expanded correctly, excluding deleted instances and using the modified data for overridden instances

5. **Master component transformation** - The master recurring component (with RRULE) should be replaced by individual instances with RECURRENCE-ID

**From RFC 4791:**

> "The recurrence set generated with a recurrence rule (i.e., the "RRULE" property), or recurrence set (i.e., "RDATE" and "EXDATE" properties), MAY be limited by the server. However, the server MUST expand the recurrence set for the time range specified by the start and end attributes."

---

## 3. Real-World Server Behaviors

Based on `caldav/compatibility_hints.py` and extensive testing documented in the python-caldav project:

### Servers That Don't Expand At All

**Xandikos (v0.2.12 and v0.3):**
- Configuration: `'search.recurrences.expanded': {'support': 'unsupported'}`
- Behavior: Returns the master event with RRULE intact, ignoring the expand request entirely
- For todos: `'search.recurrences.expanded.todo': {'support': 'unsupported'}`

**SOGo:**
- Configuration: `"search.recurrences.expanded": {"support": "unsupported"}`
- Behavior: Complete lack of expansion support for both events and todos
- Returns 501 Not Implemented or ignores the expand element

**GMX:**
- Configuration: `'search.recurrences.expanded': {'support': 'unsupported'}`
- Behavior: No expansion support whatsoever

### Servers That Expand But With Broken Data

**Multiple servers** commonly exhibit this pattern:
- They do perform the expansion (return multiple instances)
- But **fail to add RECURRENCE-ID** to each instance
- This makes it impossible for clients to:
  - Identify which occurrence this is
  - Modify a single instance
  - Properly handle timezone conversions

From the compatibility hints:
```python
"description": "According to RFC 4791, the server MUST expand recurrence objects
if asked for it - but many server doesn't do that. Some servers don't do expand
at all, others deliver broken data, typically missing RECURRENCE-ID. The python
caldav client library (from 2.0) does the expand-operation client-side no matter
if it's supported or not"
```

### Servers With Exception Handling Problems

**Radicale:**
- Configuration: `"search.recurrences.expanded.exception": {"support": "unsupported"}`
- Behavior: Basic expansion works, but fails when the recurrence set includes exceptions (EXDATE, modified instances)

**Baikal:**
- Configuration: `'search.recurrences.expanded.exception': {'support': 'unsupported'}`
- Behavior: Similar to Radicale - can't handle exceptions in recurrence sets correctly

**Nextcloud:**
- Configuration: `'search.recurrences.expanded.exception': {'support': 'unsupported'}`
- Behavior: Expansion of simple recurring events works, but breaks with exceptions

**Xandikos (v0.2.12):**
- Has special issues with dates vs. timestamps in recurrence expansion
- From notes: "The test with an rrule and an overridden event passes as long as it's with timestamps. With dates, xandikos gets into troubles"

**Bedework:**
- Configuration:
  - `"search.recurrences.expanded.exception": {"support": "unsupported"}`
  - `"search.recurrences.expanded.event": {"support": "unsupported"}`
- Behavior: Very limited expansion support

**Robur:**
- Special bug: `'robur_rrule_freq_yearly_expands_monthly'`
- Description: "Robur expands a yearly event into a monthly event"
- This is a critical bug where the recurrence frequency itself is misinterpreted

### Event vs Todo Expansion Differences

Many servers treat VEVENTs and VTODOs differently:

**Radicale:**
- Events: Basic expansion works
- Todos: `"search.recurrences.expanded.todo": {"support": "unsupported"}`

**Nextcloud:**
- Events: Partial support (without exceptions)
- Todos: `'search.recurrences.expanded.todo': {'support': 'unsupported'}`

**Baikal:**
- Similar pattern - todo expansion not supported even when event expansion partially works

**Xandikos:**
- Todo expansion completely unsupported

**DAViCal:**
- Configuration: `"search.recurrences.expanded.todo": {"support": "unsupported"}`
- Events work better than todos

### Servers With Working Expansion

Very few servers implement expansion fully correctly. The python-caldav project's extensive testing hasn't found any server that handles all edge cases perfectly.

---

## 4. python-caldav Workarounds

The python-caldav library implements several sophisticated workarounds to ensure consistent behavior across servers.

### Client-Side Expansion as Default

**Since version 2.0**, the library defaults to client-side expansion:

```python
# From caldav/search.py, lines 290-292
if self.expand or server_expand:
    if not self.start or not self.end:
        raise error.ReportError("can't expand without a date range")
```

The expansion is performed using the `recurring_ical_events` library:

```python
# From caldav/calendarobjectresource.py, lines 239-270
import recurring_ical_events

recurrings = recurring_ical_events.of(
    self.icalendar_instance, components=["VJOURNAL", "VTODO", "VEVENT"]
).between(start, end)

# Verify RECURRENCE-ID is present
error.assert_(
    not any(
        x
        for x in recurrings
        if not recurrence_properties.isdisjoint(set(x.keys()))
    )
)

# Add RECURRENCE-ID if missing (some servers forget it)
for occurrence in recurrings:
    if "RECURRENCE-ID" not in occurrence:
        occurrence.add("RECURRENCE-ID", occurrence.get("DTSTART").dt)
    calendar.add_component(occurrence)
```

**Note:** There's a TODO comment in the code (line 265): "If there are no reports of missing RECURRENCE-ID until 2027, the if-statement below may be deleted" - indicating they're monitoring whether servers are improving.

### The `server_expand` Parameter

Users can explicitly control expansion behavior:

```python
# Force server-side expansion (risky, may get broken data)
calendar.search(start=start, end=end, server_expand=True)

# Force client-side expansion (safer, default behavior)
calendar.search(start=start, end=end, expand=True)
```

**From the documentation (caldav/search.py lines 233-234):**
```python
:param server_expand: Ask the CalDAV server to expand recurrences
:param split_expanded: Don't collect a recurrence set in one ical calendar
```

**Key implementation detail (lines 286-288):**
```python
## split_expanded should only take effect on expanded data
if not self.expand and not server_expand:
    split_expanded = False
```

### Building the Expand Request

When server expansion is requested, the library builds this XML (from `caldav/search.py`, lines 625-629):

```python
data = cdav.CalendarData()
if server_expand:
    if not self.start or not self.end:
        raise error.ReportError("can't expand without a date range")
    data += cdav.Expand(self.start, self.end)
```

The `Expand` element (from `caldav/elements/cdav.py`, lines 136-151):

```python
class Expand(BaseElement):
    tag: ClassVar[str] = ns("C", "expand")

    def __init__(
        self, start: Optional[datetime], end: Optional[datetime] = None
    ) -> None:
        super(Expand, self).__init__()

        if self.attributes is None:
            raise ValueError("Unexpected value None for self.attributes")

        if start is not None:
            self.attributes["start"] = _to_utc_date_string(start)
        if end is not None:
            self.attributes["end"] = _to_utc_date_string(end)
```

### The `split_expanded` Logic

This is one of the most important workarounds. When a server expands recurrences, it may return:

1. **One VCALENDAR with multiple VEVENT/VTODO subcomponents** (each with RECURRENCE-ID)
2. **Multiple VCALENDAR objects**, each with one VEVENT/VTODO

The `split_expanded` parameter (default: `True`) controls how this is handled:

```python
# From caldav/search.py, lines 543-608
def filter(
    self,
    objects: List[CalendarObjectResource],
    post_filter: Optional[bool] = None,
    split_expanded: bool = True,
    server_expand: bool = False,
) -> List[CalendarObjectResource]:
    """Apply client-side filtering and handle recurrence expansion/splitting.

    :param split_expanded: Whether to split recurrence sets into multiple
        separate CalendarObjectResource objects. If False, a recurrence set
        will be contained in a single object with multiple subcomponents.
    """
    if post_filter or self.expand or (split_expanded and server_expand):
        objects_ = objects
        objects = []
        for o in objects_:
            if self.expand or post_filter:
                filtered = self.check_component(o, expand_only=not post_filter)
                if not filtered:
                    continue
            else:
                filtered = [
                    x
                    for x in o.icalendar_instance.subcomponents
                    if not isinstance(x, Timezone)
                ]

            # Preserve timezone components
            i = o.icalendar_instance
            tz_ = [x for x in i.subcomponents if isinstance(x, Timezone)]
            i.subcomponents = tz_

            for comp in filtered:
                if isinstance(comp, Timezone):
                    continue
                if split_expanded:
                    # Create a new CalendarObjectResource for each occurrence
                    new_obj = o.copy(keep_uid=True)
                    new_i = new_obj.icalendar_instance
                    new_i.subcomponents = []
                    # Add timezone to each split occurrence
                    for tz in tz_:
                        new_i.add_component(tz)
                    objects.append(new_obj)
                else:
                    new_i = i
                new_i.add_component(comp)
            if not (split_expanded):
                objects.append(o)
    return objects
```

**Key points:**

1. **Timezone preservation:** Each split occurrence gets a copy of the VTIMEZONE component
2. **UID preservation:** `copy(keep_uid=True)` ensures all instances have the same UID
3. **Subcomponent isolation:** Each occurrence becomes its own CalendarObjectResource

### Handling Exceptions in Recurrence Sets

The library has special handling for recurrence sets with exceptions:

```python
# Recurrence properties that indicate this is part of a recurrence set
recurrence_properties = {"exdate", "exrule", "rdate", "rrule"}

# Verify we got expanded instances, not the master + exceptions
error.assert_(
    not any(
        x
        for x in recurrings
        if not recurrence_properties.isdisjoint(set(x.keys()))
    )
)
```

This assertion ensures that after expansion, none of the returned components have recurrence properties - they should all be individual instances with RECURRENCE-ID.

### Completed Task Filtering

Special logic for recurring tasks (from `caldav/search.py`, lines 367-442):

```python
if self.todo and not self.include_completed:
    # Clone the searcher to avoid modifying the original
    clone = replace(self, include_completed=True)
    clone.include_completed = True
    clone.expand = False  # Don't expand in subqueries

    # For servers supporting text search and combined queries,
    # send three different searches to ensure we get all pending tasks
    if (
        calendar.client.features.is_supported("search.text")
        and calendar.client.features.is_supported("search.combined-is-logical-and")
        # ... more conditions ...
    ):
        matches = []
        for hacks in (
            "ignore_completed1",
            "ignore_completed2",
            "ignore_completed3",
        ):
            matches.extend(
                clone.search(
                    calendar,
                    server_expand,
                    split_expanded=False,  # Don't split in subqueries
                    props=props,
                    xml=xml,
                    _hacks=hacks,
                )
            )
```

This complex logic sends **three separate queries** because:
1. Some servers filter completed tasks incorrectly
2. Recurring tasks may have some completed instances and some pending instances
3. The STATUS property handling varies across servers

### Complete Workaround Example

Here's how a typical search with expansion works:

```python
# User code
events = calendar.search(
    start=datetime(2024, 1, 1),
    end=datetime(2024, 12, 31),
    expand=True  # Client-side expansion
)

# What happens internally:
# 1. Library sends query WITHOUT <expand> element to server
# 2. Server returns master event with RRULE
# 3. Library uses recurring_ical_events to expand client-side
# 4. Library adds RECURRENCE-ID to each instance
# 5. Library splits into separate CalendarObjectResource objects
# 6. Each object preserves VTIMEZONE components
# 7. Returns list of individual occurrences
```

---

## 5. Implementation Guidance

For developers building a new CalDAV client, here are the key learnings from python-caldav's approach:

### When to Use Server-Side vs Client-Side Expansion

**Use Client-Side Expansion (Recommended):**
- ✅ Ensures consistent behavior across all servers
- ✅ Guarantees RECURRENCE-ID is present
- ✅ Handles exceptions correctly
- ✅ Preserves timezone information
- ❌ Requires downloading the full event with RRULE
- ❌ More complex client implementation
- ❌ Bandwidth inefficient for large recurrence sets

**Use Server-Side Expansion:**
- ✅ More bandwidth efficient (server only sends matching instances)
- ✅ Less client processing required
- ❌ Broken on most servers
- ❌ May receive data without RECURRENCE-ID
- ❌ Exception handling often incorrect
- ❌ Timezone issues common

**Recommended Strategy:**
```python
# Try client-side expansion by default
def search_with_expansion(calendar, start, end):
    # Don't request server expansion
    results = calendar.search(start, end)

    # Expand client-side using a robust library
    expanded = []
    for event in results:
        if has_recurrence_rule(event):
            expanded.extend(expand_rrule(event, start, end))
        else:
            expanded.append(event)

    return expanded
```

### How to Detect if Server Expansion Works

**Probing Strategy:**

```python
def test_server_expansion(calendar):
    """Test if server properly supports expansion."""

    # Create a simple recurring event
    test_event = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-expansion-{uuid}
DTSTART:20240101T100000Z
DTEND:20240101T110000Z
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Test Expansion
END:VEVENT
END:VCALENDAR"""

    # Save it
    calendar.save_event(test_event)

    # Request with expansion
    results = calendar.search(
        start=datetime(2024, 1, 1),
        end=datetime(2024, 1, 5),
        server_expand=True
    )

    # Check results
    if len(results) != 3:
        return "expansion_failed"  # Server didn't expand

    # Check for RECURRENCE-ID
    for event in results:
        if "RECURRENCE-ID" not in event.icalendar_component:
            return "missing_recurrence_id"  # Broken expansion

        # Check that RRULE is removed (not present in instances)
        if "RRULE" in event.icalendar_component:
            return "rrule_not_removed"  # Server returned master + instances

    return "supported"  # Server expansion works correctly
```

**Configuration Management:**

```python
# Store results in compatibility hints
server_capabilities = {
    "search.recurrences.expanded": {
        "support": test_result,
        "tested": datetime.now().isoformat()
    }
}
```

### How to Handle RECURRENCE-ID Correctly

**Critical Implementation Requirements:**

1. **Always Add RECURRENCE-ID When Expanding:**

```python
def expand_occurrence(master_event, occurrence_start):
    """Create an occurrence from a master event."""
    occurrence = master_event.copy()

    # Remove recurrence properties
    for prop in ["RRULE", "RDATE", "EXDATE", "EXRULE"]:
        occurrence.pop(prop, None)

    # Add RECURRENCE-ID matching the occurrence time
    occurrence.add("RECURRENCE-ID", occurrence_start)

    # Adjust DTSTART to match (may differ for modified instances)
    occurrence.pop("DTSTART", None)
    occurrence.add("DTSTART", occurrence_start)

    return occurrence
```

2. **Match RECURRENCE-ID Format to DTSTART:**

```python
def ensure_recurrence_id_format(component):
    """Ensure RECURRENCE-ID has the same format as DTSTART."""
    dtstart = component.get("DTSTART")
    recurrence_id = component.get("RECURRENCE-ID")

    if dtstart and recurrence_id:
        # Both should be either DATE or DATE-TIME
        if isinstance(dtstart.dt, date) and not isinstance(dtstart.dt, datetime):
            # DATE format
            if isinstance(recurrence_id.dt, datetime):
                # Convert to date
                component.pop("RECURRENCE-ID")
                component.add("RECURRENCE-ID", recurrence_id.dt.date())
        elif isinstance(dtstart.dt, datetime):
            # DATE-TIME format
            if not isinstance(recurrence_id.dt, datetime):
                # This shouldn't happen, but handle it
                logging.warning("RECURRENCE-ID is date but DTSTART is datetime")
```

3. **Handle Modified Instances:**

```python
def merge_modified_instances(master, modified_instances, start, end):
    """Merge modified instances into expanded recurrence set."""

    # Expand the master RRULE
    all_occurrences = expand_rrule(master, start, end)

    # Build map of RECURRENCE-ID to modified instance
    modified_map = {}
    for instance in modified_instances:
        rid = instance.get("RECURRENCE-ID")
        if rid:
            modified_map[rid.dt] = instance

    # Replace base occurrences with modified instances
    result = []
    for occurrence in all_occurrences:
        rid = occurrence.get("RECURRENCE-ID").dt
        if rid in modified_map:
            result.append(modified_map[rid])  # Use modified instance
            modified_map.pop(rid)  # Remove from map
        else:
            result.append(occurrence)  # Use base occurrence

    # Add any extra modified instances (shouldn't happen normally)
    result.extend(modified_map.values())

    return result
```

### Timezone Preservation During Expansion

**Critical Considerations:**

1. **Always Preserve VTIMEZONE Components:**

```python
def split_with_timezone(calendar_obj):
    """Split expanded occurrences while preserving timezone."""

    # Extract timezone components
    timezones = [
        comp for comp in calendar_obj.subcomponents
        if comp.name == "VTIMEZONE"
    ]

    # Extract event/todo components
    events = [
        comp for comp in calendar_obj.subcomponents
        if comp.name in ("VEVENT", "VTODO", "VJOURNAL")
    ]

    # Create separate calendar for each occurrence
    results = []
    for event in events:
        new_cal = icalendar.Calendar()
        new_cal.add('prodid', calendar_obj.get('prodid'))
        new_cal.add('version', calendar_obj.get('version'))

        # Add timezone components
        for tz in timezones:
            new_cal.add_component(tz)

        # Add the event
        new_cal.add_component(event)

        results.append(new_cal)

    return results
```

2. **Convert to UTC When Necessary:**

```python
def normalize_datetime_for_comparison(dt, tzinfo_map):
    """Normalize datetime to UTC for reliable comparison.

    Args:
        dt: datetime or date object
        tzinfo_map: dict mapping TZID to icalendar.Timezone

    Returns:
        datetime in UTC (or date if input was date)
    """
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt  # Dates don't need timezone conversion

    if not hasattr(dt, 'tzinfo'):
        return dt  # Already a date

    if dt.tzinfo is None:
        # Floating time - treat as local
        # (This is ambiguous - consider warning the user)
        import tzlocal
        dt = dt.replace(tzinfo=tzlocal.get_localzone())

    # Convert to UTC
    return dt.astimezone(timezone.utc)
```

3. **Handle Different Timezone Formats:**

```python
# RFC 5545 supports three datetime formats:
# 1. DATE: 20240101
# 2. DATE-TIME (floating): 20240101T100000
# 3. DATE-TIME (with timezone): 20240101T100000Z or with TZID

def parse_ical_datetime(ical_dt, tzinfo_map):
    """Parse iCalendar datetime with proper timezone handling."""

    if isinstance(ical_dt.dt, date) and not isinstance(ical_dt.dt, datetime):
        # DATE format - no timezone
        return ical_dt.dt

    dt = ical_dt.dt

    # Check for TZID parameter
    tzid = ical_dt.params.get('TZID')
    if tzid and tzid in tzinfo_map:
        # Use the VTIMEZONE definition
        tz = tzinfo_map[tzid]
        dt = dt.replace(tzinfo=tz)
    elif dt.tzinfo is None:
        # Floating time - no timezone specified
        # Keep as-is, but mark it somehow for the user
        pass

    return dt
```

### Complete Working Example

Here's a complete, production-ready implementation:

```python
from datetime import datetime, timezone
from typing import List
import icalendar
from recurring_ical_events import of as expand_rrule

class CalDAVClient:
    """Example CalDAV client with robust expansion support."""

    def search_with_expansion(
        self,
        calendar,
        start: datetime,
        end: datetime,
        expand: bool = True,
        server_expand: bool = False
    ) -> List[icalendar.Calendar]:
        """
        Search calendar with recurrence expansion.

        Args:
            calendar: Calendar object to search
            start: Start of time range
            end: End of time range
            expand: Whether to expand recurrences (default: True)
            server_expand: Whether to try server-side expansion (default: False)

        Returns:
            List of calendar objects (one per occurrence)
        """
        # Build search query
        if server_expand and expand:
            # Try server-side expansion
            query = self._build_search_query(start, end, with_expand=True)
        else:
            # Don't request expansion from server
            query = self._build_search_query(start, end, with_expand=False)

        # Execute search
        raw_results = self._execute_search(calendar, query)

        # Process results
        if expand and not server_expand:
            # Client-side expansion
            return self._expand_client_side(raw_results, start, end)
        elif expand and server_expand:
            # Validate server expansion
            return self._validate_and_fix_server_expansion(raw_results, start, end)
        else:
            # No expansion requested
            return raw_results

    def _expand_client_side(
        self,
        results: List[icalendar.Calendar],
        start: datetime,
        end: datetime
    ) -> List[icalendar.Calendar]:
        """Expand recurrences client-side."""
        expanded = []

        for cal in results:
            # Check if this has a recurrence rule
            events = [c for c in cal.subcomponents if c.name == "VEVENT"]
            if not events:
                continue

            event = events[0]
            if "RRULE" not in event:
                # Not recurring, add as-is
                expanded.append(cal)
                continue

            # Expand using recurring_ical_events library
            occurrences = expand_rrule(cal).between(start, end)

            # Extract timezone components
            timezones = [c for c in cal.subcomponents if c.name == "VTIMEZONE"]

            # Create separate calendar for each occurrence
            for occurrence in occurrences:
                # Ensure RECURRENCE-ID is present
                if "RECURRENCE-ID" not in occurrence:
                    occurrence.add("RECURRENCE-ID", occurrence["DTSTART"].dt)

                # Ensure recurrence properties are removed
                for prop in ["RRULE", "RDATE", "EXDATE", "EXRULE"]:
                    occurrence.pop(prop, None)

                # Build new calendar object
                new_cal = icalendar.Calendar()
                new_cal.add('prodid', cal.get('prodid', '-//My Client//'))
                new_cal.add('version', cal.get('version', '2.0'))

                # Add timezones
                for tz in timezones:
                    new_cal.add_component(tz)

                # Add occurrence
                new_cal.add_component(occurrence)

                expanded.append(new_cal)

        return expanded

    def _validate_and_fix_server_expansion(
        self,
        results: List[icalendar.Calendar],
        start: datetime,
        end: datetime
    ) -> List[icalendar.Calendar]:
        """Validate server expansion and fix common issues."""
        fixed = []

        for cal in results:
            events = [c for c in cal.subcomponents if c.name == "VEVENT"]
            timezones = [c for c in cal.subcomponents if c.name == "VTIMEZONE"]

            if len(events) == 1:
                # Single event - check if it's an occurrence or master
                event = events[0]

                if "RRULE" in event:
                    # Server didn't expand! Fall back to client-side
                    return self._expand_client_side([cal], start, end)

                # Check for RECURRENCE-ID
                if "RECURRENCE-ID" not in event:
                    # Server expanded but forgot RECURRENCE-ID
                    # Try to infer it from DTSTART
                    event.add("RECURRENCE-ID", event["DTSTART"].dt)

                fixed.append(cal)

            elif len(events) > 1:
                # Multiple events in one calendar - split them
                for event in events:
                    # Check RECURRENCE-ID
                    if "RECURRENCE-ID" not in event:
                        event.add("RECURRENCE-ID", event["DTSTART"].dt)

                    # Remove RRULE if present
                    event.pop("RRULE", None)

                    # Create new calendar for this occurrence
                    new_cal = icalendar.Calendar()
                    new_cal.add('prodid', cal.get('prodid', '-//My Client//'))
                    new_cal.add('version', cal.get('version', '2.0'))

                    # Add timezones
                    for tz in timezones:
                        new_cal.add_component(tz)

                    # Add event
                    new_cal.add_component(event)

                    fixed.append(new_cal)

        return fixed
```

### Summary of Best Practices

1. **Default to client-side expansion** - It's more reliable across servers
2. **Always add RECURRENCE-ID** when expanding, even if the server should do it
3. **Always preserve VTIMEZONE** components when splitting occurrences
4. **Remove RRULE properties** from expanded instances
5. **Handle both DATE and DATE-TIME** formats consistently
6. **Test server capabilities** before relying on server-side expansion
7. **Be prepared to fall back** to client-side if server expansion fails
8. **Validate expanded results** for presence of RECURRENCE-ID
9. **Keep UID consistent** across all instances of the same event
10. **Consider bandwidth vs. correctness** tradeoffs in your use case

---

## Conclusion

Recurrence expansion is one of the most problematic areas of CalDAV compatibility. Despite being a **MUST** requirement in RFC 4791, most servers either don't implement it at all or implement it incorrectly. The python-caldav library's approach of defaulting to client-side expansion is the most pragmatic solution, trading bandwidth efficiency for correctness and consistency.

When building a new CalDAV client, strongly consider implementing robust client-side expansion rather than relying on servers to do it correctly. The complexity is worth it for the reliability it provides.
