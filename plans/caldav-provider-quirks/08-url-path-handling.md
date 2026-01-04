# CalDAV URL and Path Handling Compatibility Issues

## Issue Summary

CalDAV servers exhibit significant inconsistencies in how they handle URLs and paths in WebDAV responses, particularly when special characters are involved. The python-caldav library must navigate several compatibility challenges:

1. **Inconsistent URL encoding in responses**: Some servers return already-quoted URLs (e.g., `%40` for `@`), while others return unquoted URLs
2. **Double-encoding edge cases**: Some servers double-encode special characters (e.g., `%2540` instead of `%40`)
3. **Absolute vs. relative URLs**: Servers may return full absolute URLs or relative paths in PROPFIND/REPORT responses
4. **Special characters in paths**: Characters like `@`, spaces, and Unicode in calendar names or user paths require careful handling
5. **Path trailing slashes**: Inconsistent handling of whether collection URLs end with `/`

These issues can cause path comparison failures, resource not found errors, and other subtle bugs if not handled carefully.

---

## Expected Behavior (WebDAV/CalDAV Specifications)

### RFC 4918 (WebDAV) on URLs in Responses

According to RFC 4918, Section 8.3:

> "The value of a href element MUST be a URI-reference."

The specification requires that URLs in responses should be properly encoded, but doesn't specify whether servers should return:
- Absolute URLs (`https://server.com/path/to/resource`)
- Absolute paths (`/path/to/resource`)
- Relative paths (`resource` or `../other/resource`)

**Key ambiguity**: The spec allows all three forms, but doesn't specify if paths should be returned in their original form or percent-encoded.

### RFC 3986 (URI Generic Syntax) on Percent-Encoding

RFC 3986, Section 2.1 states:

> "A percent-encoding mechanism is used to represent a data octet in a component when that octet's corresponding character is outside the allowed set or is being used as a delimiter."

Reserved characters that must be percent-encoded include: `:`, `/`, `?`, `#`, `[`, `]`, `@`, `!`, `$`, `&`, `'`, `(`, `)`, `*`, `+`, `,`, `;`, `=`

**The `@` character issue**: The `@` character is reserved in URLs (used in `user@host` syntax), so:
- In path components: `@` should be encoded as `%40`
- In userinfo components: `@` is used as a delimiter and should NOT be encoded

### The Specification Gap

The specs don't clearly define:
1. Whether responses should contain already percent-encoded paths or raw paths
2. How to handle paths that were originally stored with special characters
3. How clients should normalize URLs for comparison

This ambiguity leads to different server implementations making different choices.

---

## Real-World Server Behaviors

### Servers Returning Quoted URLs

**ownCloud/Nextcloud**: Returns paths with `@` characters percent-encoded

```xml
<!-- calendar-home-set response from Nextcloud -->
<d:href>/remote.php/dav/calendars/user%40example.com/</d:href>
```

**Workaround location**: `caldav/collection.py`, lines 301-310

```python
## owncloud returns /remote.php/dav/calendars/tobixen@e.email/
## in that case the @ should be quoted.  Perhaps other
## implementations return already quoted URLs.  Hacky workaround:
if (
    calendar_home_set_url is not None
    and "@" in calendar_home_set_url
    and "://" not in calendar_home_set_url
):
    calendar_home_set_url = quote(calendar_home_set_url)
```

**Issue**: The client receives `/remote.php/dav/calendars/user@example.com/` and must encode it to `/remote.php/dav/calendars/user%40example.com/` before comparing or using it.

### Servers Returning Unquoted URLs

**DAViCal, Radicale, Xandikos**: Return paths without percent-encoding special characters

```xml
<!-- Response from DAViCal -->
<d:href>/caldav.php/user@example.com/calendar/</d:href>
```

The client must accept these unquoted paths and handle them correctly.

### Servers with Double-Encoding

**Confluence Server**: Double-encodes `@` symbols

**Workaround location**: `caldav/davclient.py`, lines 355-359

```python
# Fix for https://github.com/python-caldav/caldav/issues/471
# Confluence server quotes the user email twice. We unquote it manually.
if "%2540" in elem.text:
    elem.text = elem.text.replace("%2540", "%40")
href = unquote(elem.text)
```

**Issue**: The server sends `user%2540example.com` (where `%25` is an encoded `%`, resulting in `%2540` = encoded `%40`). This must be normalized to `user@example.com`.

### Servers Returning Absolute URLs

