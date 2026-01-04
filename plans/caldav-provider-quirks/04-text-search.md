# CalDAV Text Search Compatibility Issues

## 1. Issue Summary

Text search in CalDAV servers suffers from widespread compatibility problems that make it one of the most troublesome features to implement reliably. The core issues include:

### Key Problems

1. **Substring vs. Exact Matching**: Many servers perform exact matching instead of the RFC-mandated substring search
2. **Case Sensitivity Ignored**: Servers may ignore collation parameters meant to control case sensitivity
3. **Complete Non-Support**: Some servers don't support text search at all, either silently ignoring filters or returning errors
4. **Category Search Issues**: Searching within categories has special quirks and failures
5. **Combined Search Failures**: Text search combined with time-range filters may fail or produce incorrect results

These issues mean that a simple operation like "find all events with 'meeting' in the summary" may:
- Return nothing on some servers (exact match required)
- Return everything on others (filter ignored)
- Throw an error on yet others (feature not supported)
- Work correctly only on a minority of implementations

## 2. RFC Specification

### RFC 4791 Section 9.7.5: Text Match

The CalDAV standard (RFC 4791, section 9.7.5) defines text-match queries with specific requirements:

#### Substring Matching (Required)

> "The CALDAV:text-match XML element specifies text used for a substring match against the property or parameter value specified in an enclosing CALDAV:prop-filter or CALDAV:param-filter element."

**Key point**: The search MUST be a **substring** match, not an exact match. Searching for "rain" should match both "Training session" and "Singing in the rain".

#### Collation Support (Required)

RFC 4791 mandates support for two collation types:

**1. `i;ascii-casemap` (Default)**
- MUST be the default collation if not specified
- Case-insensitive for ASCII characters (A-Z, a-z)
- Case-sensitive (byte-by-byte) for non-ASCII characters
- Defined in RFC 4790

Example XML:
```xml
<C:text-match collation="i;ascii-casemap">meeting</C:text-match>
```

**2. `i;octet` (Required)**
- Case-sensitive, byte-by-byte binary comparison
- Servers MUST support this collation
- Most performant option

Example XML:
```xml
<C:text-match collation="i;octet">Meeting</C:text-match>
```

**3. `i;unicode-casemap` (Optional)**
- Full Unicode case-insensitive matching (RFC 5051)
- Not required by CalDAV specification
- Rarely supported in practice

#### RFC 4791 Section 9.7.5 Exact Quote

```xml
<!ELEMENT text-match (#PCDATA)>
<!-- PCDATA value: string -->

<!ATTLIST text-match
  collation CDATA "i;ascii-casemap"
  negate-condition (yes | no) "no">
```

The specification states:
> "The server MUST support at least the 'i;ascii-casemap' and 'i;octet' collations."

### What the RFC Says About Behavior

From RFC 4791, section 9.7.5:

> "The CALDAV:text-match element specifies text used for a substring match against the property or parameter value specified in a CALDAV:prop-filter or CALDAV:param-filter element."

Critical requirements:
1. **Substring, not exact**: "mil" must match "family,finance" in categories
2. **Collation determines case**: The collation attribute controls case sensitivity
3. **Default is case-insensitive**: When collation is not specified, i;ascii-casemap applies

## 3. Real-World Server Behaviors

### Servers That Do Exact Match Instead of Substring

**Xandikos (v0.2.12 and v0.3)**
```python
"search.text.substring": {"support": "unsupported"}
"search.text.category.substring": {"support": "unsupported"}
```
- Text searches only match if the entire property value equals the search term
- Searching for "meet" will NOT match "meeting" or "weekly meeting"
- Both general text and category substring searches are broken

**Zimbra**
```python
"search.text.substring": {"support": "unsupported"}
"search.text.category": {"support": "ungraceful"}  # Throws error
```
- Only exact matches work
- Category searches throw errors instead of returning results
- Workaround: Client-side filtering required for any substring operations

