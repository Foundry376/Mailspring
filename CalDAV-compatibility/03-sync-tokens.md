# Sync Token Compatibility Issues in CalDAV

## 1. Issue Summary

**Sync tokens** are a fundamental feature for efficient calendar synchronization defined in RFC 6578. They allow clients to retrieve only the changes (additions, modifications, deletions) since the last sync, rather than downloading the entire calendar on every sync operation.

**The Problem:** Despite being standardized in RFC 6578 (published in 2012), real-world CalDAV servers exhibit wildly inconsistent support for sync tokens:

- Some servers don't support sync tokens at all
- Some have "fragile" implementations that occasionally fail or return incorrect data
- Some use time-based tokens that require delays between operations
- Some fail when handling deleted objects in sync reports
- Some return 507 (Insufficient Storage) errors during sync

This inconsistency forces CalDAV clients to implement complex fallback mechanisms, significantly complicating synchronization logic.

## 2. RFC Specification: RFC 6578 "Sync-Collection Report"

RFC 6578 defines the **WebDAV Sync** extension, which provides:

### What Servers Should Provide

According to RFC 6578, a compliant server MUST:

1. **Support the `sync-collection` REPORT method** - A WebDAV REPORT that returns changes since a given sync token
2. **Return sync tokens** - Opaque tokens representing the server's state at a specific point in time
3. **Support the `DAV:sync-token` property** - Available on collections (calendars) to retrieve the current token
4. **Handle initial sync** - When no sync token is provided, return all resources (full sync)
5. **Detect invalid tokens** - Return `410 Gone` or `403 Forbidden` when presented with an invalid/expired token
6. **Report deleted resources** - Include deleted resources in the response with a `404 Not Found` status

### The Sync-Collection REPORT Structure

A typical sync-collection request looks like:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<D:sync-collection xmlns:D="DAV:">
  <D:sync-token>http://example.com/ns/sync/1234</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:prop>
    <D:getetag/>
  </D:prop>
</D:sync-collection>
```

The server responds with:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/calendars/user/cal/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"abc123"</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/calendars/user/cal/event2.ics</D:href>
    <D:status>HTTP/1.1 404 Not Found</D:status>
  </D:response>
  <D:sync-token>http://example.com/ns/sync/5678</D:sync-token>
</D:multistatus>
```

The new sync token (`5678`) should be saved for the next sync operation.

## 3. Real-World Server Behaviors

The python-caldav library has documented sync token support across numerous servers through extensive testing:

### 3.1 Servers with NO Sync Token Support

These servers don't support sync tokens at all:

- **Robur** (`'sync-token': False`)
- **GMX** (`'sync-token': {'support': 'unsupported'}`)

Clients must fall back to retrieving the entire calendar on every sync.

### 3.2 Servers with "Ungraceful" Support

These servers may throw errors when sync tokens are used:

- **Zimbra** (`'sync-token': {'support': 'ungraceful'}`)
  - Returns errors instead of gracefully handling sync token requests

- **Posteo** (`'sync-token': {'support': 'ungraceful'}`)
  - Similar behavior to Zimbra

The "ungraceful" designation means the server will return HTTP errors (often 500 or 501) rather than simply indicating lack of support.

### 3.3 Servers with "Fragile" Support

These servers claim to support sync tokens, but the implementation is unreliable:

- **Bedework** (`'sync-token': {'support': 'fragile'}`)
  - Occasionally returns more content than expected
  - Sometimes fails unpredictably

- **Synology** (`'sync-token': 'fragile'`)
  - Sync operations sometimes succeed, sometimes fail

- **DAViCal** (`'sync-token': {'support': 'fragile'}`)
  - Historic note: Uses `'fragile_sync_tokens'` in old flags
  - Unreliable sync token behavior

- **SOGo** (`'sync-token': {'support': 'fragile'}`)
  - Known issue with time-based sync tokens (see below)
  - Bug reports: https://bugs.sogo.nu/view.php?id=5163

### 3.4 Servers with "Time-Based" Tokens

**SOGo** uses time-based sync tokens with **second precision**. This creates a critical problem:

```python
# Problem: If you create/modify/delete events rapidly within the same second,
# the sync token won't change, and you'll miss changes!

# Required workaround:
import time

# Modify event
event.save()

# MUST WAIT 1 second before next sync
time.sleep(1)

# Now sync to get the changes
updates = calendar.objects_by_sync_token(last_token)
```

The `compatibility_hints.py` describes this as:
```python
"Behaviour 'time-based' indicates second-precision tokens requiring sleep(1) between operations"
```

