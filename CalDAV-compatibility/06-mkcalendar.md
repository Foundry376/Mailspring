# MKCALENDAR: Calendar Creation Compatibility Issues

## 1. Issue Summary

Calendar creation in CalDAV is plagued by several compatibility problems:

1. **MKCALENDAR is optional**: The RFC makes MKCALENDAR support RECOMMENDED, not REQUIRED, so many servers (especially cloud providers) don't support it at all.

2. **Alternative methods**: Some servers require MKCOL instead of MKCALENDAR for creating calendars.

3. **Auto-creation**: Some servers automatically create calendars when accessed, making explicit creation unnecessary or impossible.

4. **Display name setting**: Many servers fail to set the display name during calendar creation, requiring a separate PROPPATCH request.

5. **Calendar deletion**: RFC 4791 doesn't specify calendar deletion at all, leading to inconsistent implementations. Some servers:
   - Don't support deletion
   - Move calendars to a trashbin instead of deleting
   - Fail when deleting recently-created calendars
   - Don't free the namespace after deletion

These issues make it challenging to build portable CalDAV clients that work across different server implementations.

## 2. RFC Specification

### RFC 4791 Section 5.3.1 - MKCALENDAR Method

The RFC 4791 specification clearly states:

> **Support for MKCALENDAR on the server is only RECOMMENDED and not REQUIRED** because some calendar stores only support one calendar per user (or principal), and those are typically pre-created for each account.

This is the root cause of many compatibility problems. The RFC allows servers to:

- Not implement MKCALENDAR at all
- Pre-provision calendars for users
- Limit users to a single calendar
- Support calendar creation through proprietary APIs only (not CalDAV)

### MKCALENDAR Request Format

When supported, MKCALENDAR should allow setting properties on creation:

```xml
MKCALENDAR /home/lisa/calendars/events/ HTTP/1.1
Host: calendar.example.com
Content-Type: application/xml; charset="utf-8"

<?xml version="1.0" encoding="utf-8" ?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set>
    <D:prop>
      <D:displayname>Lisa's Events</D:displayname>
      <C:calendar-description xml:lang="en">Calendar for Lisa's events</C:calendar-description>
      <C:supported-calendar-component-set>
        <C:comp name="VEVENT"/>
      </C:supported-calendar-component-set>
    </D:prop>
  </D:set>
</C:mkcalendar>
```

Expected response: `201 Created`

### MKCOL Alternative (RFC 4791 Section 8.5.2)

Confusingly, RFC 4791 mentions MKCOL in section 8.5.2 (titled "external attachments"):

> The server MAY support MKCOL

This is often interpreted as allowing MKCOL to be used for creating calendars. When using MKCOL, the resourcetype must explicitly indicate it's a calendar:

```xml
MKCOL /home/lisa/calendars/tasks/ HTTP/1.1
Host: calendar.example.com
Content-Type: application/xml; charset="utf-8"

<?xml version="1.0" encoding="utf-8" ?>
<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set>
    <D:prop>
      <D:resourcetype>
        <D:collection/>
        <C:calendar/>
      </D:resourcetype>
      <D:displayname>Lisa's Tasks</D:displayname>
    </D:prop>
  </D:set>
</D:mkcol>
```

### Calendar Deletion

RFC 4791 **does not specify calendar deletion at all**. RFC 6638 (section 3.2.3.2) says:

> If a calendar is deleted, all the calendar object resources on the calendar should also be deleted

However, this only applies to scheduling objects, and server implementation varies wildly.

## 3. Real-World Server Behaviors

### Servers That Don't Support MKCALENDAR

**Google Calendar:**
- Feature: `create-calendar: unsupported`
- Calendars can only be created through the Google web UI or proprietary APIs
- CalDAV protocol provides read/write access to existing calendars only
- Attempting MKCALENDAR results in an error

**Posteo:**
- Feature: `create-calendar: unsupported`
- Pre-provisions calendars for users
- Users cannot create additional calendars via CalDAV

**GMX.de:**
- Feature: `create-calendar: unsupported`
- Similar to Posteo - pre-provisioned calendars only

**Cloud providers in general:**
- Many cloud-based CalDAV services don't expose calendar management through CalDAV
- Calendar lifecycle management is done through web UI or proprietary APIs
- This is RFC-compliant behavior since MKCALENDAR is only RECOMMENDED

### Servers Requiring MKCOL Instead

**Baikal (some versions):**
- Feature: `create-calendar: quirk, behaviour: 'mkcol-required'`
- Does not support MKCALENDAR
- Requires MKCOL with proper resourcetype
- The quirk detection allows python-caldav to automatically use MKCOL

Implementation detail from python-caldav:

```python
if supported["support"] == "quirk" and supported["behaviour"] == "mkcol-required":
    method = "mkcol"
else:
    method = "mkcalendar"
```

