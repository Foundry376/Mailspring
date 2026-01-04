# CalDAV "is-not-defined" Filter Compatibility Issues

## Issue Summary

The "is-not-defined" filter is a CalDAV search feature that should allow clients to find calendar objects where specific properties are not present. Despite being part of the CalDAV standard (RFC 4791), this filter has extremely poor and inconsistent support across CalDAV servers. The issues range from complete lack of support, to fragile partial support (working for some properties but not others), to bizarre behavior where negated text matches fail when fields are undefined.

The most critical problem occurs when searching for pending todos: servers like Nextcloud and Baikal incorrectly return `false` for negated TextMatch queries when the field being searched doesn't exist. This breaks the standard approach for finding incomplete tasks and requires complex workarounds.

## RFC Specification

According to **RFC 4791 Section 9.7.4** (CALDAV:is-not-defined XML Element), the `is-not-defined` filter should match when a property is not defined in the iCalendar object:

```xml
<!ELEMENT is-not-defined EMPTY>
```

The specification states:

> The CALDAV:is-not-defined XML element specifies that a match should occur if the enclosing property does not exist in the calendar object data.

**Example from RFC 4791 Section 7.8.9** (searching for pending todos):
```xml
<C:prop-filter name="COMPLETED">
  <C:is-not-defined/>
</C:prop-filter>
<C:prop-filter name="STATUS">
  <C:text-match negate-condition="yes">CANCELLED</C:text-match>
</C:prop-filter>
```

This should find tasks where `COMPLETED` is not defined AND status is not `CANCELLED`. However, many servers fail on this query.

## Real-World Server Behaviors

### Servers with NO Support

The following servers do **not** support `is-not-defined` at all:

- **Zimbra**: Completely unsupported
- **SOGo**: Completely unsupported
- **Robur**: Completely unsupported

Queries using `is-not-defined` will either:
- Return empty results (silently ignoring the filter)
- Return all results (ignoring the filter entirely)
- Throw server errors

### Servers with Fragile/Partial Support

**Radicale** (as of version 3.5.4):
- Support marked as "fragile"
- Behavior: "seems to work for categories but not for dtend"
- Works correctly for some properties (like `CATEGORIES`)
- Fails or returns incorrect results for other properties (like `DTEND`)

**Bedework**:
- Support marked as "fragile"
- Inconsistent behavior across different property types
- Sometimes works, sometimes doesn't - pattern unclear

### The Nextcloud/Baikal Negated TextMatch Bug

**Critical Issue**: Nextcloud and Baikal have a severe bug where **negated TextMatch returns false when the field is undefined**.

**Expected behavior** (per RFC 4791 Section 9.7.5):
```xml
<C:prop-filter name="STATUS">
  <C:text-match negate-condition="yes">COMPLETED</C:text-match>
</C:prop-filter>
```
Should match when:
- STATUS exists AND does not contain "COMPLETED"
- STATUS does not exist at all (undefined)

**Actual Nextcloud/Baikal behavior**:
- STATUS exists AND does not contain "COMPLETED" ✓ (works)
- STATUS does not exist ✗ (returns false, should return true)

