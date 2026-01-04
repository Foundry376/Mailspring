# CalDAV Fix: Recurring Event Exception Handling

## Priority: Medium

## Problem

Recurring events with exceptions (modified/cancelled instances) are not handled correctly. The current implementation:

1. **Only processes the first VEVENT** in an ICS response (`cal.Events.front()`) - ignoring any exception VEVENTs
2. **Doesn't parse RECURRENCE-ID** - the custom icalendarlib doesn't support this property
3. **Has no recurrenceId field** on the Event model to distinguish exceptions from masters

This means:
- Modified instances of recurring events are completely ignored
- Cancelled instances are not tracked
- If a server returns master + exceptions in one ICS file, only the master is stored

## Background: How Recurring Event Exceptions Work (RFC 5545)

A recurring event has a master VEVENT with an RRULE:

```ics
BEGIN:VEVENT
UID:event123@example.com
DTSTART:20240101T100000Z
RRULE:FREQ=WEEKLY;COUNT=10
SUMMARY:Weekly Meeting
END:VEVENT
```

An exception (modified instance) is a separate VEVENT with RECURRENCE-ID:

```ics
BEGIN:VEVENT
UID:event123@example.com
RECURRENCE-ID:20240115T100000Z
DTSTART:20240115T110000Z  <- Modified time
SUMMARY:Weekly Meeting (rescheduled)  <- Modified title
END:VEVENT
```

A cancelled instance uses STATUS:CANCELLED with RECURRENCE-ID:

```ics
BEGIN:VEVENT
UID:event123@example.com
RECURRENCE-ID:20240122T100000Z
STATUS:CANCELLED
END:VEVENT
```

**Key insight**: Both master and exceptions share the same UID. The RECURRENCE-ID identifies which occurrence is being modified.

## Current Implementation Analysis

### C++ Side

**Event Model (`mailsync/MailSync/Models/Event.hpp/cpp`):**
- Current fields: `id`, `etag`, `calendarId`, `icsData`, `icsuid`, `href`, `recurrenceStart`, `recurrenceEnd`
- ID generated via `MailUtils::idForEvent(accountId, calendarId, icsUID)` - uses only icsUID
- `columnsForQuery()` returns: `id`, `data`, `icsuid`, `accountId`, `etag`, `calendarId`, `recurrenceStart`, `recurrenceEnd`

**ICalendar Library (`mailsync/Vendor/icalendarlib/`):**
- Custom lightweight parser (not libical)
- `ICalendarEvent` struct (`types.h:54-83`) has: `UID`, `Summary`, `Description`, `Categories`, `DtStamp`, `DtStart`, `DtEnd`, `RRule`, `Alarms`, `RecurrenceNo`, `BaseEvent`
- **Missing**: `RecurrenceId`, `Status` fields
- Parser (`icalendar.cpp:4-84`) parses: UID, SUMMARY, DTSTAMP, DTSTART, DTEND, DESCRIPTION, CATEGORIES, RRULE
- **Missing parsing for**: RECURRENCE-ID, STATUS

**DAVWorker (`mailsync/MailSync/DAVWorker.cpp`):**
- Line 1259: `auto icsEvent = cal.Events.front();` - **only first event processed!**
- Multiple locations need updating: lines 1259, 1453, 1509, 1735, and TaskProcessor.cpp:1170, 1188

**Database Schema (`constants.h:193-202`):**
```cpp
V6_SETUP_QUERIES: Event table with id, data, accountId, etag, calendarId, recurrenceStart, recurrenceEnd
V7_SETUP_QUERIES: Added icsuid column
```
No recurrenceId column exists.

### TypeScript Side

**Event Model (`app/src/flux/models/event.ts`):**
- Attributes: `calendarId`, `ics`, `icsuid`, `recurrenceStart`, `recurrenceEnd`
- No `recurrenceId` or `status` attributes
- The full ICS data is stored in `ics` field

**Calendar UI (`app/internal_packages/main-calendar/lib/core/calendar-data-source.ts`):**
- Uses `ical-expander` library (v3.2.0) which uses `ical.js` (v1.5.0)
- `ical-expander` already handles recurrence exceptions via `ical.js`
- Expands RRULE into individual occurrences with `.between(startDate, endDate)`
- Returns `expanded.events` (non-recurring) and `expanded.occurrences` (expanded instances)