### Servers That Ignore Case Sensitivity Settings

**Radicale (v3.5.4)**
```python
"search.text.case-sensitive": {"support": "unsupported"}
```
- The `i;octet` collation is ignored
- All searches are case-insensitive regardless of collation parameter
- No way to do case-sensitive searches on this server

### Servers That Don't Support Text Search At All

**Bedework**
```python
"search.text": {"support": "unsupported"}
"search.text.by-uid": {
    "support": "fragile",
    "behaviour": "sometimes delivers everything, other times nothing"
}
```
- Text searches are completely ignored
- Server returns all objects as if no filter was specified
- UID searches are non-deterministic (sometimes work, sometimes don't)

**SOGo**
```python
"search.text": {"support": "unsupported"}
"search.text.by-uid": True  # Only UID search works
```
- General text search not supported
- Only searching by UID property works reliably

**Robur**
```python
"search.text": {
    "support": "unsupported",
    "behaviour": "a text search ignores the filter and returns all elements"
}
```
- Accepts text-match queries but completely ignores them
- Returns entire calendar contents regardless of filter
- This is particularly problematic as it appears to work but returns wrong results

### Category Search Specific Issues

Categories have special handling in iCalendar and CalDAV:

**"CATEGORIES" vs "category"**
- **CATEGORIES** (plural): The actual iCalendar property, comma-separated list
- **category** (singular): Virtual property for substring matching within categories

**Zimbra Category Problems**
```python
"search.text.category": {"support": "ungraceful"}
```
- Throws 500 Internal Server Error when searching categories
- Must avoid category searches entirely on Zimbra

**Radicale Category Issues**
```python
"search.is-not-defined": {
    "support": "fragile",
    "behaviour": "seems to work for categories but not for dtend"
}
```
- Searching for undefined categories works
- But is-not-defined is broken for other properties

**Substring in Categories**

Per RFC 4791, searching for "mil" should match an event with:
```
CATEGORIES:family,finance
```

Many servers fail this:
- Xandikos: exact match only ("mil" doesn't match)
- Zimbra: throws error

### Combined Text + Time-Range Search Issues

**Nextcloud and Baikal**
```python
"search.combined-is-logical-and": {"support": "unsupported"}
```
- When combining text-match with time-range filters
- Server may return logical OR instead of logical AND
- Or may return everything
- Or may return nothing

Example failing query:
```xml
<C:filter>
  <C:comp-filter name="VCALENDAR">
    <C:comp-filter name="VEVENT">
      <C:prop-filter name="SUMMARY">
        <C:text-match>meeting</C:text-match>
      </C:prop-filter>
      <C:time-range start="20250101T000000Z" end="20250201T000000Z"/>
    </C:comp-filter>
  </C:comp-filter>
</C:filter>
```

This should return events in January with "meeting" in the summary. On broken servers:
- May return ALL January events (text filter ignored)
- May return ALL events with "meeting" (time filter ignored)
- May return ALL events (both filters ignored)
- May return NOTHING (treats as impossible AND condition)

### Summary Table of Server Behaviors

| Server | Substring | Case-Sensitive | Categories | Combined | Notes |
|--------|-----------|----------------|------------|----------|-------|
| Xandikos 0.2/0.3 | ❌ Exact only | ✅ Works | ❌ Exact only | ✅ Works | No substring support |
| Radicale 3.5+ | ✅ Works | ❌ Ignored | ⚠️ Fragile | ✅ Works | Always case-insensitive |
| Zimbra | ❌ Exact only | ✅ Works | ❌ Error | ✅ Works | Category throws 500 |
| Bedework | ❌ Returns all | ✅ Works | ✅ Works | ❌ Broken | Ignores text filters |
| SOGo | ❌ Not supported | ❌ Not supported | ❌ Not supported | ❌ Not supported | Only UID search works |
| Robur | ❌ Returns all | ❌ Returns all | ✅ Works | ✅ Works | Silently ignores |
| Nextcloud | ✅ Works | ✅ Works | ✅ Works | ❌ OR not AND | Combined broken |
| Baikal | ✅ Works | ✅ Works | ✅ Works | ❌ OR not AND | Combined broken |

## 4. python-caldav Workarounds

The python-caldav library implements sophisticated workarounds to handle these server incompatibilities.

### 4.1 The `_explicit_operators` Tracking System

**Purpose**: Distinguish between "let the server decide" vs "client guarantees behavior"

**Problem Being Solved**:
- User calls `.add_property_filter("SUMMARY", "meeting")` - should we trust the server?
- User calls `.add_property_filter("SUMMARY", "meeting", operator="contains")` - client must guarantee substring matching

**Implementation** (`caldav/search.py`, lines 105-183):

```python
class CalDAVSearcher(Searcher):
    _explicit_operators: set = field(default_factory=set)

    def add_property_filter(
        self,
        key: str,
        value: Any,
        operator: str = None,  # None = server decides, "contains" = client guarantees
        case_sensitive: bool = True,
        collation: Optional[Collation] = None,
        locale: Optional[str] = None,
    ) -> None:
        if operator is not None:
            # User explicitly requested an operator - we must honor it
            self._explicit_operators.add(key.lower())
            super().add_property_filter(
                key, value, operator, case_sensitive, collation, locale
            )
        else:
            # No operator specified - let server use its default behavior
            super().add_property_filter(
                key, value,
                case_sensitive=case_sensitive,
                collation=collation,
                locale=locale,
            )
```

**Why This Matters**:
- Without operator: Server may do substring or exact match (we accept either)
- With operator="contains": Client-side filtering if server doesn't support substring
- Allows graceful degradation while still honoring explicit user requirements

### 4.2 Client-Side Substring Filtering

When a server doesn't support substring search but the user explicitly requests it, python-caldav falls back to client-side filtering.

**Workaround Logic** (`caldav/search.py`, lines 315-349):

```python
def search(self, calendar, ...):
    # Check if server supports substring AND user explicitly requested it
    if (
        not calendar.client.features.is_supported("search.text.substring")
        and post_filter is not False
    ):
        # Find properties where user explicitly set operator="contains"
        explicit_contains = [
            prop
            for prop in self._property_operator
            if prop in self._explicit_operators
            and self._property_operator[prop] == "contains"
        ]

        if explicit_contains:
            # Remove these filters from server query
            replacements = {}
            for thing in ["_property_filters", "_property_operator", ...]:
                replacements[thing] = getattr(self, thing).copy()
                for prop in explicit_contains:
                    replacements[thing].pop(prop, None)

            # Clone searcher without the explicit substring filters
            clone = replace(self, **replacements)
            clone._explicit_operators = self._explicit_operators - set(explicit_contains)

            # Get all objects from server (without substring filter)
            objects = clone.search(calendar, ...)

            # Apply substring filter client-side
            return self.filter(objects, post_filter=True, ...)
```

**Example Scenario**:

```python
# User code
searcher = CalDAVSearcher(event=True)
searcher.add_property_filter("SUMMARY", "meet", operator="contains")
results = searcher.search(calendar)

# On Xandikos (no substring support):
# 1. Server query sent WITHOUT summary filter
# 2. All events downloaded
# 3. Client-side check: does event.SUMMARY contain "meet"?
# 4. Only matching events returned to user
```

**Trade-off**: More bandwidth/time, but correct results guaranteed.

### 4.3 Collation Mapping

**The Challenge**: icalendar-searcher uses enums, CalDAV uses string identifiers

**The Mapping** (`caldav/search.py`, lines 29-59):

```python
def _collation_to_caldav(collation: Collation, case_sensitive: bool = True) -> str:
    """Map icalendar-searcher Collation enum to CalDAV collation identifier."""

    if collation == Collation.SIMPLE:
        # SIMPLE collation maps to CalDAV's basic collations
        if case_sensitive:
            return "i;octet"  # RFC 4790 - binary comparison
        else:
            return "i;ascii-casemap"  # RFC 4790 - case-insensitive ASCII

    elif collation == Collation.UNICODE:
        # Unicode Collation Algorithm
        if case_sensitive:
            return "i;octet"  # Fallback - no case-sensitive Unicode in CalDAV
        else:
            return "i;unicode-casemap"  # RFC 5051 - rarely supported

    elif collation == Collation.LOCALE:
        # Locale-specific collation - not widely supported
        return "i;ascii-casemap"  # Safe fallback

    else:
        return "i;octet"  # Conservative default
```

**Usage in XML Query Building** (`caldav/search.py`, lines 754-768):

```python
def build_search_xml_query(self, ...):
    for property in self._property_operator:
        value = self._property_filters[property]

        # Get collation setting
        collation_str = "i;octet"  # Default to case-sensitive
        if property in self._property_collation:
            case_sensitive = self._property_case_sensitive.get(property, True)
            collation_str = _collation_to_caldav(
                self._property_collation[property],
                case_sensitive
            )

        # Build XML element with collation
        match = cdav.TextMatch(value, collation=collation_str)
        filters.append(cdav.PropFilter(property_) + match)
```

**Generated XML**:

```xml
<!-- Case-insensitive search -->
<C:prop-filter name="SUMMARY">
  <C:text-match collation="i;ascii-casemap">meeting</C:text-match>
</C:prop-filter>

<!-- Case-sensitive search -->
<C:prop-filter name="SUMMARY">
  <C:text-match collation="i;octet">Meeting</C:text-match>
</C:prop-filter>
```

### 4.4 Category vs Categories Handling

**The Problem**: iCalendar has CATEGORIES (plural), but CalDAV text-match needs property name

**The Solution** (`caldav/search.py`, lines 742-748):

```python
def build_search_xml_query(self, ...):
    for property in self._property_operator:
        value = self._property_filters[property]
        property_ = property.upper()

        # Special handling for singular "category" -> plural "CATEGORIES"
        if property.lower() == "category":
            property_ = "CATEGORIES"

        # Build text-match for CATEGORIES property
        match = cdav.TextMatch(value, collation=collation_str)
        filters.append(cdav.PropFilter(property_) + match)
```

**Why This Exists**:

User-facing API supports both:
- `"categories"` - exact/subset matching of category lists
- `"category"` - substring matching within category values

Both map to the CATEGORIES property in the XML.

**Example**:

```python
# User code
searcher.add_property_filter("category", "outdoor", operator="contains")

# Generates XML (property name is CATEGORIES)
# <C:prop-filter name="CATEGORIES">
#   <C:text-match collation="i;ascii-casemap">outdoor</C:text-match>
# </C:prop-filter>

# Should match:
# CATEGORIES:outdoor,sports        ✓ Contains "outdoor"
# CATEGORIES:indoor,outdoor,games  ✓ Contains "outdoor"
# CATEGORIES:sports                ✗ Doesn't contain "outdoor"
```

### 4.5 Combined Search Workaround

**The Problem**: Servers like Nextcloud/Baikal don't properly combine text-match with time-range filters (logical AND becomes OR or gets ignored).

**The Solution** (`caldav/search.py`, lines 353-365):

```python
def search(self, calendar, ...):
    # Check if server supports logical AND for combined searches
    if not calendar.client.features.is_supported("search.combined-is-logical-and"):
        # If we have both time-range and text filters...
        if self.start or self.end:
            if self._property_filters:
                # Remove text filters from server query
                replacements = {}
                for thing in ["_property_filters", "_property_operator", ...]:
                    replacements[thing] = {}

                # Clone without text filters, keep time-range
                clone = replace(self, **replacements)

                # Get objects matching time-range only
                objects = clone.search(calendar, ...)

                # Apply text filters client-side
                return self.filter(objects, post_filter, ...)
```

**What This Does**:
1. Detect that server can't combine filters properly
2. Send ONLY the time-range filter to server (more selective, less data)
3. Download all events in time range
4. Apply text matching client-side

**Example**:

```python
# User wants: January events with "meeting" in summary
searcher = CalDAVSearcher(event=True, start=jan1, end=feb1)
searcher.add_property_filter("SUMMARY", "meeting")

# On Nextcloud/Baikal (combined broken):
# Server query: Only time-range (start=20250101, end=20250201)
# Downloads: All 50 January events
# Client filters: Check each for "meeting" in SUMMARY
# Returns: 3 events matching both criteria
```

### 4.6 Category Search Complete Workaround

**The Problem**: Some servers don't support category search at all (Zimbra throws 500 error).

**The Solution** (`caldav/search.py`, lines 295-313):

```python
def search(self, calendar, ...):
    # Check if server supports category search
    if (
        not calendar.client.features.is_supported("search.text.category")
        and (
            "categories" in self._property_filters
            or "category" in self._property_filters
        )
        and post_filter is not False
    ):
        # Remove ALL category filters from server query
        replacements = {}
        for thing in ["_property_filters", "_property_operator", ...]:
            replacements[thing] = getattr(self, thing).copy()
            replacements[thing].pop("categories", None)
            replacements[thing].pop("category", None)

        # Search without category filter
        clone = replace(self, **replacements)
        objects = clone.search(calendar, ...)

        # Apply category filter client-side
        return self.filter(objects, post_filter, ...)
```

**Why Separate from General Text Search**:
- Category errors are server-specific (Zimbra 500 error)
- Category semantics are complex (lists, substrings)
- Safer to always do client-side on problematic servers

## 5. Implementation Guidance

### 5.1 How to Detect Text Search Capabilities

**Use Feature Detection System**:

```python
# In your CalDAV client
from caldav.compatibility_hints import FeatureSet

# Load server-specific configuration
features = FeatureSet({
    "search.text.substring": {"support": "unsupported"},  # Xandikos
    "search.text.case-sensitive": {"support": "unsupported"},  # Radicale
    "search.text.category": {"support": "ungraceful"},  # Zimbra
})

# Check before using features
if features.is_supported("search.text.substring"):
    # Server supports substring - use it
    use_server_side_substring()
else:
    # Server doesn't support - use client-side
    use_client_side_filtering()
```

**Known Server Configurations** (from `caldav/compatibility_hints.py`):

```python
# Xandikos - no substring
xandikos = {
    "search.text.substring": {"support": "unsupported"},
    "search.text.category.substring": {"support": "unsupported"},
}

# Radicale - no case-sensitive
radicale = {
    "search.text.case-sensitive": {"support": "unsupported"},
}

# Zimbra - no substring, category errors
zimbra = {
    "search.text.substring": {"support": "unsupported"},
    "search.text.category": {"support": "ungraceful"},
}

# Bedework - text search returns everything
bedework = {
    "search.text": {"support": "unsupported"},
}

# SOGo - no text search except UID
sogo = {
    "search.text": {"support": "unsupported"},
    "search.text.by-uid": True,
}
```

### 5.2 Implementing Client-Side Filtering Fallback

**Step 1: Query Server Without Problematic Filters**

```python
def search_with_fallback(calendar, text_filter, time_range):
    # Detect server capabilities
    supports_text = calendar.features.is_supported("search.text")
    supports_combined = calendar.features.is_supported("search.combined-is-logical-and")

    if not supports_text:
        # Download everything (or just by time if available)
        if time_range:
            objects = calendar.date_search(start=time_range.start, end=time_range.end)
        else:
            objects = calendar.events()  # All events

        # Apply text filter client-side
        return client_side_filter(objects, text_filter)

    elif not supports_combined and time_range and text_filter:
        # Server can't combine - use time-range only (more selective)
        objects = calendar.date_search(start=time_range.start, end=time_range.end)
        return client_side_filter(objects, text_filter)

    else:
        # Server supports both - send combined query
        return calendar.search(
            start=time_range.start,
            end=time_range.end,
            summary=text_filter
        )
```

**Step 2: Implement Client-Side Text Matching**

```python
def client_side_filter(objects, text_filter):
    """Apply text filter client-side with proper substring/case logic."""
    results = []

    for obj in objects:
        component = obj.icalendar_component

        # Get the property value
        if hasattr(component, text_filter.property):
            value = component.decoded(text_filter.property)

            # Handle case sensitivity
            if not text_filter.case_sensitive:
                value = value.lower()
                search = text_filter.value.lower()
            else:
                search = text_filter.value

            # Handle operator (substring vs exact)
            if text_filter.operator == "contains":
                if search in value:
                    results.append(obj)
            elif text_filter.operator == "==":
                if value == search:
                    results.append(obj)

    return results
```

**Step 3: Optimize for Bandwidth**

```python
def smart_query_optimization(calendar, filters):
    """Choose which filters to send to server to minimize bandwidth."""

    # Time-range filters are most selective - always use them
    server_filters = extract_time_range_filters(filters)
    client_filters = []

    # Add text filters only if server supports them
    if calendar.features.is_supported("search.text"):
        server_filters += extract_text_filters(filters)
    else:
        client_filters += extract_text_filters(filters)

    # Send optimized query
    objects = calendar.search(**server_filters)

    # Apply remaining filters client-side
    return apply_client_filters(objects, client_filters)
```

### 5.3 Handling Collation Correctly

**Map to CalDAV Collation Identifiers**:

```python
def map_collation(case_sensitive, unicode_aware=False):
    """Map search parameters to CalDAV collation identifier."""

    if unicode_aware:
        if case_sensitive:
            # No case-sensitive Unicode in CalDAV - use binary
            return "i;octet"
        else:
            # Use Unicode casemap (rarely supported)
            return "i;unicode-casemap"
    else:
        if case_sensitive:
            # Binary byte-by-byte comparison
            return "i;octet"
        else:
            # ASCII case-insensitive (most compatible)
            return "i;ascii-casemap"
```

**Build Correct XML**:

```python
def build_text_match_xml(property_name, value, case_sensitive=True):
    """Build a text-match filter with proper collation."""
    from caldav.elements import cdav

    # Determine collation
    if case_sensitive:
        collation = "i;octet"
    else:
        collation = "i;ascii-casemap"

    # Build XML elements
    text_match = cdav.TextMatch(value, collation=collation)
    prop_filter = cdav.PropFilter(property_name) + text_match

    return prop_filter
```

**Example XML Output**:

```xml
<!-- Case-insensitive (default) -->
<C:prop-filter name="SUMMARY">
  <C:text-match collation="i;ascii-casemap">meeting</C:text-match>
</C:prop-filter>

<!-- Case-sensitive -->
<C:prop-filter name="SUMMARY">
  <C:text-match collation="i;octet">Meeting</C:text-match>
</C:prop-filter>

<!-- Unicode (rarely works) -->
<C:prop-filter name="SUMMARY">
  <C:text-match collation="i;unicode-casemap">mëëtïng</C:text-match>
</C:prop-filter>
```

**Handle Servers That Ignore Collation**:

```python
def search_with_collation_fallback(calendar, property_name, value, case_sensitive):
    """Search with collation, fall back to client-side if ignored."""

    # Try server-side with collation
    results = calendar.search_with_collation(
        property=property_name,
        value=value,
        case_sensitive=case_sensitive
    )

    # Verify collation was honored (if we can detect it)
    if not calendar.features.is_supported("search.text.case-sensitive"):
        # Server ignores collation - filter client-side
        if case_sensitive:
            # Re-filter to enforce case sensitivity
            results = [
                r for r in results
                if value in r.get_property(property_name)  # Exact case match
            ]

    return results
```

### 5.4 Best Practices for Category Searches

**Problem**: Categories are comma-separated lists, and substring semantics are tricky.

**API Design - Use Two Different Properties**:

```python
# For exact/subset category matching
searcher.add_property_filter("categories", "work,urgent", operator="contains")
# Matches if event has BOTH "work" AND "urgent" in any order

searcher.add_property_filter("categories", "work,urgent", operator="==")
# Matches if event has EXACTLY "work,urgent" (same set, any order)

# For substring matching within category names
searcher.add_property_filter("category", "out", operator="contains")
# Matches if ANY category contains "out" (e.g., "outdoor", "workout")
```

**Implementation**:

```python
def search_categories(calendar, category_query):
    """Search categories with proper fallback."""

    # Check if server supports category search
    if not calendar.features.is_supported("search.text.category"):
        # Fetch all events and filter client-side
        events = calendar.events()
        return filter_categories_client_side(events, category_query)

    # Server supports - but does it support substring?
    if not calendar.features.is_supported("search.text.category.substring"):
        # Exact match only on server
        if category_query.operator == "contains":
            # Need substring - do client-side
            events = calendar.events()
            return filter_categories_client_side(events, category_query)

    # Server fully supports category search
    return calendar.search(category=category_query.value)


def filter_categories_client_side(events, category_query):
    """Client-side category filtering with proper semantics."""
    results = []

    for event in events:
        component = event.icalendar_component

        # Get categories as list
        if "CATEGORIES" in component:
            categories = component["CATEGORIES"]
            if isinstance(categories, str):
                cat_list = [c.strip() for c in categories.split(",")]
            else:
                cat_list = categories

            # Apply operator
            if category_query.operator == "contains":
                # Substring: does any category contain the search string?
                if any(category_query.value in cat for cat in cat_list):
                    results.append(event)

            elif category_query.operator == "==":
                # Exact: does category list match exactly?
                query_cats = set(c.strip() for c in category_query.value.split(","))
                event_cats = set(cat_list)
                if query_cats == event_cats:
                    results.append(event)

    return results
```

**XML Generation for Categories**:

```python
def build_category_filter(search_value, substring=True):
    """Build category filter XML."""
    from caldav.elements import cdav

    # Note: property name is always "CATEGORIES" (plural)
    # Even when user searches "category" (singular) for substring

    if substring:
        # Substring match: "out" matches "outdoor,sports"
        collation = "i;ascii-casemap"  # Case-insensitive
    else:
        # Exact match: "outdoor,sports" only
        collation = "i;octet"  # Case-sensitive

    text_match = cdav.TextMatch(search_value, collation=collation)
    prop_filter = cdav.PropFilter("CATEGORIES") + text_match

    return prop_filter
```

### 5.5 Complete Implementation Example

**Full-Featured Search with All Workarounds**:

```python
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class TextSearchQuery:
    """Encapsulates a text search with all parameters."""
    property: str
    value: str
    operator: str = "contains"  # "contains", "==", "undef"
    case_sensitive: bool = False
    explicit: bool = False  # Did user explicitly set operator?


class RobustCalDAVSearcher:
    """CalDAV searcher with automatic fallbacks for broken servers."""

    def __init__(self, calendar):
        self.calendar = calendar
        self.features = calendar.client.features

    def search(
        self,
        text_queries: List[TextSearchQuery] = None,
        start_date = None,
        end_date = None,
        event_type: str = "VEVENT"
    ):
        """Perform a robust search with automatic fallbacks."""

        # Step 1: Determine what to send to server
        server_queries = []
        client_queries = []

        if text_queries:
            for query in text_queries:
                if self._should_use_server_for_text(query):
                    server_queries.append(query)
                else:
                    client_queries.append(query)

        # Step 2: Check if we can combine filters
        if server_queries and (start_date or end_date):
            if not self.features.is_supported("search.combined-is-logical-and"):
                # Can't combine - move text to client-side
                client_queries.extend(server_queries)
                server_queries = []

        # Step 3: Execute server query
        objects = self._execute_server_query(
            server_queries, start_date, end_date, event_type
        )

        # Step 4: Apply client-side filters
        if client_queries:
            objects = self._apply_client_filters(objects, client_queries)

        return objects

    def _should_use_server_for_text(self, query: TextSearchQuery) -> bool:
        """Decide if we can trust server with this text query."""

        # Check basic text search support
        if not self.features.is_supported("search.text"):
            return False

        # Check category-specific support
        if query.property.lower() in ["category", "categories"]:
            if not self.features.is_supported("search.text.category"):
                return False

        # Check substring support if explicitly requested
        if query.explicit and query.operator == "contains":
            if not self.features.is_supported("search.text.substring"):
                return False

        # Check case-sensitivity support if requested
        if query.case_sensitive:
            if not self.features.is_supported("search.text.case-sensitive"):
                return False

        return True

    def _execute_server_query(self, queries, start, end, event_type):
        """Execute the server-side portion of the query."""
        # Build CalDAV XML query
        xml_query = self._build_caldav_query(queries, start, end, event_type)

        # Execute
        return self.calendar.search(xml=xml_query)

    def _apply_client_filters(self, objects, queries):
        """Apply client-side text filters."""
        results = objects

        for query in queries:
            results = [
                obj for obj in results
                if self._matches_text_query(obj, query)
            ]

        return results

    def _matches_text_query(self, obj, query: TextSearchQuery) -> bool:
        """Check if an object matches a text query."""
        component = obj.icalendar_component

        # Get property value
        if query.property.upper() not in component:
            return query.operator == "undef"

        value = str(component.decoded(query.property.upper()))
        search = query.value

        # Handle case sensitivity
        if not query.case_sensitive:
            value = value.lower()
            search = search.lower()

        # Handle operator
        if query.operator == "contains":
            return search in value
        elif query.operator == "==":
            return value == search
        elif query.operator == "undef":
            return False  # Property exists

        return False
```

**Usage Example**:

```python
# User wants: January meetings (case-insensitive)
searcher = RobustCalDAVSearcher(calendar)

results = searcher.search(
    text_queries=[
        TextSearchQuery(
            property="SUMMARY",
            value="meeting",
            operator="contains",  # Explicitly request substring
            case_sensitive=False,
            explicit=True  # Guarantee this behavior
        )
    ],
    start_date=datetime(2025, 1, 1),
    end_date=datetime(2025, 2, 1),
    event_type="VEVENT"
)

# Behavior on different servers:
# - Radicale: Time query to server, text filter client-side
# - Zimbra: Time query to server, text filter client-side (no substring)
# - Bedework: Time query to server, text filter client-side (text broken)
# - Nextcloud: Time query to server, text filter client-side (combined broken)
# - Well-behaved server: Combined query to server, no client filtering
```

## Summary

Text search in CalDAV is severely broken across many implementations:

1. **RFC Requirements vs Reality**: RFC 4791 mandates substring search with collation support, but many servers do exact match only, ignore collation, or don't support text search at all

2. **Server-Specific Behaviors**: Each server has unique quirks - some return everything, some return nothing, some throw errors, some silently ignore filters

3. **python-caldav's Solution**: Sophisticated workaround system with:
   - Feature detection via compatibility hints
   - Explicit operator tracking to distinguish "trust server" from "guarantee behavior"
   - Automatic fallback to client-side filtering when server support is lacking
   - Special handling for categories, combined searches, and collation

4. **Implementation Best Practices**:
   - Always implement client-side filtering as fallback
   - Use feature detection before trusting server behavior
   - Optimize queries to minimize bandwidth (prefer time-range on server, text client-side)
   - Handle categories separately from regular text properties
   - Map collations correctly and verify they're honored

The core lesson: **Never trust a CalDAV server to correctly implement text search**. Always have client-side filtering ready, and use explicit operator tracking to know when guarantees are required.