**Purelymail**: Returns full absolute URLs instead of paths

**Workaround location**: `caldav/davclient.py`, lines 382-387

```python
## TODO: is this safe/sane?
## Ref https://github.com/python-caldav/caldav/issues/435 the paths returned may be absolute URLs,
## but the caller expects them to be paths.  Could we have issues when a server has same path
## but different URLs for different elements?  Perhaps href should always be made into an URL-object?
if ":" in href:
    href = unquote(URL(href).path)
```

**Issue**: The server returns `https://caldav.purelymail.com/user/calendar/event.ics` when the client expects just `/user/calendar/event.ics`.

### Path Trailing Slash Inconsistencies

**Various Servers**: Some return collection URLs with trailing `/`, others without

**Workaround location**: `caldav/davobject.py`, lines 304-327

```python
path = unquote(self.url.path)
if path.endswith("/"):
    exchange_path = path[:-1]
else:
    exchange_path = path + "/"

if path in properties:
    rc = properties[path]
elif exchange_path in properties:
    if not isinstance(self, Principal):
        log.warning(
            "potential path handling problem with ending slashes.  Path given: %s, path found: %s.  %s"
            % (path, exchange_path, error.ERR_FRAGMENT)
        )
        error.assert_(False)
    rc = properties[exchange_path]
```

**Issue**: A calendar at `/calendars/user/work` might be returned as `/calendars/user/work/` in responses, causing path matching to fail.

---

## python-caldav Workarounds

### The URL Class and Canonicalization

The `URL` class (in `caldav/lib/url.py`) wraps URL handling to provide consistent behavior.

#### URL.canonical() Method

Located at `caldav/lib/url.py`, lines 144-171:

```python
def canonical(self) -> "URL":
    """
    a canonical URL ... remove authentication details, make sure there
    are no double slashes, and to make sure the URL is always the same,
    run it through the urlparser, and make sure path is properly quoted
    """
    url = self.unauth()

    arr = list(cast(urllib.parse.ParseResult, self.url_parsed))
    ## quoting path and removing double slashes
    arr[2] = quote(unquote(url.path.replace("//", "/")))
    ## sensible defaults
    if not arr[0]:
        arr[0] = "https"
    if arr[1] and ":" not in arr[1]:
        if arr[0] == "https":
            portpart = ":443"
        elif arr[0] == "http":
            portpart = ":80"
        else:
            portpart = ""
        arr[1] += portpart

    # make sure to delete the string version
    url.url_raw = urlunparse(arr)
    url.url_parsed = None

    return url
```

**Key operations**:
1. Remove authentication details (username/password)
2. Remove double slashes: `path.replace("//", "/")`
3. Normalize encoding: `quote(unquote(path))` - unquote first to handle already-quoted URLs, then re-quote
4. Add default scheme (`https`) and port (`:443` or `:80`)

**Normalization strategy**: The `quote(unquote())` pattern is crucial:
- First `unquote()`: Converts `%40` → `@`, `%2540` → `%40` → `@`
- Then `quote()`: Converts `@` → `%40`
- Result: Consistent encoding regardless of input

### URL Joining for Relative Paths

Located at `caldav/lib/url.py`, lines 173-208:

```python
def join(self, path: Any) -> "URL":
    """
    assumes this object is the base URL or base path.  If the path
    is relative, it should be appended to the base.  If the path
    is absolute, it should be added to the connection details of
    self.  If the path already contains connection details and the
    connection details differ from self, raise an error.
    """
    pathAsString = str(path)
    if not path or not pathAsString:
        return self
    path = URL.objectify(path)
    if (
        (path.scheme and self.scheme and path.scheme != self.scheme)
        or (path.hostname and self.hostname and path.hostname != self.hostname)
        or (path.port and self.port and path.port != self.port)
    ):
        raise ValueError("%s can't be joined with %s" % (self, path))

    if path.path[0] == "/":
        ret_path = path.path
    else:
        sep = "/"
        if self.path.endswith("/"):
            sep = ""
        ret_path = "%s%s%s" % (self.path, sep, path.path)
    return URL(
        ParseResult(
            self.scheme or path.scheme,
            self.netloc or path.netloc,
            ret_path,
            path.params,
            path.query,
            path.fragment,
        )
    )
```

**Key logic**:
1. Validate that connection details don't conflict
2. If path starts with `/`, it's absolute - use as-is
3. If path is relative, join with proper `/` separator
4. Preserve scheme, netloc from base or path

### Quote/Unquote Handling in Responses

