# HTTP-Level Protocol Compatibility Issues

This document covers HTTP-level protocol compatibility problems encountered in CalDAV implementations, including Content-Type handling, authentication headers, HTTP/2 multiplexing, and custom headers.

---

## 1. Issue Summary

CalDAV clients must handle several HTTP-level protocol deviations from standards:

1. **XML responses with incorrect Content-Type headers** - Servers returning XML data but marking it as `text/plain` or other non-XML types
2. **WWW-Authenticate header parsing complexity** - Headers that may include commas, spaces, and additional parameters requiring careful parsing
3. **Authentication header case sensitivity** - Some servers are case-sensitive on authentication-related headers despite HTTP headers being case-insensitive per spec
4. **HTTP/2 multiplexing authentication failures** - Certain servers (notably Baikal) fail authentication when HTTP/2 connection multiplexing is enabled
5. **Custom header handling** - User-Agent strings and custom headers that may be overridden or cause issues

---

## 2. Expected Behavior (HTTP Specifications)

### Content-Type Header (RFC 7231)

**Expected behavior:**
- Servers SHOULD return `Content-Type: text/xml` or `Content-Type: application/xml` for XML responses
- Servers SHOULD return `Content-Type: text/calendar` for iCalendar data
- The `Content-Type` header indicates the media type of the response body

**Reality:** Many CalDAV servers return incorrect Content-Type headers, particularly for error responses or in certain server configurations.

### WWW-Authenticate Header (RFC 7235)

**Expected format:**
```
WWW-Authenticate: Basic realm="Example"
WWW-Authenticate: Digest realm="Example", qop="auth", nonce="..."
WWW-Authenticate: Bearer realm="Example"
```

**Specification notes:**
- Multiple challenges can be in one header separated by commas: `WWW-Authenticate: Basic, Digest realm="..."`
- Authentication schemes are case-insensitive
- Parameters follow the scheme name

**Reality:** Servers vary in formatting - some use commas without spaces, some include newlines, some have varying capitalization.

### HTTP Header Case Sensitivity (RFC 7230 § 3.2)

**Expected behavior:**
- HTTP header field names are **case-insensitive**
- `WWW-Authenticate`, `www-authenticate`, and `Www-Authenticate` should all be treated identically

**Reality:** Most modern servers and frameworks respect case-insensitivity, but implementation bugs can occur.

### HTTP/2 (RFC 7540)

**Expected behavior:**
- HTTP/2 multiplexing allows multiple request/response pairs over a single TCP connection
- Authentication should work identically whether HTTP/2 multiplexing is enabled or not

**Reality:** Some server implementations have bugs where authentication fails when HTTP/2 multiplexing is enabled.

---

## 3. Real-World Server Behaviors

### iCloud and OX: XML with Wrong Content-Type

**Issue:** iCloud and OX (Open-Xchange) servers return XML responses but mark them with incorrect Content-Type headers.

**Example:**
```http
HTTP/1.1 207 Multi-Status
Content-Type: text/plain; charset=utf-8
Content-Length: 1234

<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <!-- Valid XML response -->
</multistatus>
```