### Servers with Auto-Creation

**Purelymail:**
- Feature: `create-calendar.auto: full`
- Accessing a non-existent calendar path automatically creates it
- Explicit MKCALENDAR may not be necessary
- This behavior eliminates the need for calendar creation API

### Display Name Setting Issues

**Zimbra:**
- Feature: `create-calendar.set-displayname: unsupported`
- Display name, calendar ID, and URL are the same
- Display name cannot be changed after creation
- Can only be set if no calendar ID is provided during creation
- In earlier Zimbra versions, changing display name would make calendar unavailable at old URL

**DAViCal, many others:**
- MKCALENDAR body with displayname is often ignored
- Requires separate PROPPATCH request after creation
- python-caldav implements automatic fallback

From python-caldav code comments:

```python
# COMPATIBILITY ISSUE
# name should already be set, but we've seen caldav servers failing
# on setting the DisplayName on calendar creation
# (DAViCal, Zimbra, ...). Doing an attempt on explicitly setting the
# display name using PROPPATCH.
if name:
    try:
        self.set_properties([display_name])
    except Exception as e:
        log.warning("calendar server does not support display name on calendar?")
```

### Calendar Deletion Issues

**Nextcloud:**
- Feature: `delete-calendar: fragile`
  - Behavior: "Deleting a recently created calendar fails"
  - Timing issue - deletion immediately after creation fails
- Feature: `delete-calendar.free-namespace: fragile`
  - Behavior: "Deleting a calendar moves it to a trashbin, trashbin has to be manually 'emptied' from the web-ui before the namespace is freed up"
  - The namespace (calendar name/ID) remains occupied until trash is emptied
  - Attempting to create a calendar with the same ID fails until trash is cleared

**eCloud (Nextcloud variant):**
- Same issues as Nextcloud
- Additionally requires rate limiting due to manual trash operations
- Test configuration includes: `rate-limit: 10 seconds, 1 request`

**Cyrus:**
- Feature: `delete-calendar: fragile`
  - Behavior: "Deleting a recently created calendar fails"
  - Similar timing issue to Nextcloud

**Synology:**
- Feature: `delete-calendar: False` (unsupported)
- Calendar deletion not supported at all

## 4. python-caldav Workarounds

The python-caldav library implements several sophisticated workarounds for these issues.

### Feature Detection for Calendar Creation

Before attempting to create a calendar, check server support:

```python
def _create(self, name=None, id=None, supported_calendar_component_set=None, method=None):
    if method is None:
        if self.client:
            supported = self.client.features.is_supported(
                "create-calendar", return_type=dict
            )
            if supported["support"] not in ("full", "fragile", "quirk"):
                raise error.MkcalendarError(
                    "Creation of calendars (allegedly) not supported on this server"
                )
            if (
                supported["support"] == "quirk"
                and supported["behaviour"] == "mkcol-required"
            ):
                method = "mkcol"
            else:
                method = "mkcalendar"
```

This code:
1. Checks if `create-calendar` feature is supported
2. Raises `MkcalendarError` if unsupported
3. Detects the `mkcol-required` quirk for Baikal
4. Automatically selects the appropriate method

### MKCOL vs MKCALENDAR Method Selection

The library can use either method based on server requirements:

```python
if method == "mkcol":
    # MKCOL requires explicit resourcetype
    prop += dav.ResourceType() + [dav.Collection(), cdav.Calendar()]

set = dav.Set() + prop
mkcol = (dav.Mkcol() if method == "mkcol" else cdav.Mkcalendar()) + set

r = self._query(
    root=mkcol, query_method=method, url=path, expected_return_value=201
)
```

Key differences:
- **MKCOL**: Must include `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>`
- **MKCALENDAR**: Resourcetype is implicit

### PROPPATCH Fallback for Display Name

After calendar creation, the library attempts to set the display name again via PROPPATCH:

```python
# COMPATIBILITY ISSUE
# name should already be set, but we've seen caldav servers failing
# on setting the DisplayName on calendar creation
# (DAViCal, Zimbra, ...). Doing an attempt on explicitly setting the
# display name using PROPPATCH.
if name:
    try:
        self.set_properties([display_name])
    except Exception as e:
        try:
            current_display_name = self.get_display_name()
            error.assert_(current_display_name == name)
        except:
            log.warning(
                "calendar server does not support display name on calendar? Ignoring",
                exc_info=True,
            )
```

This pattern:
1. Tries to set display name during creation
2. If that fails, tries PROPPATCH
3. If PROPPATCH fails, verifies if name was actually set
4. If all else fails, logs a warning and continues

### Calendar Deletion Retry Logic

For servers with fragile deletion support (Nextcloud, Cyrus), the library implements retry logic:

```python
def delete(self):
    quirk_info = self.client.features.is_supported("delete-calendar", dict)
    wipe = quirk_info["support"] in ("unsupported", "fragile")

    if quirk_info["support"] == "fragile":
        # Do some retries on deleting the calendar
        for x in range(0, 20):
            try:
                super().delete()
            except error.DeleteError:
                pass
            try:
                x = self.events()
                sleep(0.3)
            except error.NotFoundError:
                wipe = False
                break

    if wipe:
        # Delete all objects manually
        for x in self.search():
            x.delete()
    else:
        super().delete()
```

This implementation:
1. Checks if deletion is fragile
2. Retries up to 20 times with 0.3s delays
3. Verifies deletion by checking if calendar is gone
4. Falls back to manual object deletion if needed

## 5. Implementation Guidance

For developers building a new CalDAV client, here's how to handle calendar creation robustly:

### Step 1: Detect Calendar Creation Capabilities

Before attempting to create calendars, probe the server:

```python
def probe_calendar_creation_support(client):
    """
    Returns: tuple of (method, supports_displayname)
    where method is 'mkcalendar', 'mkcol', 'auto', or None
    """
    # Try MKCALENDAR first (most common)
    test_url = client.url.join("test-probe-calendar/")

    try:
        # Attempt MKCALENDAR
        body = """<?xml version="1.0" encoding="utf-8" ?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set><D:prop>
    <D:displayname>Test</D:displayname>
  </D:prop></D:set>
</C:mkcalendar>"""

        response = client.request(test_url, "MKCALENDAR", body)

        if response.status in (201, 200):
            # Check if displayname was actually set
            displayname = get_displayname(client, test_url)
            supports_displayname = (displayname == "Test")

            # Clean up
            client.delete(test_url)

            return ('mkcalendar', supports_displayname)

    except Exception as e:
        # MKCALENDAR failed, try MKCOL
        pass

    try:
        # Attempt MKCOL
        body = """<?xml version="1.0" encoding="utf-8" ?>
<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set><D:prop>
    <D:resourcetype>
      <D:collection/><C:calendar/>
    </D:resourcetype>
    <D:displayname>Test</D:displayname>
  </D:prop></D:set>
</D:mkcol>"""

        response = client.request(test_url, "MKCOL", body)

        if response.status in (201, 200):
            displayname = get_displayname(client, test_url)
            supports_displayname = (displayname == "Test")
            client.delete(test_url)
            return ('mkcol', supports_displayname)

    except Exception:
        pass

    # Neither method worked
    return (None, False)
```

### Step 2: Implement MKCOL Fallback

Always support both methods:

```python
def create_calendar(client, name, id=None, method='mkcalendar'):
    """
    Create a calendar using detected method.

    Args:
        client: DAVClient instance
        name: Display name for calendar
        id: Calendar ID (URL path component)
        method: 'mkcalendar' or 'mkcol'
    """
    if id is None:
        id = str(uuid.uuid4())

    url = client.url.join(quote(id) + "/")

    # Build property set
    props = f"""
    <D:displayname>{name}</D:displayname>
    """

    if method == 'mkcol':
        # MKCOL requires explicit resourcetype
        body = f"""<?xml version="1.0" encoding="utf-8" ?>
<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set><D:prop>
    <D:resourcetype>
      <D:collection/>
      <C:calendar/>
    </D:resourcetype>
    {props}
  </D:prop></D:set>
</D:mkcol>"""
        http_method = "MKCOL"
    else:
        # MKCALENDAR
        body = f"""<?xml version="1.0" encoding="utf-8" ?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set><D:prop>
    {props}
  </D:prop></D:set>
</C:mkcalendar>"""
        http_method = "MKCALENDAR"

    response = client.request(url, http_method, body)

    if response.status not in (200, 201):
        raise CalendarCreationError(f"Failed to create calendar: {response.status}")

    return url
```

### Step 3: Handle Display Name Setting Robustly

Always use PROPPATCH as fallback:

```python
def set_calendar_displayname(client, calendar_url, name):
    """
    Set calendar display name with PROPPATCH fallback.

    Returns True if successful, False otherwise.
    """
    # The name might already be set during creation,
    # but we can't rely on that

    proppatch_body = f"""<?xml version="1.0" encoding="utf-8" ?>
<D:propertyupdate xmlns:D="DAV:">
  <D:set>
    <D:prop>
      <D:displayname>{name}</D:displayname>
    </D:prop>
  </D:set>
</D:propertyupdate>"""

    try:
        response = client.request(calendar_url, "PROPPATCH", proppatch_body)

        if response.status in (200, 207):
            # Verify it was actually set
            actual_name = get_displayname(client, calendar_url)
            return actual_name == name

        return False

    except Exception as e:
        # Some servers (Zimbra) don't support changing displayname
        log.warning(f"Could not set display name: {e}")
        return False
```

