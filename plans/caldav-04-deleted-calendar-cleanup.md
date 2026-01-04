# CalDAV Fix: Deleted Calendar Cleanup

## Priority: Critical

## Problem

The current implementation upserts calendars but never removes calendars that have been deleted on the server:

```cpp
void DAVWorker::runCalendars() {
    auto local = store->findAllMap<Calendar>(Query().equal("accountId", account->id()), "id");

    calendarSetDoc->evaluateXPath("//D:response[...]", ([&](xmlNodePtr node) {
        auto id = MailUtils::idForCalendar(account->id(), path);

        // Upserts calendar...
        if (local[id]) {
            // update
        } else {
            // create
        }
        // Never checks for calendars in `local` that aren't in the response!
    }));
}
```

When a user deletes a calendar on the server or unsubscribes from a shared calendar:
- The calendar remains in the local database
- All events in that calendar remain
- The UI continues to show the deleted calendar

## Current Behavior

1. User has calendars A, B, C synced locally
2. User deletes calendar B on the server
3. After sync: calendars A, B, C still in local database
4. Calendar B's events are never cleaned up

## Desired Behavior

1. User has calendars A, B, C synced locally
2. User deletes calendar B on the server
3. After sync: only calendars A, C in local database
4. All events from calendar B are deleted

## Implementation Plan

### Phase 1: Track Seen Calendars During Sync

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
void DAVWorker::runCalendars() {
    if (calHost == "") {
        return;
    }

    auto calendarSetDoc = performXMLRequest(calHost + calPrincipal, "PROPFIND", "...");

    auto local = store->findAllMap<Calendar>(Query().equal("accountId", account->id()), "id");
    set<string> seenCalendarIds;

    calendarSetDoc->evaluateXPath("//D:response[...]", ([&](xmlNodePtr node) {
        auto name = calendarSetDoc->nodeContentAtXPath(".//D:displayname/text()", node);
        auto path = calendarSetDoc->nodeContentAtXPath(".//D:href/text()", node);
        auto id = MailUtils::idForCalendar(account->id(), path);

        seenCalendarIds.insert(id);  // Track this calendar as seen

        // ... existing upsert logic ...

        runForCalendar(id, name, calHost + path);
    }));

    // Phase 2: Remove calendars that no longer exist on server
    for (auto & pair : local) {
        if (seenCalendarIds.count(pair.first) == 0) {
            logger->info("Calendar '{}' no longer on server, removing", pair.second->name());
            removeCalendarAndEvents(pair.second);
        }
    }
}
```

### Phase 2: Add Calendar Removal Helper

**File: `mailsync/MailSync/DAVWorker.hpp`**

```cpp
void removeCalendarAndEvents(shared_ptr<Calendar> calendar);
```

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
void DAVWorker::removeCalendarAndEvents(shared_ptr<Calendar> calendar) {
    MailStoreTransaction transaction{store, "removeCalendarAndEvents"};

    // First, delete all events in this calendar
    auto events = store->findAll<Event>(Query().equal("calendarId", calendar->id()));
    for (auto & event : events) {
        store->remove(event.get());
    }

    // Then delete the calendar itself
    store->remove(calendar.get());

    transaction.commit();

    logger->info("Removed calendar '{}' and {} events", calendar->name(), events.size());
}
```

### Phase 3: Handle Edge Cases

**Temporary Server Issues:**

If the server temporarily fails to return a calendar (network issue, server error), we don't want to delete it. Add a safeguard:

```cpp
// Only remove calendars if we got a successful response with at least some calendars
if (seenCalendarIds.size() > 0) {
    for (auto & pair : local) {
        if (seenCalendarIds.count(pair.first) == 0) {
            removeCalendarAndEvents(pair.second);
        }
    }
} else {
    logger->warn("No calendars returned from server, skipping cleanup to avoid data loss");
}
```

**Rapid Sync Prevention:**

If a calendar was just created locally but hasn't synced yet, don't delete it. This is handled by the fact that locally-created calendars won't have a path that matches the server response.

### Phase 4: Consider Soft Delete (Optional)

Instead of immediately deleting, could mark calendars as "pending deletion" and only remove after N sync cycles:

```cpp
void Calendar::setMarkedForDeletion(bool marked);
bool Calendar::isMarkedForDeletion();
int Calendar::deletionSyncCount();
void Calendar::incrementDeletionSyncCount();
```

This is probably overkill for calendar sync but could be useful if users report accidental data loss.

## Files to Modify

| File | Changes |
|------|---------|
| `mailsync/MailSync/DAVWorker.hpp` | Add removeCalendarAndEvents declaration |
| `mailsync/MailSync/DAVWorker.cpp` | Track seen calendars, remove missing ones |

## Testing

1. Sync with 3 calendars - verify all 3 exist locally
2. Delete 1 calendar on server, sync - verify calendar and its events removed
3. Unsubscribe from shared calendar, sync - verify removed
4. Simulate server error returning 0 calendars - verify nothing deleted
5. Create calendar on server, sync, delete on server, sync - verify full lifecycle