### 3.5 Issues with Deleted Objects

**Nextcloud** had a specific issue with deleted objects in sync reports:

```python
"sync-token.delete": {
    "description": "Server correctly handles sync-collection reports after objects have been deleted from the calendar (solved in Nextcloud in https://github.com/nextcloud/server/pull/44130)"
}
```

Before this fix, Nextcloud would fail or return incorrect data when syncing after deletions.

### 3.6 Other Sync Token Failures

From the CHANGELOG:

- **Issue #340**: "507 error during collection sync" - Some servers return "507 Insufficient Storage" during sync operations, likely when the change list is too large
- **Issue #461**: "Path handling error with non-standard URL formats" led to discovering sync-token fallback needs

## 4. python-caldav Workarounds

The python-caldav library implements a sophisticated **transparent fallback mechanism** that makes sync tokens appear to work even on servers that don't support them.

### 4.1 The Transparent Fallback Mechanism

From `/tmp/python-caldav/caldav/collection.py`, the `objects_by_sync_token` method implements this logic:

```python
def objects_by_sync_token(
    self,
    sync_token: Optional[Any] = None,
    load_objects: bool = False,
    disable_fallback: bool = False,
) -> "SynchronizableCalendarObjectCollection":
    """
    This method transparently falls back to retrieving all objects if the server
    doesn't support sync tokens. The fallback behavior is identical from the user's
    perspective, but less efficient as it transfers the entire calendar on each sync.
    """
```

**The algorithm:**

1. **Check if sync tokens should be attempted:**
   ```python
   use_sync_token = True
   sync_support = self.client.features.is_supported("sync-token", return_type=dict)
   if sync_support.get("support") == "unsupported":
       if disable_fallback:
           raise error.ReportError("Sync tokens are not supported by the server")
       use_sync_token = False
   ```

2. **Detect fake tokens:**
   ```python
   # If sync_token looks like a fake token, don't try real sync-collection
   if (sync_token and isinstance(sync_token, str) and sync_token.startswith("fake-")):
       use_sync_token = False
   ```

3. **Try real sync-collection REPORT:**
   ```python
   if use_sync_token:
       try:
           cmd = dav.SyncCollection()
           token = dav.SyncToken(value=sync_token)
           level = dav.SyncLevel(value="1")
           props = dav.Prop() + dav.GetEtag()
           root = cmd + [level, token, props]
           (response, objects) = self._request_report_build_resultlist(
               root, props=[dav.GetEtag()], no_calendardata=True
           )
           # ... extract sync_token from response ...
           return SynchronizableCalendarObjectCollection(
               calendar=self, objects=objects, sync_token=sync_token
           )
       except (error.ReportError, error.DAVError) as e:
           if disable_fallback:
               raise
           log.info(f"Sync-collection REPORT failed ({e}), falling back to full retrieval")
           # Fall through to fallback implementation
   ```

4. **Fallback: Retrieve all objects and emulate sync tokens**

### 4.2 Fake Sync Token Generation

When servers don't support real sync tokens, python-caldav generates **fake tokens** based on ETags:

```python
def _generate_fake_sync_token(self, objects: List["CalendarObjectResource"]) -> str:
    """
    Generate a fake sync token for servers without sync support.
    Uses a hash of all ETags to detect changes.

    Args:
        objects: List of calendar objects to generate token from

    Returns:
        A fake sync token string
    """
    import hashlib

    etags = []
    for obj in objects:
        if hasattr(obj, "props") and dav.GetEtag.tag in obj.props:
            etags.append(str(obj.props[dav.GetEtag.tag]))
        elif hasattr(obj, "url"):
            ## If no etag, use URL as fallback identifier
            etags.append(str(obj.url.canonical()))

    etags.sort()  ## Consistent ordering
    combined = "|".join(etags)
    hash_value = hashlib.md5(combined.encode()).hexdigest()

    return f"fake-{hash_value}"
```

**How it works:**

1. Collect ETags from all calendar objects
2. Sort them for consistent ordering
3. Concatenate them with `|` separator
4. Hash with MD5
5. Prefix with `"fake-"` to distinguish from real tokens

The `"fake-"` prefix is critical - it tells the library not to attempt a real sync-collection REPORT.

### 4.3 ETag-Based Change Detection

ETags (Entity Tags) are HTTP headers that serve as version identifiers. When a fake sync token is used:

```python
# During fallback sync
all_objects = list(self.search())

# Fetch ETags for all objects if not already present
if all_objects and (
    not hasattr(all_objects[0], "props")
    or dav.GetEtag.tag not in all_objects[0].props
):
    # Do a depth-1 PROPFIND on the calendar to get all ETags
    response = self._query_properties([dav.GetEtag()], depth=1)
    etag_props = response.expand_simple_props([dav.GetEtag()])

    # Map ETags to objects by URL
    for url_str, props in etag_props.items():
        # ... match URLs and add ETags to objects ...
```

**Comparing states:**

```python
fake_sync_token = self._generate_fake_sync_token(all_objects)

if sync_token and isinstance(sync_token, str) and sync_token.startswith("fake-"):
    # Compare the provided token with the new token
    if sync_token == fake_sync_token:
        # Nothing has changed, return empty collection
        return SynchronizableCalendarObjectCollection(
            calendar=self, objects=[], sync_token=fake_sync_token
        )
    # If tokens differ, return all objects (emulating a full sync)
```

**Limitation:** The fallback mechanism can only detect that *something* changed, not *what* changed. It returns all objects when any change is detected.

### 4.4 Detecting Deleted Objects in Fallback Mode

The `SynchronizableCalendarObjectCollection.sync()` method handles deletions:

```python
def sync(self) -> Tuple[Any, Any]:
    """
    This method will contact the caldav server,
    request all changes from it, and sync up the collection.

    This method transparently falls back to comparing full calendar state
    if the server doesn't support sync tokens.
    """
    updated_objs = []
    deleted_objs = []

    # ... try real sync first ...

    # FALLBACK: Compare full calendar state
    if is_fake_token:
        # Retrieve all current objects from server
        current_objects = list(self.calendar.search())

        # Build URL-indexed dicts for comparison
        current_by_url = {obj.url.canonical(): obj for obj in current_objects}
        old_by_url = self.objects_by_url()

        # Find updated and new objects
        for url, obj in current_by_url.items():
            if url in old_by_url:
                # Object exists in both - check if modified
                old_data = old_by_url[url].data if hasattr(old_by_url[url], "data") else None
                new_data = obj.data if hasattr(obj, "data") else None
                if old_data != new_data and new_data is not None:
                    updated_objs.append(obj)
            else:
                # New object
                updated_objs.append(obj)

        # Find deleted objects
        for url in old_by_url:
            if url not in current_by_url:
                deleted_objs.append(old_by_url[url])

        # Update internal state
        self.objects = list(current_by_url.values())
        self._objects_by_url = None  # Invalidate cache
        self.sync_token = self.calendar._generate_fake_sync_token(self.objects)

    return (updated_objs, deleted_objs)
```

**How deletions are detected:**

1. Compare URLs from the previous state (`old_by_url`) with current state (`current_by_url`)
2. Any URL present in old state but not in current state = deleted object
3. Return deleted objects in the second tuple element

## 5. Implementation Guidance for New CalDAV Clients

If you're building a new CalDAV client, here's how to handle sync tokens robustly:

### 5.1 Detecting Sync Token Support

**Method 1: Try and handle errors**

```python
def supports_sync_tokens(calendar):
    """
    Attempt to use sync-collection and see if it works.
    """
    try:
        # Request with no sync token (initial sync)
        response = calendar.objects_by_sync_token(
            sync_token=None,
            disable_fallback=True  # Don't fall back, we want to test
        )
        # If we got here, it works!
        return True
    except error.ReportError:
        # Server doesn't support sync tokens
        return False
```

**Method 2: Check server capabilities (if available)**

Some servers advertise capabilities through OPTIONS requests or in collection properties.

**Method 3: Maintain a server compatibility database**

Like python-caldav does in `compatibility_hints.py`:

```python
SERVER_COMPATIBILITY = {
    "zimbra": {"sync-token": "unsupported"},
    "nextcloud": {"sync-token": "full"},
    "sogo": {"sync-token": "fragile", "time-based": True},
    # ... etc
}
```

### 5.2 Implementing a Fallback Sync Mechanism

**Step 1: Retrieve all objects and their ETags**

```python
def full_sync(calendar):
    """
    Fallback sync for servers without sync-token support.
    Returns all objects with their ETags.
    """
    # Get all calendar objects
    all_objects = calendar.search()

    # Make sure we have ETags for all objects
    # (Some servers include ETags in search results, others don't)
    if not all_objects or not hasattr(all_objects[0], 'etag'):
        # Use PROPFIND to fetch ETags
        etags = calendar.get_properties([dav.GetEtag()], depth=1)
        # ... map ETags to objects ...

    return all_objects
```

