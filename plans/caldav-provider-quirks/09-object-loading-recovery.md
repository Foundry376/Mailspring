# CalDAV Object Loading Failure Recovery and Multiget Fallback

## Issue Summary

Calendar object loading in CalDAV can fail in several unexpected ways, even when the object URL is known to be valid:

1. **Direct GET failures**: A direct `GET` request to a valid calendar object URL returns 404 or other errors, despite the object existing in the calendar.

2. **Search returns URLs but no data**: Calendar search (REPORT) requests return object URLs in the response, but fail when attempting to fetch the actual calendar data.

3. **Partial data in search results**: Some servers don't include the full calendar data (`<C:calendar-data>`) in search responses, requiring a second request to load the data.

4. **Server-specific quirks**: Certain CalDAV servers (notably Zimbra) have broken implementations where `GET` on calendar object resources consistently fails.

These issues violate the spirit of RFC 4791 but occur frequently enough in real-world deployments that robust CalDAV clients must implement fallback mechanisms.

## Expected Behavior per RFC 4791

### Getting Calendar Object Resources

RFC 4791 Section 5.3.1 describes two standard ways to retrieve calendar object data:

**Method 1: Direct GET**
```http
GET /calendars/user/cal/event123.ics HTTP/1.1
Host: cal.example.com
```

Expected response:
```http
HTTP/1.1 200 OK
Content-Type: text/calendar

BEGIN:VCALENDAR
...
END:VCALENDAR
```

**Method 2: REPORT with calendar-multiget**
```xml
<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-multiget xmlns:D="DAV:"
                     xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-data/>
  </D:prop>
  <D:href>/calendars/user/cal/event123.ics</D:href>
</C:calendar-multiget>
```

According to the RFC, both methods MUST work. The `calendar-multiget` REPORT is designed for efficiently fetching multiple objects in a single request, not as a fallback mechanism.

### Calendar Search Responses

RFC 4791 Section 7.8 defines the `calendar-query` REPORT. When requesting `<C:calendar-data/>` in the query properties, the server SHOULD return the calendar data in the response:

```xml
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/user/cal/event123.ics</D:href>
    <D:propstat>
      <D:prop>
        <C:calendar-data>BEGIN:VCALENDAR
...
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>
```

However, the RFC allows servers to omit the calendar data and return only URLs, requiring clients to fetch the data separately.

## Real-World Server Behaviors

### Zimbra's `event_by_url_is_broken` Issue

**Problem**: Direct `GET` requests to valid calendar object URLs return 404 errors.

From python-caldav's compatibility hints documentation:

```python
'event_by_url_is_broken':
    """A GET towards a valid calendar object resource URL will yield 404 (wtf?)"""
```

This is set for Zimbra servers in the compatibility configuration. It means:
- `event.load()` using direct GET will fail
- `calendar.event_by_url(href)` will fail
- But `calendar-multiget` REPORT with the same URL works fine

**Example**:
```python
# This fails on Zimbra (returns 404)
response = client.request('/calendars/user@domain.com/Calendar/abc-123.ics')

# But this works on Zimbra
multiget_report = calendar._multiget(['/calendars/user@domain.com/Calendar/abc-123.ics'])
# Returns the calendar data successfully
```

**Root cause**: Unknown server implementation bug. The object exists, searches find it, but direct GET fails.

### Servers That Return URLs But Fail Data Fetch

**Symptoms**:
- Calendar search returns object hrefs
- Requesting calendar data for those hrefs fails
- May return 404, 403, or 500 errors

This can happen when:
- Server returns stale/deleted object URLs in search results
- Permission issues exist on specific objects
- Server has caching inconsistencies

### Servers With Partial Data in Search

**Behavior**: Some servers return search results without including the `<C:calendar-data>` element, even when explicitly requested.

**Impact**: Requires a second round-trip to load each object:
1. First request: Search returns URLs only
2. Second request(s): Load data for each URL