**Reference:** [python-caldav issue #142](https://github.com/python-caldav/caldav/issues/142)

**Impact:** Clients that strictly validate Content-Type before parsing will fail to process valid XML responses.

### WWW-Authenticate Header Variations

**Issue:** Different servers format the WWW-Authenticate header differently.

**Examples observed:**

```http
# Comma without space
WWW-Authenticate: Basic,Digest realm="example.com"

# Comma with space
WWW-Authenticate: Basic, Digest realm="example.com"

# With newline
WWW-Authenticate: Basic\n

# With parameters
WWW-Authenticate: Basic Realm=foo;charset="UTF-8"

# Case variations
WWW-Authenticate: basic realm="example"
WWW-Authenticate: BASIC REALM="example"
```

### Baikal: HTTP/2 Multiplexing Authentication Failures

**Issue:** Baikal server (specifically the `chulka/baikal:nginx` Docker image) fails to authenticate requests when HTTP/2 connection multiplexing is enabled.

**Symptoms:**
- Initial connection attempt with HTTP/2 multiplexing enabled
- Server returns `401 Unauthorized` even with correct credentials
- Disabling multiplexing resolves the issue

**Reference:** [python-caldav issue #564](https://github.com/python-caldav/caldav/issues/564)

**Affected versions:** Baikal with nginx (specific versions using HTTP/2)

### Header Case Sensitivity Edge Cases

While most servers correctly implement case-insensitive header handling, some edge cases exist:

**Issue:** Custom server implementations or proxies may incorrectly implement case-sensitive header matching.

**Example scenario:**
```python
# Client sends:
headers = {"authorization": "Basic dXNlcjpwYXNz"}

# Some buggy servers might only recognize:
headers = {"Authorization": "Basic dXNlcjpwYXNz"}
```

---

## 4. python-caldav Workarounds

### 4.1 Content-Type Validation Bypass

**Location:** `/tmp/python-caldav/caldav/davclient.py` lines 203-261

**Strategy:** Always attempt to parse response as XML, regardless of Content-Type header.

**Code implementation:**

```python
# From davclient.py lines 203-240
def __init__(self, response: Response, davclient: Optional["DAVClient"] = None) -> None:
    self.headers = response.headers
    self.status = response.status_code

    self._raw = response.content
    self.davclient = davclient
    if davclient:
        self.huge_tree = davclient.huge_tree

    content_type = self.headers.get("Content-Type", "")
    xml = ["text/xml", "application/xml"]
    no_xml = ["text/plain", "text/calendar", "application/octet-stream"]
    expect_xml = any((content_type.startswith(x) for x in xml))
    expect_no_xml = any((content_type.startswith(x) for x in no_xml))

    if (content_type and not expect_xml and not expect_no_xml
        and response.status_code < 400 and response.text):
        error.weirdness(f"Unexpected content type: {content_type}")

    # Key workaround: Always try to parse as XML
    try:
        ## https://github.com/python-caldav/caldav/issues/142
        ## We cannot trust the content-type (iCloud, OX and others).
        ## We'll try to parse the content as XML no matter
        ## the content type given.
        self.tree = etree.XML(
            self._raw,
            parser=etree.XMLParser(
                remove_blank_text=True, huge_tree=self.huge_tree
            ),
        )
    except:
        ## Content wasn't XML. What does the content-type say?
        if not expect_no_xml or log.level <= logging.DEBUG:
            if not expect_no_xml:
                _log = logging.info
            else:
                _log = logging.debug
            _log(
                "Expected some valid XML from the server, but got this: \n"
                + str(self._raw),
                exc_info=True,
            )
        if expect_xml:
            raise
```

**Key points:**
- Try parsing XML **first**, before checking Content-Type
- Only raise an error if Content-Type explicitly says "XML" but parsing fails
- Log warnings for unexpected content types but continue processing
- Downgraded from CRITICAL to INFO/DEBUG logging (v2.2.1, CHANGELOG line 63)

### 4.2 WWW-Authenticate Header Parsing

**Location:** `/tmp/python-caldav/caldav/davclient.py` line 945-951

**Strategy:** Robust parsing that handles commas, spaces, and case variations.

**Code implementation:**

```python
def extract_auth_types(self, header: str):
    """This is probably meant for internal usage.  It takes the
    headers it got from the server and figures out what
    authentication types the server supports
    """
    # https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/WWW-Authenticate#syntax
    return {h.split()[0] for h in header.lower().split(",")}
```

**Parsing algorithm:**
1. Convert entire header to lowercase (handles case variations)
2. Split on commas (handles multiple auth types)
3. Take first token after splitting on whitespace (extracts scheme name)
4. Return as set (deduplicates)

**Test cases:** (from `/tmp/python-caldav/tests/test_caldav_unit.py` lines 1511-1519)

```python
assert client.extract_auth_types("Basic\n") == {"basic"}
assert client.extract_auth_types("Basic") == {"basic"}
assert client.extract_auth_types('Basic Realm=foo;charset="UTF-8"') == {"basic"}
assert client.extract_auth_types("Basic,dIGEST Realm=foo") == {"basic", "digest"}
```

**Handles:**
- Trailing newlines
- Mixed case (`Basic`, `basic`, `BASIC`)
- Parameters after scheme name (`realm=`, `charset=`)
- Comma-separated multiple schemes
- No spaces after commas

### 4.3 Case-Insensitive Header Handling

**Location:** `/tmp/python-caldav/caldav/davclient.py` lines 1079, 645

**Strategy:** Use `CaseInsensitiveDict` for all header operations.

**Code implementation:**

```python
# Line 27 - Import
from requests.structures import CaseInsensitiveDict

# Line 645-651 - Building request headers
self.headers = CaseInsensitiveDict(
    {
        "User-Agent": "python-caldav/" + __version__,
        "Content-Type": "text/xml",
        "Accept": "text/xml, text/calendar",
    }
)

# Line 1079 - Processing response headers
r_headers = CaseInsensitiveDict(r.headers)
if (r.status_code == 401
    and "WWW-Authenticate" in r_headers  # Case-insensitive lookup
    and not self.auth
    and (self.username or self.password)):
    auth_types = self.extract_auth_types(r_headers["WWW-Authenticate"])
```

**Benefits:**
- `"WWW-Authenticate"`, `"www-authenticate"`, and `"Www-Authenticate"` all work
- Protects against buggy servers that might be case-sensitive
- Standards-compliant behavior per RFC 7230

### 4.4 HTTP/2 Multiplexing Workarounds

**Location:** `/tmp/python-caldav/caldav/davclient.py` lines 610-613, 1111-1120

**Strategy:** Disable multiplexing for known-problematic servers, with automatic fallback on auth failures.

**Initial session setup:**

```python
# Lines 610-613
try:
    multiplexed = self.features.is_supported("http.multiplexing")
    self.session = requests.Session(multiplexed=multiplexed)
except TypeError:
    self.session = requests.Session()
```

**Automatic retry on authentication failure:**

```python
# Lines 1111-1120
## Most likely we're here due to wrong username/password
## combo, but it could also be a multiplexing problem.
if (self.features.is_supported("http.multiplexing", return_defaults=False)
    is None):
    self.session = requests.Session()
    self.features.set_feature("http.multiplexing", "unknown")
    ## If this one also fails, we give up
    ret = self.request(str(url_obj), method, body, headers)
    self.features.set_feature("http.multiplexing", False)
    return ret
```

**Configuration for Baikal:** (from `/tmp/python-caldav/caldav/compatibility_hints.py`)

```python
# Line 907
"http.multiplexing": "fragile",  ## ref https://github.com/python-caldav/caldav/issues/564
```

**Feature flag description:**

```python
# Lines 96-98
"http.multiplexing": {
    "description": "chulka/baikal:nginx is having Problems with using HTTP/2 with
                    multiplexing, ref https://github.com/python-caldav/caldav/issues/564.
                    I haven't (yet) been able to reproduce this locally, so no check
                    for this yet. We'll define it as fragile in the radicale config as
                    for now"
}
```

**Changelog entry (v2.2.3):**

> Some servers did not support the combination of HTTP/2-multiplexing and authentication. Two workarounds fixed; baikal will specifically not use multiplexing, and an attempt to authenticate without multiplexing will be made upon authentication problems. Fixes https://github.com/python-caldav/caldav/issues/564

### 4.5 Custom Headers and User-Agent Handling

**Location:** `/tmp/python-caldav/caldav/davclient.py` lines 645-652, 1003-1006

**Issue:** Custom headers should not be overridden by defaults.

**Default headers:**

```python
# Lines 645-651
self.headers = CaseInsensitiveDict(
    {
        "User-Agent": "python-caldav/" + __version__,
        "Content-Type": "text/xml",
        "Accept": "text/xml, text/calendar",
    }
)
self.headers.update(headers or {})
```

**User-Agent evolution:**
- **v1.3**: Default was `Mozilla/5`
- **v1.4+**: Changed to `python-caldav/{version}` (CHANGELOG line 452)

**Custom header override:**

```python
# Lines 1003-1006
combined_headers = self.headers.copy()
combined_headers.update(headers or {})  # Custom headers take precedence
if (body is None or body == "") and "Content-Type" in combined_headers:
    del combined_headers["Content-Type"]  # Don't send Content-Type for empty body
```

**Key fix (v1.4):**
> Jason Yau introduced the possibility to add arbitrary headers - but things like User-Agent would anyway always be overwritten. Now the custom logic takes precedence. Pull request https://github.com/python-caldav/caldav/pull/386, issue https://github.com/python-caldav/caldav/issues/385

**Best practice:**

```python
# Client can now override User-Agent
client = DAVClient(
    url="https://example.com/caldav",
    username="user",
    password="pass",
    headers={
        "User-Agent": "MyCustomApp/1.0",
        "X-Custom-Header": "custom-value"
    }
)
```

### 4.6 Authentication Retry Logic

**Location:** `/tmp/python-caldav/caldav/davclient.py` lines 1059-1138

**Strategy:** Multi-layered retry logic for authentication failures.

**Retry scenarios:**

**Scenario 1: No auth object, credentials provided**
```python
# Lines 1080-1095
if (r.status_code == 401
    and "WWW-Authenticate" in r_headers
    and not self.auth
    and (self.username or self.password)):
    auth_types = self.extract_auth_types(r_headers["WWW-Authenticate"])
    self.build_auth_object(auth_types)

    if not self.auth:
        raise NotImplementedError(
            "The server does not provide any of the currently "
            "supported authentication methods: basic, digest, bearer"
        )

    return self.request(url, method, body, headers)  # Retry with auth
```

**Scenario 2: Auth failed, might be charset issue**
```python
# Lines 1097-1138
elif (r.status_code == 401
      and "WWW-Authenticate" in r_headers
      and self.auth
      and self.password
      and isinstance(self.password, bytes)):

    ## Most likely wrong username/password, but could be multiplexing
    if self.features.is_supported("http.multiplexing", return_defaults=False) is None:
        self.session = requests.Session()  # Disable multiplexing
        self.features.set_feature("http.multiplexing", "unknown")
        ret = self.request(str(url_obj), method, body, headers)
        self.features.set_feature("http.multiplexing", False)
        return ret

    ## Could be charset problems (ancient SabreDAV servers)
    auth_types = self.extract_auth_types(r_headers["WWW-Authenticate"])
    self.password = self.password.decode()
    self.build_auth_object(auth_types)

    self.username = None
    self.password = None

    return self.request(str(url_obj), method, body, headers)
```

**Retry sequence on 401:**
1. **First attempt:** Send request without auth
2. **On 401:** Parse WWW-Authenticate, build auth object, retry
3. **On second 401 (if bytes password):**
   - Try disabling HTTP/2 multiplexing (Baikal workaround)
   - Try decoding password from bytes to string (ancient server workaround)

### 4.7 Connection Abort Workaround

**Location:** `/tmp/python-caldav/caldav/davclient.py` lines 1059-1076

**Issue:** Some servers abort connections instead of returning 401 for unauthenticated requests with a body.

**Workaround:**

```python
try:
    r = self.session.request(
        method, str(url_obj), data=to_wire(body),
        headers=combined_headers, proxies=proxies,
        auth=self.auth, timeout=self.timeout,
        verify=self.ssl_verify_cert, cert=self.ssl_cert,
    )
except:
    ## Workaround for weird servers that abort connection
    ## instead of sending 401 - ref https://github.com/python-caldav/caldav/issues/158
    if self.auth or not self.password:
        raise

    r = self.session.request(
        method="GET",  # Try GET without body
        url=str(url_obj),
        headers=combined_headers,
        proxies=proxies,
        timeout=self.timeout,
        verify=self.ssl_verify_cert,
        cert=self.ssl_cert,
    )
    if not r.status_code == 401:
        raise
```

**Reference:** [python-caldav issue #158](https://github.com/python-caldav/caldav/issues/158)

---

## 5. Implementation Guidance for CalDAV Clients

### 5.1 Content-Type Handling Best Practices

**DO:**
```python
# Always attempt to parse as XML first
try:
    xml_tree = parse_xml(response.content)
except XMLParseError:
    # Only then check Content-Type
    if response.headers.get("Content-Type", "").startswith("text/xml"):
        raise  # Expected XML but got garbage
    # Otherwise, treat as non-XML content
```

**DON'T:**
```python
# Don't trust Content-Type blindly
if response.headers.get("Content-Type") == "text/xml":
    xml_tree = parse_xml(response.content)
else:
    # iCloud/OX responses will be missed!
    handle_non_xml(response.content)
```

**Recommended approach:**
1. Try parsing response as XML regardless of Content-Type
2. If parsing succeeds, treat as XML
3. If parsing fails and Content-Type says XML, raise error
4. If parsing fails and Content-Type says non-XML, treat as expected
5. Log warnings for unexpected combinations

### 5.2 WWW-Authenticate Parsing Best Practices

**Robust parsing algorithm:**

```python
def parse_www_authenticate(header_value: str) -> set[str]:
    """
    Parse WWW-Authenticate header robustly.

    Handles:
    - Comma-separated schemes (with or without spaces)
    - Case variations (Basic, BASIC, basic)
    - Trailing whitespace/newlines
    - Parameters after scheme name
    """
    schemes = set()

    # Split on commas to handle multiple schemes
    for challenge in header_value.split(','):
        # Take first token (the scheme name)
        scheme = challenge.strip().split()[0]
        # Normalize to lowercase
        schemes.add(scheme.lower())

    return schemes

# Example usage
auth_header = "Basic realm=\"example\", Digest realm=\"example\", Bearer"
schemes = parse_www_authenticate(auth_header)
# Returns: {"basic", "digest", "bearer"}
```

### 5.3 Header Case Sensitivity Best Practices

**DO:**
```python
# Use case-insensitive dict (most HTTP libraries provide this)
from requests.structures import CaseInsensitiveDict

headers = CaseInsensitiveDict({
    "Content-Type": "text/xml",
    "User-Agent": "MyApp/1.0"
})

# All these work identically:
headers["Content-Type"]
headers["content-type"]
headers["CONTENT-TYPE"]
```

**DON'T:**
```python
# Don't use plain dict for HTTP headers
headers = {
    "Content-Type": "text/xml"
}

# This won't work if server sends "content-type"
if "Content-Type" in response.headers:
    ...
```

### 5.4 HTTP/2 Multiplexing Best Practices

**Feature flag approach:**

```python
class ServerFeatures:
    def __init__(self):
        self.features = {
            "http.multiplexing": None,  # None = unknown, True/False/"fragile"
        }

    def should_use_multiplexing(self, server_type: str) -> bool:
        # Known problematic servers
        if server_type in ["baikal", "baikal:nginx"]:
            return False

        # Check feature flag
        if self.features["http.multiplexing"] == "fragile":
            return False

        return True  # Default: enable multiplexing

# Session creation
if features.should_use_multiplexing(server_type):
    session = requests.Session(multiplexed=True)
else:
    session = requests.Session()
```

**Automatic fallback:**

```python
def make_request_with_multiplexing_fallback(url, method, **kwargs):
    try:
        response = multiplexed_session.request(method, url, **kwargs)

        # If auth fails and multiplexing is unknown, try without
        if response.status_code == 401 and features["http.multiplexing"] is None:
            non_multiplexed_session = requests.Session()
            response = non_multiplexed_session.request(method, url, **kwargs)

            if response.status_code != 401:
                # Success! Mark multiplexing as problematic
                features["http.multiplexing"] = False
                return response

        return response
    except Exception as e:
        # Connection failures might be multiplexing-related
        if features["http.multiplexing"] is None:
            features["http.multiplexing"] = False
            return make_request_with_multiplexing_fallback(url, method, **kwargs)
        raise
```

### 5.5 User-Agent and Custom Headers

**Best practices:**

```python
class HTTPClient:
    def __init__(self, custom_headers=None):
        # Set defaults
        self.default_headers = {
            "User-Agent": f"MyApp/{VERSION}",
            "Accept": "text/xml, application/xml, text/calendar"
        }

        # Allow custom headers to override
        if custom_headers:
            self.default_headers.update(custom_headers)

    def make_request(self, url, method, body=None, extra_headers=None):
        # Build headers: defaults + request-specific
        headers = self.default_headers.copy()

        if extra_headers:
            headers.update(extra_headers)

        # Remove Content-Type for empty bodies
        if not body and "Content-Type" in headers:
            del headers["Content-Type"]

        return requests.request(method, url, data=body, headers=headers)
```

**User-Agent recommendations:**
- Identify your application: `"MyApp/1.0"`
- Include library version: `"MyApp/1.0 python-caldav/2.0"`
- Don't pretend to be a browser: ~~`"Mozilla/5.0"`~~
- Some servers may require specific User-Agents for compatibility

### 5.6 Authentication Retry Strategy

**Recommended retry logic:**

```python
def authenticate_with_retry(client, url, method, body, headers):
    """
    Multi-layered authentication retry logic.
    """
    # Attempt 1: Try without auth (to discover auth types)
    response = client.request(url, method, body, headers, auth=None)

    if response.status_code != 401:
        return response

    # Attempt 2: Parse auth types and retry
    if "WWW-Authenticate" in response.headers:
        auth_types = parse_www_authenticate(response.headers["WWW-Authenticate"])
        client.auth = build_auth_object(client.username, client.password, auth_types)

        response = client.request(url, method, body, headers, auth=client.auth)

        if response.status_code != 401:
            return response

    # Attempt 3: Try without HTTP/2 multiplexing (Baikal workaround)
    if client.features.get("http.multiplexing") is None:
        client.disable_multiplexing()
        response = client.request(url, method, body, headers, auth=client.auth)

        if response.status_code != 401:
            client.features["http.multiplexing"] = False
            return response

    # Attempt 4: Try with decoded password (ancient server workaround)
    if isinstance(client.password, bytes):
        client.password = client.password.decode("utf-8")
        client.auth = build_auth_object(client.username, client.password, auth_types)
        response = client.request(url, method, body, headers, auth=client.auth)

        if response.status_code != 401:
            return response

    # All retries exhausted
    raise AuthenticationError("Authentication failed after all retry attempts")
```

### 5.7 Error Handling and Logging

**Logging levels for compatibility issues:**

```python
import logging

logger = logging.getLogger("caldav.http")

# Content-Type mismatches (not critical, common in the wild)
if content_type != expected and xml_parse_succeeded:
    logger.info(f"Server returned Content-Type: {content_type} but sent valid XML")

# Authentication retries (helpful for debugging)
if retry_count > 0:
    logger.debug(f"Authentication retry {retry_count}: trying {auth_method}")

# Multiplexing fallback (important to know)
if disabling_multiplexing:
    logger.warning(f"Disabling HTTP/2 multiplexing due to auth failures (Baikal workaround)")

# Critical errors only
if response.status_code >= 500:
    logger.error(f"Server error {response.status_code}: {response.text}")
```

**Avoid:** Over-logging common workarounds as CRITICAL or ERROR - this creates noise.

### 5.8 Testing Recommendations

**Test matrix for HTTP compatibility:**

1. **Content-Type variations:**
   - XML with `Content-Type: text/xml`
   - XML with `Content-Type: application/xml`
   - XML with `Content-Type: text/plain` (iCloud/OX)
   - XML with no Content-Type header
   - Non-XML with `Content-Type: text/calendar`

2. **WWW-Authenticate variations:**
   - Single scheme: `Basic realm="test"`
   - Multiple schemes: `Basic, Digest realm="test"`
   - No spaces: `Basic,Digest realm="test"`
   - Mixed case: `basic`, `BASIC`, `Basic`
   - With trailing newline: `Basic\n`

3. **HTTP/2 testing:**
   - Test with multiplexing enabled
   - Test with multiplexing disabled
   - Test automatic fallback on auth failure

4. **Header case sensitivity:**
   - Use case-insensitive dict for all header operations
   - Test that `WWW-Authenticate`, `www-authenticate`, `Www-Authenticate` all work

5. **Server-specific testing:**
   - iCloud: XML with wrong Content-Type
   - OX: XML with wrong Content-Type
   - Baikal: HTTP/2 multiplexing issues
   - Ancient SabreDAV: UTF-8 password issues

---

## 6. Summary and Recommendations

### Key Takeaways

1. **Never trust Content-Type headers blindly** - Always try parsing as XML first for CalDAV responses
2. **Parse WWW-Authenticate robustly** - Handle commas, spaces, case variations, and parameters
3. **Use case-insensitive header dicts** - Protects against server bugs and ensures spec compliance
4. **Implement HTTP/2 multiplexing fallback** - Some servers (Baikal) fail auth with multiplexing enabled
5. **Allow custom header overrides** - Don't force default User-Agent or other headers
6. **Implement multi-layered retry logic** - Auth failures can have multiple root causes
7. **Log compatibility workarounds appropriately** - INFO/DEBUG for common issues, not ERROR/CRITICAL

### Testing Checklist

- [ ] Test against iCloud (XML with wrong Content-Type)
- [ ] Test against OX/Open-Xchange (XML with wrong Content-Type)
- [ ] Test against Baikal (HTTP/2 multiplexing auth failures)
- [ ] Test WWW-Authenticate header with various formats
- [ ] Test header case insensitivity
- [ ] Test custom User-Agent override
- [ ] Test authentication retry logic
- [ ] Test with empty response bodies (no Content-Type)

### Resources

- **python-caldav issue #142** - iCloud/OX Content-Type issues
- **python-caldav issue #158** - Connection abort on unauthenticated requests
- **python-caldav issue #564** - Baikal HTTP/2 multiplexing auth failures
- **python-caldav issue #385/PR #386** - Custom header override fixes
- **RFC 7230** - HTTP/1.1 Message Syntax and Routing (header case insensitivity)
- **RFC 7231** - HTTP/1.1 Semantics and Content (Content-Type)
- **RFC 7235** - HTTP/1.1 Authentication (WWW-Authenticate)
- **RFC 7540** - HTTP/2

---

**Document Version:** 1.0
**Last Updated:** 2026-01-04
**Based on:** python-caldav library analysis (v2.2.3 and earlier)