**Step 2: Generate a state snapshot**

```python
def generate_state_token(objects):
    """
    Generate a token representing the current state.
    Uses MD5 hash of all ETags.
    """
    import hashlib

    # Collect all ETags
    etags = sorted([obj.etag for obj in objects if hasattr(obj, 'etag')])

    # Hash them
    combined = "|".join(etags)
    token = hashlib.md5(combined.encode()).hexdigest()

    return f"fallback-{token}"
```

**Step 3: Compare states to detect changes**

```python
def detect_changes(old_objects, new_objects):
    """
    Compare two object lists to find additions, modifications, deletions.
    """
    # Index by URL
    old_by_url = {obj.url: obj for obj in old_objects}
    new_by_url = {obj.url: obj for obj in new_objects}

    added = []
    modified = []
    deleted = []

    # Find additions and modifications
    for url, new_obj in new_by_url.items():
        if url not in old_by_url:
            added.append(new_obj)
        elif old_by_url[url].etag != new_obj.etag:
            modified.append(new_obj)

    # Find deletions
    for url in old_by_url:
        if url not in new_by_url:
            deleted.append(old_by_url[url])

    return added, modified, deleted
```

### 5.3 Using ETags for Change Detection

ETags are crucial for the fallback mechanism:

```python
class CalendarObject:
    def __init__(self, url, etag=None, data=None):
        self.url = url
        self.etag = etag
        self.data = data

    def has_changed(self, other):
        """
        Check if this object differs from another version.
        ETags provide quick change detection without comparing full data.
        """
        if not self.etag or not other.etag:
            # No ETags available, must compare data
            return self.data != other.data

        # ETags differ = object has changed
        return self.etag != other.etag
```

**Best practices:**

1. **Always fetch ETags** - Even if the server supports sync tokens, having ETags provides a backup
2. **Cache ETags locally** - Store them with your local calendar data
3. **Use strong ETags** - If a server provides both weak (`W/"123"`) and strong (`"123"`) ETags, prefer strong ETags
4. **Handle missing ETags** - Some servers don't provide ETags; fall back to data comparison

### 5.4 Handling the "Full Sync" Case Gracefully

When sync tokens aren't available or fail, you must download the entire calendar. Make this efficient:

```python
def sync_calendar(calendar, last_sync_token=None):
    """
    Sync calendar, gracefully handling servers without sync token support.
    """
    try:
        # Try sync-collection first
        if last_sync_token:
            result = calendar.sync_collection(last_sync_token)
        else:
            result = calendar.sync_collection()  # Initial sync

        # Success! Process incremental changes
        for obj in result.modified:
            update_local_copy(obj)
        for obj in result.deleted:
            delete_local_copy(obj)

        # Save new sync token
        save_sync_token(result.sync_token)

    except SyncNotSupportedError:
        # Fall back to full sync
        log.warning("Server doesn't support sync tokens, downloading full calendar")

        # Get all objects
        all_objects = calendar.search()

        # Generate fake token for future comparisons
        fake_token = generate_state_token(all_objects)

        if last_sync_token and last_sync_token.startswith("fallback-"):
            # We have a previous state, do comparison
            old_objects = load_local_objects()
            added, modified, deleted = detect_changes(old_objects, all_objects)

            # Process changes
            for obj in added + modified:
                update_local_copy(obj)
            for obj in deleted:
                delete_local_copy(obj)
        else:
            # First sync or no previous state
            for obj in all_objects:
                update_local_copy(obj)

        # Save fake token
        save_sync_token(fake_token)
```

**Performance considerations:**

- **Minimize data transfer**: When doing full syncs, only fetch object metadata (ETags, URLs) initially
- **Lazy loading**: Only download full iCalendar data for objects that have changed
- **Batch operations**: Group requests to reduce round trips
- **Caching**: Cache ETags and metadata locally to speed up comparisons

**User experience:**

```python
def sync_with_progress(calendar, last_token, progress_callback):
    """
    Sync calendar with user feedback.
    """
    result = calendar.sync(last_token)

    if result.is_full_sync:
        # Warn user this might take a while
        progress_callback("Downloading entire calendar (server doesn't support incremental sync)...")
        total = result.total_objects
    else:
        progress_callback(f"Syncing {len(result.changed)} changed objects...")
        total = len(result.changed)

    for i, obj in enumerate(result.objects_to_process):
        progress_callback(f"Processing {i+1}/{total}...")
        process_object(obj)

    return result.sync_token
```