Located at `caldav/davclient.py`, lines 355-387:

```python
for elem in response:
    # ...
    elif elem.tag == dav.Href.tag:
        assert not href
        # Fix for https://github.com/python-caldav/caldav/issues/471
        # Confluence server quotes the user email twice. We unquote it manually.
        if "%2540" in elem.text:
            elem.text = elem.text.replace("%2540", "%40")
        href = unquote(elem.text)
    # ...

# Later in the same method:
## TODO: is this safe/sane?
## Ref https://github.com/python-caldav/caldav/issues/435 the paths returned may be absolute URLs,
## but the caller expects them to be paths.  Could we have issues when a server has same path
## but different URLs for different elements?  Perhaps href should always be made into an URL-object?
if ":" in href:
    href = unquote(URL(href).path)
return (cast(str, href), propstats, status)
```

**Strategy**:
1. Detect and fix double-encoding (`%2540` → `%40`)
2. Unquote all hrefs to get raw paths
3. Handle absolute URLs by extracting just the path component
4. Return unquoted paths for further processing

### Special Handling in Search Results

Located at `caldav/collection.py`, lines 800-815:

```python
url = URL(r)
if url.hostname is None:
    # Quote when result is not a full URL
    url = quote(r)
## icloud hack - icloud returns the calendar URL as well as the calendar item URLs
if self.url.join(url) == self.url:
    continue
matches.append(
    comp_class_(
        self.client,
        url=self.url.join(url),
        data=cdata,
        parent=self,
        props=pdata,
    )
)
```

**Logic**:
1. If response doesn't have a hostname (i.e., it's a path), quote it
2. Skip results where the joined URL equals the collection URL (iCloud quirk)
3. Join the URL with the collection base URL

---

## Implementation Guidance: Best Practices for CalDAV Clients

### 1. Always Use a URL Wrapper Class

Create a URL abstraction that handles:
- Parsing (scheme, hostname, path, etc.)
- Canonicalization
- Joining relative/absolute paths
- Comparison

**Example from python-caldav**:

```python
# Good
url1 = URL("https://server.com/path/to/calendar/")
url2 = URL("/path/to/calendar")
if url1.canonical() == url2.canonical():
    # Will match even with different representations
```

### 2. Implement Robust Canonicalization

Your canonical form should:
- Remove authentication details for comparison
- Normalize path encoding: `quote(unquote(path))`
- Remove double slashes
- Add default ports
- Handle trailing slashes consistently

**Example canonicalization algorithm**:

```python
def canonicalize(url_string):
    parsed = urlparse(url_string)

    # Remove auth
    netloc = parsed.hostname
    if parsed.port:
        netloc += f":{parsed.port}"
    elif parsed.scheme == "https":
        netloc += ":443"
    elif parsed.scheme == "http":
        netloc += ":80"

    # Normalize path
    path = quote(unquote(parsed.path.replace("//", "/")))

    return urlunparse((
        parsed.scheme or "https",
        netloc,
        path,
        parsed.params,
        parsed.query,
        parsed.fragment
    ))
```

### 3. Handle Both Quoted and Unquoted Responses

Always unquote hrefs from server responses first, then re-quote as needed:

```python
# Server might send: /calendar/user%40example.com/event.ics
# Or: /calendar/user@example.com/event.ics

# Solution:
href = unquote(server_href)  # Always unquote first
# Now href is in consistent unquoted form: /calendar/user@example.com/event.ics

# When constructing URLs for requests, quote the path:
request_url = f"{base_url}{quote(href)}"
```

### 4. Detect and Fix Double-Encoding

Check for common double-encoding patterns before processing:

```python
def fix_double_encoding(href):
    """Fix common double-encoding issues"""
    # %2540 = encoded %40 (encoded @)
    if "%2540" in href:
        href = href.replace("%2540", "%40")

    # %252F = encoded %2F (encoded /)
    if "%252F" in href:
        href = href.replace("%252F", "%2F")

    return href
```

### 5. Accept Both Absolute URLs and Relative Paths

Server responses might contain either form:

```python
def normalize_href(href, base_url):
    """Normalize href to an absolute URL"""

    # Check if it's already an absolute URL
    if "://" in href:
        # Extract just the path if needed
        parsed = urlparse(href)
        # Optionally validate the hostname matches base
        return href

    # It's a relative path, join with base
    if href.startswith("/"):
        # Absolute path
        parsed_base = urlparse(base_url)
        return f"{parsed_base.scheme}://{parsed_base.netloc}{href}"
    else:
        # Relative path
        return urljoin(base_url, href)
```