**Key insight**: The UI side already uses libraries that fully support RECURRENCE-ID. The problem is entirely on the C++ sync side.

## Implementation Plan

### Phase 1: Extend C++ ICalendar Library

**File: `mailsync/Vendor/icalendarlib/types.h`**

Add to `ICalendarEvent` struct (after line 77):
```cpp
string UID, Summary, Description, Categories;
string RecurrenceId;   // NEW: e.g., "20240115T100000Z"
string Status;         // NEW: "TENTATIVE", "CONFIRMED", "CANCELLED"
Date DtStamp, DtStart, DtEnd;
```

**File: `mailsync/Vendor/icalendarlib/icalendar.cpp`**

Add parsing in VEVENT case (after line 49, before line 50):
```cpp
} else if (Line.find("RECURRENCE-ID") == 0) {
    NewEvent->RecurrenceId = GetProperty(Line);
} else if (Line.find("STATUS") == 0) {
    NewEvent->Status = GetProperty(Line);
}
```

### Phase 2: Update Event Model

**File: `mailsync/MailSync/Models/Event.hpp`**

Add new methods (after line 53):
```cpp
string recurrenceId();
void setRecurrenceId(string recurrenceId);

string status();
void setStatus(string status);

bool isRecurrenceException();
```

**File: `mailsync/MailSync/Models/Event.cpp`**

Add implementations:
```cpp
string Event::recurrenceId() {
    return _data.count("rid") ? _data["rid"].get<string>() : "";
}

void Event::setRecurrenceId(string recurrenceId) {
    _data["rid"] = recurrenceId;
}

string Event::status() {
    return _data.count("status") ? _data["status"].get<string>() : "CONFIRMED";
}

void Event::setStatus(string status) {
    _data["status"] = status;
}

bool Event::isRecurrenceException() {
    return !recurrenceId().empty();
}
```

Update constructor to accept recurrenceId:
```cpp
Event::Event(string etag, string accountId, string calendarId, string ics, ICalendarEvent *event)
    : MailModel(MailUtils::idForEvent(accountId, calendarId, event->UID, event->RecurrenceId), accountId)
{
    _data["cid"] = calendarId;
    _data["ics"] = ics;
    _data["etag"] = etag;
    _data["icsuid"] = event->UID;
    _data["rid"] = event->RecurrenceId;   // NEW
    _data["status"] = event->Status.empty() ? "CONFIRMED" : event->Status;  // NEW
    _data["rs"] = event->DtStart.toUnix();
    _data["re"] = endOf(event).toUnix();
}
```

Update `columnsForQuery()`:
```cpp
return vector<string>{"id", "data", "icsuid", "recurrenceId", "accountId", "etag", "calendarId", "recurrenceStart", "recurrenceEnd"};
```

Update `bindToQuery()`:
```cpp
query->bind(":recurrenceId", recurrenceId());
```

### Phase 3: Update ID Generation

**File: `mailsync/MailSync/MailUtils.hpp`**

Update function signature:
```cpp
static string idForEvent(string accountId, string calendarId, string icsUID, string recurrenceId = "");
```

**File: `mailsync/MailSync/MailUtils.cpp`**

Update implementation:
```cpp
string MailUtils::idForEvent(string accountId, string calendarId, string icsUID, string recurrenceId) {
    string src_str = accountId + "-" + calendarId + "-" + icsUID;
    if (!recurrenceId.empty()) {
        src_str += "-" + recurrenceId;
    }
    vector<unsigned char> hash(32);
    picosha2::hash256(src_str.begin(), src_str.end(), hash.begin(), hash.end());
    return toBase58(hash.data(), 30);
}
```

### Phase 4: Add Database Migration

**File: `mailsync/MailSync/constants.h`**

Add after V8_SETUP_QUERIES:
```cpp
static vector<string> V9_SETUP_QUERIES = {
    "ALTER TABLE `Event` ADD COLUMN recurrenceId VARCHAR(50) DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS EventRecurrenceId ON Event(calendarId, icsuid, recurrenceId)",
};
```

**File: `mailsync/MailSync/MailStore.cpp`**