**Server examples**: Google Calendar sometimes exhibits this behavior depending on the query complexity.

## python-caldav Workarounds

### The load() Method with Automatic Fallback

Location: `/tmp/python-caldav/caldav/calendarobjectresource.py`, lines 673-699

```python
def load(self, only_if_unloaded: bool = False) -> Self:
    """
    (Re)load the object from the caldav server.
    """
    if only_if_unloaded and self.is_loaded():
        return self

    if self.url is None:
        raise ValueError("Unexpected value None for self.url")

    if self.client is None:
        raise ValueError("Unexpected value None for self.client")

    try:
        # First attempt: Direct GET request
        r = self.client.request(str(self.url))
        if r.status and r.status == 404:
            raise error.NotFoundError(errmsg(r))
        self.data = r.raw
    except error.NotFoundError:
        raise
    except:
        # Fallback: Use multiget REPORT instead
        return self.load_by_multiget()

    # Store ETags and Schedule-Tags if present
    if "Etag" in r.headers:
        self.props[dav.GetEtag.tag] = r.headers["Etag"]
    if "Schedule-Tag" in r.headers:
        self.props[cdav.ScheduleTag.tag] = r.headers["Schedule-Tag"]
    return self
```

**Key features**:

1. **Try direct GET first**: Attempts the standard, most efficient method
2. **Automatic fallback**: If GET fails (except for NotFoundError), falls back to multiget
3. **Preserves NotFoundError**: If object truly doesn't exist (404), raises the error without fallback
4. **Catches all other exceptions**: Network errors, server errors, permission issues all trigger fallback
5. **Stores metadata**: Captures ETags and Schedule-Tags when available

### The load_by_multiget() Fallback Method

Location: `/tmp/python-caldav/caldav/calendarobjectresource.py`, lines 701-718

```python
def load_by_multiget(self) -> Self:
    """
    Some servers do not accept a GET, but we can still do a REPORT
    with a multiget query
    """
    error.assert_(self.url)
    mydata = self.parent._multiget(event_urls=[self.url], raise_notfound=True)
    try:
        url, self.data = next(mydata)
    except StopIteration:
        ## We shouldn't come here. Something is wrong.
        ## TODO: research it
        ## As of 2025-05-20, this code section is used by
        ## TestForServerECloud::testCreateOverwriteDeleteEvent
        raise error.NotFoundError(self.url)
    error.assert_(self.data)
    error.assert_(next(mydata, None) is None)
    return self
```

**Key features**:

1. **Uses parent calendar's _multiget**: Delegates to the calendar's multiget implementation
2. **Single object multiget**: Passes a single URL in a list (multiget supports batch operations)
3. **Expects exactly one result**: Validates that exactly one object is returned
4. **Raises NotFoundError on failure**: If multiget returns nothing, the object truly doesn't exist

### Multiget Implementation

Location: `/tmp/python-caldav/caldav/collection.py`, lines 649-674

```python
def _multiget(
    self, event_urls: Iterable[URL], raise_notfound: bool = False
) -> Iterable[str]:
    """
    get multiple events' data.
    TODO: Does it overlap the _request_report_build_resultlist method
    """
    if self.url is None:
        raise ValueError("Unexpected value None for self.url")

    rv = []
    prop = dav.Prop() + cdav.CalendarData()
    root = (
        cdav.CalendarMultiGet()
        + prop
        + [dav.Href(value=u.path) for u in event_urls]
    )
    response = self._query(root, 1, "report")
    results = response.expand_simple_props([cdav.CalendarData()])
    if raise_notfound:
        for href in response.statuses:
            status = response.statuses[href]
            if status and "404" in status:
                raise error.NotFoundError(f"Status {status} in {href}")
    for r in results:
        yield (r, results[r][cdav.CalendarData.tag])
```

**Key features**:

1. **Batch capable**: Can fetch multiple objects in one request
2. **Returns generator**: Yields (url, data) tuples for memory efficiency
3. **Optional error raising**: `raise_notfound` controls whether to raise on 404
4. **Status checking**: Examines individual object statuses in the multistatus response