### Step 4: Best Practices for Calendar Deletion

Implement robust deletion with retries and manual cleanup:

```python
def delete_calendar(client, calendar_url, max_retries=20, retry_delay=0.3):
    """
    Delete a calendar with retry logic and manual cleanup fallback.

    Args:
        client: DAVClient instance
        calendar_url: URL of calendar to delete
        max_retries: Maximum deletion attempts
        retry_delay: Seconds to wait between retries
    """
    # First, try direct deletion with retries
    for attempt in range(max_retries):
        try:
            response = client.request(calendar_url, "DELETE")

            if response.status in (200, 204, 404):
                # Verify deletion
                try:
                    client.request(calendar_url, "PROPFIND")
                    # Still exists, retry
                    time.sleep(retry_delay)
                    continue
                except NotFoundError:
                    # Successfully deleted
                    return True

        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
            else:
                raise

    # Direct deletion failed, try manual cleanup
    log.warning("Direct deletion failed, attempting manual object removal")

    try:
        # Get all objects in calendar
        objects = list_calendar_objects(client, calendar_url)

        # Delete each object
        for obj_url in objects:
            try:
                client.request(obj_url, "DELETE")
            except Exception as e:
                log.error(f"Failed to delete object {obj_url}: {e}")

        # Try deleting calendar again
        response = client.request(calendar_url, "DELETE")
        return response.status in (200, 204, 404)

    except Exception as e:
        log.error(f"Manual cleanup failed: {e}")
        return False
```

### Step 5: Handle Namespace Freeing Issues

For servers like Nextcloud that don't immediately free namespaces:

```python
def create_calendar_with_unique_id(client, base_name, base_id=None):
    """
    Create a calendar with a unique ID, handling namespace conflicts.

    This is needed for servers that move deleted calendars to trash
    rather than immediately freeing the namespace.
    """
    if base_id is None:
        base_id = base_name.lower().replace(' ', '-')

    # Try base ID first
    calendar_id = base_id
    attempt = 0

    while attempt < 100:  # Sanity limit
        try:
            url = create_calendar(client, base_name, calendar_id)
            return url

        except ConflictError:
            # Namespace conflict, try with suffix
            attempt += 1
            calendar_id = f"{base_id}-{attempt}"

    raise CalendarCreationError("Could not find available calendar ID")
```

### Complete Example

Putting it all together:

```python
class RobustCalendarCreator:
    """
    Handles calendar creation across different server implementations.
    """

    def __init__(self, client):
        self.client = client
        self.method = None
        self.supports_displayname = False
        self._probe_capabilities()

    def _probe_capabilities(self):
        """Detect server capabilities for calendar creation."""
        self.method, self.supports_displayname = probe_calendar_creation_support(
            self.client
        )

        if self.method is None:
            raise NotSupportedError("Server does not support calendar creation")

    def create(self, name, calendar_id=None):
        """
        Create a calendar with the given name.

        Returns: Calendar URL
        """
        # Generate ID if not provided
        if calendar_id is None:
            calendar_id = str(uuid.uuid4())

        # Try creating with unique ID
        url = None
        for attempt in range(10):
            try:
                url = create_calendar(
                    self.client,
                    name,
                    calendar_id if attempt == 0 else f"{calendar_id}-{attempt}",
                    method=self.method
                )
                break
            except ConflictError:
                # Namespace conflict, retry with different ID
                continue

        if url is None:
            raise CalendarCreationError("Could not create calendar")

        # Set display name if it wasn't set during creation
        if not self.supports_displayname:
            set_calendar_displayname(self.client, url, name)

        return url

    def delete(self, calendar_url):
        """Delete a calendar with robust error handling."""
        return delete_calendar(self.client, calendar_url)


# Usage
creator = RobustCalendarCreator(client)

# Create calendar
calendar_url = creator.create("My Calendar")

# ... use calendar ...

# Delete calendar
creator.delete(calendar_url)
```

### Key Takeaways

1. **Always probe before creating**: Don't assume MKCALENDAR is supported
2. **Support both MKCOL and MKCALENDAR**: Some servers require one or the other
3. **Never trust creation-time properties**: Always use PROPPATCH fallback for displayname
4. **Implement retry logic for deletion**: Some servers have timing issues
5. **Handle namespace conflicts**: Some servers don't immediately free deleted calendar IDs
6. **Provide fallback to manual cleanup**: Delete all objects individually if calendar deletion fails
7. **Be prepared for auto-creation**: Some servers create calendars on first access
8. **Consider read-only alternatives**: Many cloud providers don't support calendar creation at all

Following these practices will make your CalDAV client work reliably across the diverse landscape of CalDAV server implementations.