Add migration execution after V8 (around line 149):
```cpp
if (version < 9) {
    for (string sql : V9_SETUP_QUERIES) {
        runSQLWithLog(sql);
    }
}
```

### Phase 5: Update DAVWorker to Process All VEVENTs

This is the critical change. Multiple locations need updating.

**File: `mailsync/MailSync/DAVWorker.cpp`**

Create a helper function to avoid duplication:
```cpp
void DAVWorker::processICSEvents(MailStore* store, string calendarId, string etag,
                                  string href, string icsData, pair<time_t,time_t>* range) {
    ICalendar cal(icsData);
    if (cal.Events.empty()) return;

    for (auto icsEvent : cal.Events) {  // Process ALL events, not just front()
        if (icsEvent->DtStart.IsEmpty()) continue;

        string icsUID = icsEvent->UID;
        string recurrenceId = icsEvent->RecurrenceId;

        // Look up existing event by icsUID + recurrenceId
        auto query = Query().equal("calendarId", calendarId).equal("icsuid", icsUID);
        if (!recurrenceId.empty()) {
            query.equal("recurrenceId", recurrenceId);
        } else {
            query.equal("recurrenceId", "");
        }
        auto existing = store->find<Event>(query);

        if (existing) {
            // Update existing event
            existing->setEtag(etag);
            existing->setHref(href);
            existing->setIcsData(icsData);
            existing->setRecurrenceId(recurrenceId);
            existing->setStatus(icsEvent->Status.empty() ? "CONFIRMED" : icsEvent->Status);
            existing->_data["rs"] = icsEvent->DtStart.toUnix();
            existing->_data["re"] = endOf(icsEvent).toUnix();
            store->save(existing.get());
        } else {
            // Check if within time range (if range provided)
            time_t eventStart = icsEvent->DtStart.toUnix();
            time_t eventEnd = endOf(icsEvent).toUnix();

            if (!range || eventOverlapsRange(eventStart, eventEnd, *range)) {
                auto event = Event(etag, account->id(), calendarId, icsData, icsEvent);
                event.setHref(href);
                store->save(&event);
            }
        }
    }
}
```

Then update all the sync locations to use this helper or similar loop logic:
- Line ~1259: Full sync multiget response
- Line ~1453: Sync-token direct data
- Line ~1509: Sync-token multiget response
- Line ~1735: Syncback response

### Phase 6: Update TypeScript Event Model

**File: `app/src/flux/models/event.ts`**

Add attributes:
```typescript
static attributes = {
    ...Model.attributes,

    calendarId: Attributes.String({...}),
    ics: Attributes.String({...}),
    icsuid: Attributes.String({...}),

    recurrenceId: Attributes.String({  // NEW
        queryable: true,
        jsonKey: 'rid',
        modelKey: 'recurrenceId',
    }),

    status: Attributes.String({  // NEW
        queryable: true,
        jsonKey: 'status',
        modelKey: 'status',
    }),

    recurrenceStart: Attributes.Number({...}),
    recurrenceEnd: Attributes.Number({...}),
};
```

Add class properties and helper methods:
```typescript
recurrenceId: string;
status: string;

isRecurrenceException(): boolean {
    return !!this.recurrenceId;
}

isCancelled(): boolean {
    return this.status === 'CANCELLED';
}

masterEventUID(): string {
    return this.icsuid;
}
```

### Phase 7: Handle Exception Deletion (Cascade)

When a master event is deleted, all its exceptions should also be deleted.

**File: `mailsync/MailSync/DAVWorker.cpp`**

In the deletion handling code, after deleting an event by href:
```cpp
// Check if this was a master event and delete its exceptions
auto deletedEvent = store->find<Event>(Query().equal("href", href));
if (deletedEvent && deletedEvent->recurrenceId().empty()) {
    // This is a master event - find and delete all exceptions
    auto exceptions = store->findAll<Event>(
        Query().equal("calendarId", calendarId).equal("icsuid", deletedEvent->icsUID())
    );
    for (auto& ex : exceptions) {
        if (!ex->recurrenceId().empty()) {
            store->remove(ex.get());
        }
    }
}
store->remove(deletedEvent.get());
```

### Phase 8: UI Updates (Optional Enhancement)

