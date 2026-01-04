# CardDAV Fix: Address Book Metadata

## Priority: Low

## Problem

The current implementation doesn't sync address book metadata (name, description, etc.):

```cpp
abSetContentsDoc->evaluateXPath("//D:response[.//carddav:addressbook]", ([&](xmlNodePtr node) {
    string abHREF = abSetContentsDoc->nodeContentAtXPath(".//D:href/text()", node);
    // Only fetches href - no name, description, or other metadata
}));
```

This means:
- All address books show generic names in the UI
- User can't distinguish between "Personal", "Work", "Family" books
- No visual indication of which book contacts belong to

## Current Behavior

1. Discover address book URL
2. Create ContactBook with account ID and URL
3. **No name or metadata stored**
4. All books appear as "Contacts" or similar

## Desired Behavior

1. Discover address book with full metadata
2. Store name, description, color (if supported)
3. UI shows meaningful address book names
4. Contacts can be filtered by book

## Implementation Plan

### Phase 1: Update ContactBook Model

**File: `mailsync/MailSync/Models/ContactBook.hpp`**

```cpp
class ContactBook : public MailModel {
public:
    // ... existing ...

    string name();
    void setName(string name);

    string description();
    void setDescription(string description);

    bool readOnly();
    void setReadOnly(bool readOnly);
};
```

**File: `mailsync/MailSync/Models/ContactBook.cpp`**

```cpp
string ContactBook::name() {
    return _data.count("name") ? _data["name"].get<string>() : "Contacts";
}

void ContactBook::setName(string name) {
    _data["name"] = name;
}

string ContactBook::description() {
    return _data.count("description") ? _data["description"].get<string>() : "";
}

void ContactBook::setDescription(string description) {
    _data["description"] = description;
}

bool ContactBook::readOnly() {
    return _data.count("readOnly") ? _data["readOnly"].get<bool>() : false;
}

void ContactBook::setReadOnly(bool readOnly) {
    _data["readOnly"] = readOnly;
}
```

### Phase 2: Update PROPFIND Request

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
auto abSetContentsDoc = performXMLRequest(abSetURL, "PROPFIND",
    R"(<?xml version="1.0" encoding="UTF-8"?>
    <d:propfind xmlns:d="DAV:"
                xmlns:cs="http://calendarserver.org/ns/"
                xmlns:carddav="urn:ietf:params:xml:ns:carddav">
        <d:prop>
            <d:resourcetype />
            <d:displayname />
            <carddav:addressbook-description />
            <d:current-user-privilege-set />
            <cs:getctag />
        </d:prop>
    </d:propfind>)");
```

### Phase 3: Parse and Store Metadata

```cpp
abSetContentsDoc->evaluateXPath("//D:response[.//carddav:addressbook]", ([&](xmlNodePtr node) {
    string abHREF = abSetContentsDoc->nodeContentAtXPath(".//D:href/text()", node);
    string abURL = (abHREF.find("://") == string::npos) ? replacePath(abSetURL, abHREF) : abHREF;

    // Parse metadata
    string displayName = abSetContentsDoc->nodeContentAtXPath(".//D:displayname/text()", node);
    string description = abSetContentsDoc->nodeContentAtXPath(".//carddav:addressbook-description/text()", node);
    string ctag = abSetContentsDoc->nodeContentAtXPath(".//cs:getctag/text()", node);

    // Check read-only status from privileges
    bool readOnly = false;
    auto privileges = abSetContentsDoc->nodeContentAtXPath(".//D:current-user-privilege-set", node);
    if (privileges.find("write") == string::npos) {
        readOnly = true;
    }

    // Create/update ContactBook
    // ...

    existing->setName(displayName);
    existing->setDescription(description);
    existing->setReadOnly(readOnly);
    existing->setCtag(ctag);
    existing->setURL(abURL);
    store->save(existing.get());
}));
```

### Phase 4: Update TypeScript Model

**File: `app/src/flux/models/contact-book.ts`** (if exists, or create)

```typescript
import { Model } from './model';
import * as Attributes from '../attributes';

export class ContactBook extends Model {
    static attributes = {
        ...Model.attributes,

        name: Attributes.String({
            modelKey: 'name',
        }),

        description: Attributes.String({
            modelKey: 'description',
        }),

        readOnly: Attributes.Boolean({
            modelKey: 'readOnly',
        }),

        url: Attributes.String({
            modelKey: 'url',
        }),

        source: Attributes.String({
            modelKey: 'source',
        }),
    };

    name: string;
    description: string;
    readOnly: boolean;
    url: string;
    source: string;
}
```

### Phase 5: UI Integration

Update contact-related UI to show:
- Address book names in dropdowns
- Read-only badge for shared books
- Filtering by address book

## Standard Properties Available

| Property | Namespace | Description |
|----------|-----------|-------------|
| `displayname` | DAV: | Human-readable name |
| `addressbook-description` | carddav: | Detailed description |
| `current-user-privilege-set` | DAV: | Read/write permissions |
| `getctag` | cs: | Collection tag for change detection |
| `sync-token` | DAV: | For incremental sync |
| `max-resource-size` | carddav: | Max vCard size allowed |
| `supported-address-data` | carddav: | Supported vCard versions |

## Files to Modify

| File | Changes |
|------|---------|
| `mailsync/MailSync/Models/ContactBook.hpp/cpp` | Add name, description, readOnly fields |
| `mailsync/MailSync/DAVWorker.cpp` | Update PROPFIND, parse metadata |
| `app/src/flux/models/contact-book.ts` | Add TS attributes |

## Testing

1. Address book with custom name - verify name synced
2. Shared/read-only address book - verify readOnly flag set
3. Address book with description - verify stored
4. Multiple address books - verify each has correct metadata
5. Metadata change on server - verify update synced