### 5.5 Example: Complete Sync Implementation

```python
import hashlib
from typing import List, Tuple, Optional

class SimpleCalDAVSync:
    """
    Simple CalDAV sync implementation with transparent fallback.
    """

    def __init__(self, calendar):
        self.calendar = calendar
        self.supports_sync = None  # Detect on first use

    def sync(self, last_token: Optional[str] = None) -> Tuple[List, List, str]:
        """
        Sync calendar and return (added/modified, deleted, new_token).

        Automatically falls back to full sync if server doesn't support
        sync tokens.
        """
        # Detect server support on first use
        if self.supports_sync is None:
            self.supports_sync = self._test_sync_support()

        if self.supports_sync and (not last_token or not last_token.startswith("fallback-")):
            # Try real sync-collection
            try:
                return self._real_sync(last_token)
            except Exception as e:
                # Sync failed, fall back
                self.supports_sync = False
                print(f"Sync-collection failed ({e}), using fallback mode")

        # Fallback mode
        return self._fallback_sync(last_token)

    def _test_sync_support(self) -> bool:
        """Test if server supports sync-collection."""
        try:
            # Try initial sync
            self.calendar.sync_collection(sync_token=None, limit=1)
            return True
        except:
            return False

    def _real_sync(self, token: Optional[str]) -> Tuple[List, List, str]:
        """Use server's sync-collection REPORT."""
        response = self.calendar.sync_collection(token)

        added_modified = []
        deleted = []

        for item in response.items:
            if item.status == 404:
                deleted.append(item)
            else:
                added_modified.append(item)

        return added_modified, deleted, response.sync_token

    def _fallback_sync(self, last_token: Optional[str]) -> Tuple[List, List, str]:
        """
        Fallback sync using full calendar retrieval and ETag comparison.
        """
        # Get all current objects with ETags
        current_objects = self._get_all_with_etags()

        # Generate new token
        new_token = self._generate_fallback_token(current_objects)

        # If this is first sync or token changed, we need to compare
        if not last_token:
            # Initial sync - everything is "new"
            return current_objects, [], new_token

        if last_token == new_token:
            # Nothing changed
            return [], [], new_token

        # Load previous state (you'd implement this based on your storage)
        old_objects = self._load_previous_state(last_token)

        # Compare states
        added_modified, deleted = self._compare_states(old_objects, current_objects)

        return added_modified, deleted, new_token

    def _get_all_with_etags(self) -> List:
        """Get all objects from calendar with their ETags."""
        objects = self.calendar.search()

        # Ensure all objects have ETags
        # (Implementation depends on your CalDAV library)

        return objects

    def _generate_fallback_token(self, objects: List) -> str:
        """Generate a state token from object ETags."""
        etags = sorted([obj.etag for obj in objects if hasattr(obj, 'etag')])
        combined = "|".join(etags)
        hash_val = hashlib.md5(combined.encode()).hexdigest()
        return f"fallback-{hash_val}"

    def _compare_states(self, old_objects: List, new_objects: List) -> Tuple[List, List]:
        """Compare two states to find changes."""
        old_by_url = {obj.url: obj for obj in old_objects}
        new_by_url = {obj.url: obj for obj in new_objects}

        added_modified = []
        deleted = []

        # Find new and modified
        for url, new_obj in new_by_url.items():
            if url not in old_by_url:
                added_modified.append(new_obj)
            elif old_by_url[url].etag != new_obj.etag:
                added_modified.append(new_obj)

        # Find deleted
        for url, old_obj in old_by_url.items():
            if url not in new_by_url:
                deleted.append(old_obj)

        return added_modified, deleted


# Usage example
calendar = get_caldav_calendar()
syncer = SimpleCalDAVSync(calendar)

# Initial sync
added, deleted, token = syncer.sync()
save_token_to_database(token)
print(f"Initial sync: {len(added)} objects")

# Later syncs
last_token = load_token_from_database()
added, deleted, new_token = syncer.sync(last_token)
save_token_to_database(new_token)
print(f"Sync: {len(added)} changed, {len(deleted)} deleted")
```

## 6. Performance Implications

### With Real Sync Tokens (Best Case)

```
First sync:  Download 1000 events = ~2MB
Second sync: Download 5 changed events = ~10KB (200x less!)
Third sync:  Download 2 changed events = ~4KB (500x less!)
```

### Without Sync Tokens (Fallback Mode)