Public wrapper (lines 677-692):

```python
def multiget(
    self, event_urls: Iterable[URL], raise_notfound: bool = False
) -> Iterable[_CC]:
    """
    get multiple events' data
    TODO: Does it overlap the _request_report_build_resultlist method?
    @author mtorange@gmail.com (refactored by Tobias)
    """
    results = self._multiget(event_urls, raise_notfound=raise_notfound)
    for url, data in results:
        yield self._calendar_comp_class_by_data(data)(
            self.client,
            url=self.url.join(url),
            data=data,
            parent=self,
        )
```

This wraps the raw data into proper CalendarObjectResource objects (Event, Todo, Journal).

### Search with Automatic Loading

Location: `/tmp/python-caldav/caldav/search.py`, lines 514-541

```python
obj2 = []

for o in objects:
    ## This would not be needed if the servers would follow the standard ...
    ## TODO: use calendar.calendar_multiget - see https://github.com/python-caldav/caldav/issues/487
    try:
        o.load(only_if_unloaded=True)
        obj2.append(o)
    except:
        logging.error(
            "Server does not want to reveal details about the calendar object",
            exc_info=True,
        )
        pass
objects = obj2

## Google sometimes returns empty objects
objects = [o for o in objects if o.has_component()]
objects = self.filter(objects, post_filter, split_expanded, server_expand)

## partial workaround for https://github.com/python-caldav/caldav/issues/201
for obj in objects:
    try:
        obj.load(only_if_unloaded=True)
    except:
        pass

return self.sort(objects)
```

**Key features**:

1. **First loading pass**: Attempts to load each object, silently drops failures
2. **Filters empty objects**: Google sometimes returns objects without VEVENT/VTODO/VJOURNAL
3. **Second loading pass**: Another attempt to load after filtering
4. **Error tolerance**: Uses bare `except:` to handle all loading failures gracefully
5. **Silent failures**: Logs errors but continues processing remaining objects

**Why two passes?**
- First pass: Load data if server didn't include it in search response
- Filter pass: Remove garbage entries
- Second pass: Ensure all surviving objects are fully loaded

### The only_if_unloaded Parameter

Used throughout the codebase to prevent redundant server requests:

```python
def is_loaded(self):
    """Returns True if there exists data in the object. An
    object is considered not to be loaded if it contains no data
    but just the URL.

    TOOD: bad side effect, converts the data to a string,
    potentially breaking couplings
    """
    return (
        (self._data and self._data.count("BEGIN:") > 1)
        or self._vobject_instance
        or self._icalendar_instance
    )
```

Usage pattern:
```python
# Only load if object has URL but no data yet
event.load(only_if_unloaded=True)

# Always reload from server
event.load()
```

**Performance impact**: The `only_if_unloaded` parameter is critical for search operations that may return hundreds of objects. Without it, every access to object properties would trigger a server round-trip.

## Implementation Guidance

### For Library Users

**Safe object loading pattern**:

```python
# Get an event by URL
event = calendar.event_by_url(event_href)

# Load will automatically fall back to multiget if GET fails
try:
    event.load()
    print(f"Event summary: {event.icalendar_component['SUMMARY']}")
except error.NotFoundError:
    print("Event doesn't exist")
```

**Batch loading with multiget** (most efficient):

```python
# Get multiple events efficiently
event_urls = [
    '/calendars/user/cal/event1.ics',
    '/calendars/user/cal/event2.ics',
    '/calendars/user/cal/event3.ics',
]

# Single request fetches all events
for event in calendar.multiget(event_urls):
    print(f"Loaded: {event.icalendar_component['SUMMARY']}")
```

**Search with automatic loading**:

```python
# Search automatically handles loading
events = calendar.search(
    start=datetime(2025, 1, 1),
    end=datetime(2025, 12, 31),
    event=True
)

# Events are already loaded (if data was available)
for event in events:
    # No additional load() needed
    print(event.icalendar_component.get('SUMMARY', 'No summary'))
```

### For CalDAV Server Implementers

**To avoid breaking clients**:

1. **Support both GET and multiget**: Implement RFC 4791 Section 5.3.1 completely
   - `GET /calendars/user/cal/object.ics` must work
   - `REPORT` with `calendar-multiget` must work on same URLs

2. **Include calendar-data in search responses**: When client requests `<C:calendar-data/>` property, include it in the response

3. **Consistent URL paths**: URLs returned in search results must be GETtable
   - Don't return stale/deleted object URLs
   - Don't return URLs that require different authentication

4. **Error codes matter**:
   - 404: Object doesn't exist
   - 403: Permission denied (object exists but not accessible)
   - 500: Server error (try again)
   - Use correct codes so clients can retry appropriately

### Debugging Loading Issues

**Enable debug logging**:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
logging.getLogger('caldav').setLevel(logging.DEBUG)
```

**Check if multiget fallback is being used**:

```python
# Monkey-patch to detect fallback usage
original_load_by_multiget = Event.load_by_multiget

def debug_load_by_multiget(self):
    print(f"FALLBACK: Using multiget for {self.url}")
    return original_load_by_multiget(self)

Event.load_by_multiget = debug_load_by_multiget
```

**Test both loading methods**:

```python
# Test direct GET
try:
    response = client.request(event_url)
    print(f"GET succeeded: {response.status}")
except Exception as e:
    print(f"GET failed: {e}")

# Test multiget
try:
    for event in calendar.multiget([event_url]):
        print(f"Multiget succeeded: {event.url}")
except Exception as e:
    print(f"Multiget failed: {e}")
```

### Performance Considerations

**Single object loading**:
- Direct GET: 1 HTTP request
- Multiget fallback: 1 HTTP request (but with REPORT overhead)
- Performance difference is minimal

**Multiple object loading**:
- Individual GETs: N HTTP requests for N objects
- Single multiget: 1 HTTP request for N objects
- **Recommendation**: Always use `calendar.multiget()` for batch operations

**Search operations**:
- Ideal: 1 REPORT returns URLs + data
- Common: 1 REPORT returns URLs, N requests load data
- Worst: 1 REPORT returns URLs, N requests fail, N multiget fallbacks
- **Mitigation**: Modern python-caldav tries multiget batch loading (issue #487)

## Historical Context

From CHANGELOG.md:

> **Version 1.3.0 (2024)**
> * Compatibility workaround: If `event.load()` fails, it will retry the load by doing a multiget - https://github.com/python-caldav/caldav/pull/460 and https://github.com/python-caldav/caldav/pull/475 - https://github.com/python-caldav/caldav/issues/459

This fallback mechanism was added after discovering that multiple production CalDAV servers (including Zimbra) had broken GET implementations but working multiget implementations.

The Zimbra issue is documented with the compatibility flag `event_by_url_is_broken`, automatically applied to detected Zimbra servers.

## Related Issues

- **Issue #459**: Event loading fails on some servers
- **Issue #460**: PR adding multiget fallback
- **Issue #475**: PR refining multiget fallback
- **Issue #487**: TODO - Use calendar_multiget for batch loading in search
- **Issue #492**: Refactoring of multiget implementation
- **Issue #201**: Servers not returning calendar data in search responses

## Summary

The python-caldav library implements a robust, multi-layered approach to calendar object loading:

1. **Try direct GET first** (most efficient, per RFC)
2. **Automatic fallback to multiget** (works around broken servers)
3. **Graceful degradation** (continue with partial results on failures)
4. **Batch optimization** (multiget for multiple objects)
5. **Smart caching** (only_if_unloaded prevents redundant requests)

This ensures the library works reliably across the diverse CalDAV server ecosystem, from fully RFC-compliant servers to those with significant implementation bugs.