The UI can optionally show cancelled exceptions differently:

**File: `app/internal_packages/main-calendar/lib/core/calendar-data-source.ts`**

Update `EventOccurrence` interface:
```typescript
export interface EventOccurrence {
    // ... existing fields ...
    isCancelled?: boolean;
    recurrenceId?: string;
}
```

Update `occurrencesForEvents`:
```typescript
// Filter out cancelled events from display
const item = 'item' in e ? e.item : e;
if (item.status === 'CANCELLED') {
    return; // Skip cancelled occurrences
}
```

## Files to Modify Summary

| File | Changes | Complexity |
|------|---------|-----------|
| `mailsync/Vendor/icalendarlib/types.h` | Add `RecurrenceId`, `Status` fields to struct | Low |
| `mailsync/Vendor/icalendarlib/icalendar.cpp` | Parse RECURRENCE-ID, STATUS properties | Low |
| `mailsync/MailSync/Models/Event.hpp` | Add recurrenceId/status getters/setters | Low |
| `mailsync/MailSync/Models/Event.cpp` | Implement new methods, update constructor | Medium |
| `mailsync/MailSync/MailUtils.hpp` | Update idForEvent signature | Low |
| `mailsync/MailSync/MailUtils.cpp` | Include recurrenceId in ID hash | Low |
| `mailsync/MailSync/constants.h` | Add V9 migration | Low |
| `mailsync/MailSync/MailStore.cpp` | Add V9 migration execution | Low |
| `mailsync/MailSync/DAVWorker.cpp` | Loop through all VEVENTs, update queries | **High** |
| `mailsync/MailSync/TaskProcessor.cpp` | Handle recurrenceId in event tasks | Medium |
| `app/src/flux/models/event.ts` | Add recurrenceId, status attributes | Low |
| `app/internal_packages/main-calendar/...` | Optional: show cancelled differently | Low |

## Data Model After Changes

```
Master Event:
  id: "hash(account+calendar+uid)"
  icsuid: "event123@example.com"
  recurrenceId: ""
  status: "CONFIRMED"
  recurrenceStart: 1704067200  (first instance)
  recurrenceEnd: 1709337600    (last instance based on RRULE)

Exception 1 (modified time):
  id: "hash(account+calendar+uid+20240115T100000Z)"
  icsuid: "event123@example.com"
  recurrenceId: "20240115T100000Z"
  status: "CONFIRMED"
  recurrenceStart: 1705315200  (this specific instance's new time)
  recurrenceEnd: 1705318800

Exception 2 (cancelled):
  id: "hash(account+calendar+uid+20240122T100000Z)"
  icsuid: "event123@example.com"
  recurrenceId: "20240122T100000Z"
  status: "CANCELLED"
  recurrenceStart: 1705920000
  recurrenceEnd: 1705923600
```

## Testing Plan

1. **Single recurring event (no exceptions)**: Verify stored as single Event with empty recurrenceId
2. **Recurring event with 1 modified exception**: Verify 2 Events stored, linked by icsuid, different recurrenceIds
3. **Recurring event with cancelled exception**: Verify exception has status="CANCELLED"
4. **Multiple exceptions in single ICS file**: Verify all VEVENTs processed, not just first
5. **Incremental sync**: Verify exceptions synced correctly on server changes
6. **Delete master event**: Verify all exceptions also deleted
7. **UI display**: Verify calendar shows correct occurrences, cancelled ones filtered
8. **Update exception on server**: Verify update propagates correctly (matched by icsuid + recurrenceId)

## Edge Cases to Consider

1. **EXDATE in master**: Some servers use EXDATE in the master VEVENT instead of separate cancelled VEVENTs. The ical-expander library handles this automatically during expansion.

2. **RDATE**: Similar to RRULE but specifies explicit dates. Current parser doesn't handle this - may need future enhancement.

3. **THISANDFUTURE range**: RECURRENCE-ID can have RANGE=THISANDFUTURE to modify all future occurrences. This is complex and may be deferred.

4. **Timezone handling**: RECURRENCE-ID values must match the timezone of the original DTSTART for proper correlation.

## Dependencies

- No new external dependencies needed
- ical-expander already handles exception expansion on UI side
- Custom icalendarlib just needs minor additions