```
First sync:  Download 1000 events = ~2MB
Second sync: Download 1000 events = ~2MB (all objects, every time)
Third sync:  Download 1000 events = ~2MB (all objects, every time)
```

**Fallback mode implications:**

- **Bandwidth**: 200-500x more data transferred
- **Latency**: Proportional to calendar size, not change size
- **Battery**: Mobile devices will drain faster
- **Server load**: More expensive queries on every sync
- **Sync time**: Linear with calendar size, not constant

From the python-caldav CHANGELOG:

> "Potentially major **performance problems**: rather than throwing errors, the sync-token-API may now fetch the full calendar. This change is intended to be un-breaking, but for people having very big calendars and syncing them to a mobile device with limited memory, bandwidth, CPU and battery, this change may be painful."

## 7. Recommendations

1. **Always test sync token support** - Don't assume; verify with each server
2. **Implement graceful fallback** - Make the fallback transparent to users
3. **Cache aggressively** - ETags and metadata should be persisted locally
4. **Handle time-based tokens** - Add delays when needed (especially for SOGo)
5. **Monitor for 507 errors** - Implement retry logic with exponential backoff
6. **Warn users** - When using fallback mode on large calendars, inform users about performance impact
7. **Consider alternatives** - For servers with poor sync support, consider periodic full sync at user's discretion

## 8. Testing Sync Token Implementations

```python
def test_sync_tokens(calendar):
    """
    Comprehensive sync token test suite.
    """
    print("Testing sync token support...")

    # Test 1: Initial sync
    print("Test 1: Initial sync")
    result1 = calendar.objects_by_sync_token()
    assert result1.sync_token is not None
    initial_count = len(result1.objects)
    print(f"  ✓ Got {initial_count} objects and token: {result1.sync_token[:20]}...")

    # Test 2: No changes
    print("Test 2: Sync with no changes")
    result2 = calendar.objects_by_sync_token(result1.sync_token)
    assert len(result2.objects) == 0, "Should return no objects when nothing changed"
    print("  ✓ Correctly returned 0 objects")

    # Test 3: Add object
    print("Test 3: Add new object")
    new_event = calendar.save_event(summary="Test Event", dtstart=datetime.now())
    result3 = calendar.objects_by_sync_token(result2.sync_token)
    assert len(result3.objects) >= 1, "Should return at least the new object"
    print(f"  ✓ Returned {len(result3.objects)} changed objects")

    # Test 4: Modify object
    print("Test 4: Modify object")
    new_event.instance.vevent.summary.value = "Modified Event"
    new_event.save()
    result4 = calendar.objects_by_sync_token(result3.sync_token)
    assert len(result4.objects) >= 1, "Should return the modified object"
    print(f"  ✓ Returned {len(result4.objects)} changed objects")

    # Test 5: Delete object
    print("Test 5: Delete object")
    new_event.delete()
    result5 = calendar.objects_by_sync_token(result4.sync_token)
    # Should contain deleted object with 404 status (if real sync)
    # or detect deletion via URL comparison (if fallback)
    print(f"  ✓ Sync after deletion returned {len(result5.objects)} objects")

    # Test 6: Rapid changes (tests time-based tokens)
    print("Test 6: Rapid changes (time-based token test)")
    import time
    event1 = calendar.save_event(summary="Rapid 1", dtstart=datetime.now())
    time.sleep(1.1)  # Wait for time-based token to advance
    event2 = calendar.save_event(summary="Rapid 2", dtstart=datetime.now())
    result6 = calendar.objects_by_sync_token(result5.sync_token)
    assert len(result6.objects) >= 2, "Should detect both rapid changes"
    print(f"  ✓ Detected {len(result6.objects)} rapid changes")

    # Clean up
    event1.delete()
    event2.delete()

    print("\nAll sync token tests passed!")
```

## Conclusion

Sync tokens are essential for efficient CalDAV synchronization, but real-world server support is inconsistent. The python-caldav library's transparent fallback mechanism provides an excellent blueprint for handling this:

1. **Try real sync tokens first** - Most modern servers support them
2. **Detect failures gracefully** - Catch errors and fall back
3. **Use ETags as a proxy** - When real tokens aren't available, ETag hashing provides change detection
4. **Make fallback transparent** - Users shouldn't need to know the difference
5. **Optimize for the common case** - Most objects don't change between syncs

By following these patterns, you can build a CalDAV client that works reliably across the diverse ecosystem of CalDAV servers, from fully-compliant modern implementations to legacy servers with minimal sync support.