### 6. Handle Special Characters in Calendar/User Names

When creating calendars or handling user-provided names:

```python
def create_calendar_path(username, calendar_name):
    """Create a properly encoded calendar path"""

    # Quote both components separately
    safe_username = quote(username, safe='')  # Encode everything
    safe_calendar = quote(calendar_name, safe='')

    return f"/calendars/{safe_username}/{safe_calendar}/"
```

### 7. Trailing Slash Consistency

Decide on a policy and enforce it:

**Option A**: Always use trailing slashes for collections

```python
def ensure_collection_slash(url):
    """Ensure collection URLs end with /"""
    return url if url.endswith("/") else url + "/"
```

**Option B**: Strip for comparison, but preserve server's choice when using URLs

```python
def paths_equal(path1, path2):
    """Compare paths, ignoring trailing slash differences"""
    return path1.rstrip("/") == path2.rstrip("/")
```

Python-caldav uses option B in most places (see `URL.strip_trailing_slash()`).

### 8. Test Against Multiple Server Implementations

Different servers have different quirks. Test your implementation against:
- **Nextcloud/ownCloud**: URL encoding in paths with `@`
- **Confluence**: Double-encoding
- **Purelymail**: Absolute URLs
- **iCloud**: Extra calendar URLs in search results
- **Google**: Various quirks in responses

### 9. Use Logging for URL Operations

Log URL transformations to help debug issues:

```python
log.debug(f"Original href: {original_href}")
log.debug(f"After unquote: {unquoted_href}")
log.debug(f"After join: {joined_url}")
log.debug(f"Canonical form: {canonical_url}")
```

### 10. Consider Path vs. URL Throughout Your Code

Be explicit about whether a variable contains:
- A full URL (`https://server.com/path`)
- An absolute path (`/path`)
- A relative path (`resource` or `../other`)

Use clear variable names: `resource_url`, `resource_path`, `relative_path`

---

## Common Pitfalls to Avoid

### ❌ Don't: Assume paths are always quoted/unquoted

```python
# Bad - assumes path is already quoted
full_url = base_url + path
```

### ✅ Do: Always normalize

```python
# Good - normalize first
full_url = base_url.join(URL(path))
```

---

### ❌ Don't: Compare URLs as strings

```python
# Bad - will fail with encoding differences
if url1 == url2:
```

### ✅ Do: Compare canonical forms

```python
# Good
if URL(url1).canonical() == URL(url2).canonical():
```

---

### ❌ Don't: Ignore URL schemes/ports in comparison

```python
# Bad - misses port differences
if url1.path == url2.path:
```

### ✅ Do: Use full URL comparison

```python
# Good - catches all differences
if url1.canonical() == url2.canonical():
```

---

### ❌ Don't: Manually concatenate paths

```python
# Bad - doesn't handle slashes correctly
full_path = base + "/" + relative
```

### ✅ Do: Use proper joining logic

```python
# Good
full_path = urljoin(base, relative)
# Or use a URL class with join method
```

---

## Summary

URL and path handling in CalDAV is complicated by:
1. Spec ambiguities around encoding in responses
2. Different server implementations making different choices
3. Special characters requiring careful encoding
4. Absolute vs. relative URL variations

The python-caldav library demonstrates a robust approach:
- **URL wrapper class** with canonicalization
- **Quote/unquote normalization** to handle mixed encoding
- **Defensive handling** of server quirks (double-encoding, absolute URLs, etc.)
- **Consistent comparison** using canonical forms

When implementing CalDAV clients, invest in proper URL handling infrastructure early - it will save countless debugging hours later.

---

## References

- RFC 4918 (WebDAV): https://tools.ietf.org/html/rfc4918
- RFC 3986 (URI Generic Syntax): https://tools.ietf.org/html/rfc3986
- RFC 4791 (CalDAV): https://tools.ietf.org/html/rfc4791
- Python-caldav issue #471 (Confluence double-encoding): https://github.com/python-caldav/caldav/issues/471
- Python-caldav issue #435 (Purelymail absolute URLs): https://github.com/python-caldav/caldav/issues/435
- Python-caldav issue #461 (Path handling errors): https://github.com/python-caldav/caldav/issues/461

---

**Document Version**: 1.0
**Last Updated**: 2026-01-04
**Python-caldav Version Analyzed**: 2.2.3