This breaks the standard RFC example query for finding pending todos. See [python-caldav issue #14](https://github.com/python-caldav/caldav/issues/14).

**Impact**: You cannot use the standard RFC 4791 Section 7.8.9 query to find pending tasks on these servers.

## python-caldav Workarounds

### 1. The "undef" Operator in Property Filters

python-caldav provides a custom operator `"undef"` to explicitly search for undefined properties:

```python
from caldav import CalDAVSearcher

searcher = CalDAVSearcher(todo=True)
searcher.add_property_filter("COMPLETED", None, operator="undef")
searcher.add_property_filter("STATUS", None, operator="undef")
results = searcher.search(calendar)
```

**Shorthand syntax** using the `no_` prefix:
```python
# Search for events with no DTEND property
events = calendar.search(comp_class=Event, no_dtend=True)

# Search for events with no CATEGORY property
events = calendar.search(comp_class=Event, no_category=True)
```

**Implementation** (from `/tmp/python-caldav/caldav/search.py`, lines 737-739):
```python
if self._property_operator[property] == "undef":
    match = cdav.NotDefined()
    filters.append(cdav.PropFilter(property.upper()) + match)
```

This generates the proper XML element:
```python
class NotDefined(BaseElement):
    tag: ClassVar[str] = ns("C", "is-not-defined")
```

### 2. The Triple-Query Approach for Pending Todos

To work around the Nextcloud/Baikal bug, python-caldav uses **three separate queries** to find all pending tasks:

**Query 1** (`ignore_completed1`): Standard RFC approach
```xml
<!-- No COMPLETED date -->
<C:prop-filter name="COMPLETED">
  <C:is-not-defined/>
</C:prop-filter>
<!-- STATUS not COMPLETED -->
<C:prop-filter name="STATUS">
  <C:text-match negate-condition="yes">COMPLETED</C:text-match>
</C:prop-filter>
<!-- STATUS not CANCELLED -->
<C:prop-filter name="STATUS">
  <C:text-match negate-condition="yes">CANCELLED</C:text-match>
</C:prop-filter>
```

**Query 2** (`ignore_completed2`): Explicit undefined STATUS check
```xml
<!-- No COMPLETED date -->
<C:prop-filter name="COMPLETED">
  <C:is-not-defined/>
</C:prop-filter>
<!-- STATUS field not defined -->
<C:prop-filter name="STATUS">
  <C:is-not-defined/>
</C:prop-filter>
```

This catches tasks that Query 1 missed due to the Nextcloud/Baikal bug.

**Query 3** (`ignore_completed3`): Explicit NEEDS-ACTION check
```xml
<!-- STATUS is NEEDS-ACTION -->
<C:prop-filter name="STATUS">
  <C:text-match>NEEDS-ACTION</C:text-match>
</C:prop-filter>
```

This handles recurring tasks and ensures all pending items are found.

**Code** (from `/tmp/python-caldav/caldav/search.py`, lines 659-676):
```python
vNotCompleted = cdav.TextMatch("COMPLETED", negate=True)
vNotCancelled = cdav.TextMatch("CANCELLED", negate=True)
vNeedsAction = cdav.TextMatch("NEEDS-ACTION")
vStatusNotCompleted = cdav.PropFilter("STATUS") + vNotCompleted
vStatusNotCancelled = cdav.PropFilter("STATUS") + vNotCancelled
vStatusNeedsAction = cdav.PropFilter("STATUS") + vNeedsAction
vStatusNotDefined = cdav.PropFilter("STATUS") + cdav.NotDefined()
vNoCompleteDate = cdav.PropFilter("COMPLETED") + cdav.NotDefined()

if _hacks == "ignore_completed1":
    filters.extend([vNoCompleteDate, vStatusNotCompleted, vStatusNotCancelled])
elif _hacks == "ignore_completed2":
    ## some server implementations (i.e. NextCloud and Baikal) will yield
    ## "false" on a negated TextMatch if the field is not defined.
    filters.extend([vNoCompleteDate, vStatusNotDefined])
elif _hacks == "ignore_completed3":
    ## for recurring tasks with NEEDS-ACTION status
    filters.extend([vStatusNeedsAction])
```

The results from all three queries are merged, with duplicates removed by URL.

### 3. Client-Side Filtering Fallback

When a server doesn't support `is-not-defined` at all, python-caldav can fall back to client-side filtering:

1. Fetch all relevant objects from the server (e.g., all todos)
2. Filter client-side using `icalendar` library to check for missing properties
3. Return only objects matching the criteria

**Test code example** (from `/tmp/python-caldav/tests/test_caldav.py`, lines 1989-1996):
```python
## Search with todo flag set should yield all 6 tasks
## (Except, if the calendar server does not support is-not-defined very
## well, perhaps only 3 will be returned)
all_todos = c.search(todo=True)
if not self.is_supported("search.is-not-defined"):
    assert len(all_todos) - pre_cnt in (3, 6)
else:
    assert len(all_todos) == 6 + pre_cnt
```

## Implementation Guidance

For developers building a new CalDAV client, here's how to handle `is-not-defined` compatibility:

### 1. Detect is-not-defined Support

**Method A: Capability probing**
- Send a test query with `is-not-defined` to a test calendar
- Check if results are correct
- Cache the result per server

**Method B: Server identification**
- Identify the server software from DAV headers or well-known endpoints
- Use a compatibility matrix (like python-caldav's `compatibility_hints.py`)

**Known compatibility matrix** (from `/tmp/python-caldav/caldav/compatibility_hints.py`):
```python
server_support = {
    "radicale": "fragile",      # Works for some properties, not others
    "zimbra": "unsupported",    # Completely broken
    "sogo": "unsupported",      # Completely broken
    "robur": "unsupported",     # Completely broken
    "bedework": "fragile",      # Inconsistent behavior
    "nextcloud": "full",        # Supported, but negated TextMatch bug
    "baikal": "full",           # Supported, but negated TextMatch bug
}
```

### 2. Workaround Patterns for Missing Properties

**Pattern 1: Use the no_ prefix** (python-caldav specific, but easy to implement):
```python
def search_no_property(calendar, property_name):
    """Search for items where property is not defined."""
    filter_xml = f"""
    <C:prop-filter name="{property_name.upper()}">
      <C:is-not-defined/>
    </C:prop-filter>
    """
    return calendar.search(filter_xml)

# Usage
events_no_dtend = search_no_property(cal, "DTEND")
```

**Pattern 2: Client-side filtering fallback**:
```python
def search_no_property_fallback(calendar, property_name):
    """Fetch all, filter client-side."""
    all_objects = calendar.search()

    filtered = []
    for obj in all_objects:
        ical = obj.icalendar_instance
        component = ical.walk()[1]  # First non-VCALENDAR component

        if not component.get(property_name.upper()):
            filtered.append(obj)

    return filtered
```

**Pattern 3: Combined approach**:
```python
def search_no_property_robust(calendar, property_name, server_support):
    """Try server-side, fall back to client-side."""
    if server_support == "unsupported":
        return search_no_property_fallback(calendar, property_name)

    try:
        results = search_no_property(calendar, property_name)

        # Verify with client-side check if support is fragile
        if server_support == "fragile":
            return [r for r in results
                    if not r.icalendar_instance.walk()[1].get(property_name.upper())]

        return results
    except:
        # Server error - fall back
        return search_no_property_fallback(calendar, property_name)
```

### 3. The Pending Todo Problem and Solutions

**Problem**: Finding incomplete tasks is surprisingly difficult due to multiple valid representations:

- Task with no STATUS, no COMPLETED ➜ pending
- Task with STATUS=NEEDS-ACTION, no COMPLETED ➜ pending
- Task with STATUS=IN-PROCESS, no COMPLETED ➜ pending
- Task with STATUS=COMPLETED, COMPLETED date set ➜ NOT pending
- Task with STATUS=CANCELLED ➜ NOT pending

**Solution A: Triple-query approach** (python-caldav's solution):
```python
def find_pending_todos(calendar):
    """Find all pending todos using three queries."""

    # Query 1: Standard approach
    results1 = calendar.search("""
        <C:comp-filter name="VTODO">
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
    """)

    # Query 2: Explicit undefined STATUS (Nextcloud/Baikal workaround)
    results2 = calendar.search("""
        <C:comp-filter name="VTODO">
          <C:prop-filter name="COMPLETED">
            <C:is-not-defined/>
          </C:prop-filter>
          <C:prop-filter name="STATUS">
            <C:is-not-defined/>
          </C:prop-filter>
        </C:comp-filter>
    """)

    # Query 3: NEEDS-ACTION status (recurring tasks)
    results3 = calendar.search("""
        <C:comp-filter name="VTODO">
          <C:prop-filter name="STATUS">
            <C:text-match>NEEDS-ACTION</C:text-match>
          </C:prop-filter>
        </C:comp-filter>
    """)

    # Merge results, remove duplicates by URL
    seen_urls = set()
    merged = []
    for result in results1 + results2 + results3:
        if result.url not in seen_urls:
            seen_urls.add(result.url)
            merged.append(result)

    return merged
```

**Solution B: Client-side filtering** (simpler, but more bandwidth):
```python
def find_pending_todos_client_side(calendar):
    """Fetch all todos, filter client-side."""
    all_todos = calendar.search(comp_class=Todo)

    pending = []
    for todo in all_todos:
        component = todo.icalendar_component

        # Has COMPLETED date? Not pending
        if component.get('COMPLETED'):
            continue

        # STATUS is COMPLETED or CANCELLED? Not pending
        status = component.get('STATUS')
        if status in ('COMPLETED', 'CANCELLED'):
            continue

        # Otherwise it's pending
        pending.append(todo)

    return pending
```

**Solution C: Hybrid approach** (recommended):
```python
def find_pending_todos_hybrid(calendar, server_info):
    """Use best approach based on server capabilities."""

    # If server supports is-not-defined well, use standard query
    if server_info.get("search.is-not-defined") == "full":
        return find_pending_todos_single_query(calendar)

    # If server is Nextcloud/Baikal, use triple-query
    if server_info.get("negated-textmatch-bug"):
        return find_pending_todos(calendar)

    # If server doesn't support is-not-defined, go client-side
    if server_info.get("search.is-not-defined") == "unsupported":
        return find_pending_todos_client_side(calendar)

    # Unknown/fragile - use triple-query to be safe
    return find_pending_todos(calendar)
```

### 4. Best Practices for Robust Searches

**1. Always test your assumptions**: Don't assume the server follows the RFC
```python
# Test if is-not-defined works for a specific property
test_results = calendar.search(no_test_property=True)
# Verify results client-side
```

**2. Implement fallbacks**: Plan for servers that don't support features
```python
try:
    results = search_with_is_not_defined(calendar)
except ServerError:
    results = search_client_side(calendar)
```

**3. Use compatibility matrices**: Maintain a database of known server quirks
```python
server_quirks = {
    "nextcloud": ["negated-textmatch-undefined-bug"],
    "baikal": ["negated-textmatch-undefined-bug"],
    "zimbra": ["no-is-not-defined"],
    "radicale": ["fragile-is-not-defined"],
}
```

**4. Prefer client-side filtering for correctness**: If performance allows
```python
# More bandwidth, but guaranteed correct results
all_objects = calendar.get_all()
filtered = client_side_filter(all_objects, criteria)
```

**5. Log and report server behavior**: Help improve compatibility
```python
if expected != actual:
    logger.warning(f"Server {server_name} returned {actual}, expected {expected}")
    report_to_compatibility_database(server_name, test_case, actual)
```

## Related GitHub Issues

- [python-caldav#14](https://github.com/python-caldav/caldav/issues/14) - Nextcloud/Baikal negated TextMatch bug (core issue)
- [DAViCal#281](https://gitlab.com/davical-project/davical/-/issues/281) - Discussion on is-not-defined behavior

## Conclusion

The `is-not-defined` filter is one of the most poorly supported CalDAV features despite being in the core specification. Implementations vary wildly:

- **Zimbra, SOGo, Robur**: Complete lack of support
- **Radicale, Bedework**: Fragile partial support
- **Nextcloud, Baikal**: Supported, but with critical bug in negated TextMatch

The python-caldav library's triple-query approach and client-side filtering fallbacks demonstrate that robust CalDAV clients must anticipate server incompatibilities and implement multiple strategies. For new CalDAV client implementations:

1. Don't assume `is-not-defined` works
2. Always implement client-side filtering as fallback
3. For pending todos, use the triple-query approach or client-side filtering
4. Test extensively against multiple server implementations
5. Maintain a compatibility matrix

The safest approach is to fetch more data from the server and filter client-side, trading bandwidth and memory for correctness and reliability.
