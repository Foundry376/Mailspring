# CalDAV Fix: Handle Multiple VEVENTs per ICS File

## Priority: Minor

## Problem

The current implementation only processes the first VEVENT in an ICS file:

```cpp
ICalendar cal(icsData);
auto icsEvent = cal.Events.front();  // Only the first!
if (!icsEvent->DtStart.IsEmpty()) {
    auto event = Event(etag, account->id(), calendarId, icsData, icsEvent);
    store->save(&event);
}
```

While rare, iCalendar files can contain multiple VEVENTs:
- Recurring events with their exceptions bundled together
- Events that span multiple days represented as separate VEVENTs
- Calendar exports with grouped events

## Current Behavior

If ICS contains:
```ics
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:123
SUMMARY:Master Event
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
UID:123
RECURRENCE-ID:20240115
SUMMARY:Exception
END:VEVENT
END:VCALENDAR
```

Only "Master Event" is stored. "Exception" is silently ignored.

## Desired Behavior

All VEVENTs in the ICS are processed and stored (with appropriate linking for exceptions).

## Implementation Plan

### Phase 1: Process All VEVENTs

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
icsDoc->evaluateXPath("//D:response", ([&](xmlNodePtr node) {
    auto etag = icsDoc->nodeContentAtXPath(".//D:getetag/text()", node);
    auto href = icsDoc->nodeContentAtXPath(".//D:href/text()", node);
    auto icsData = icsDoc->nodeContentAtXPath(".//caldav:calendar-data/text()", node);

    if (icsData != "" && etag != "") {
        ICalendar cal(icsData);

        // Process ALL events, not just the first
        for (auto icsEvent : cal.Events) {
            if (icsEvent->DtStart.IsEmpty()) {
                logger->info("Skipping VEVENT with no start time");
                continue;
            }

            // Generate appropriate ID based on whether this is an exception
            string eventId;
            string recurrenceId = "";

            if (!icsEvent->RecurrenceId.IsEmpty()) {
                recurrenceId = icsEvent->RecurrenceId.toString();
                eventId = MailUtils::idForEvent(account->id(), calendarId, icsEvent->UID, recurrenceId);
            } else {
                eventId = MailUtils::idForEvent(account->id(), calendarId, icsEvent->UID);
            }

            // Check for existing event
            auto existing = store->find<Event>(Query().equal("id", eventId));

            if (existing) {
                // Update existing
                existing->setEtag(etag);
                existing->setHref(href);
                existing->setIcsData(icsData);
                existing->setRecurrenceId(recurrenceId);
                existing->_data["rs"] = icsEvent->DtStart.toUnix();
                existing->_data["re"] = endOf(icsEvent).toUnix();
                store->save(existing.get());
            } else {
                // Create new
                Event event(etag, account->id(), calendarId, icsData, icsEvent);
                event.setHref(href);
                event.setRecurrenceId(recurrenceId);
                event._data["id"] = eventId;
                store->save(&event);
            }
        }
    }
}));
```

### Phase 2: Handle Single-File Storage

Important: All VEVENTs in the same ICS file share the same:
- `etag` - changes when ANY vevent in the file changes
- `href` - URL to the ICS file
- `icsData` - we store the full ICS for each event (redundant but simpler)

When an etag changes, we need to re-process ALL VEVENTs in that file.

### Phase 3: Deduplication Check

When updating, need to handle the case where number of VEVENTs changes:

```cpp
// Before processing new ICS, mark which events we've seen
set<string> processedEventIds;

for (auto icsEvent : cal.Events) {
    // ... create/update event ...
    processedEventIds.insert(eventId);
}

// If the ICS file previously had more VEVENTs, clean up orphans
// This happens when an exception is removed from a recurring event
auto previousEvents = store->findAll<Event>(Query()
    .equal("calendarId", calendarId)
    .equal("href", href));

for (auto & prev : previousEvents) {
    if (processedEventIds.count(prev->id()) == 0) {
        logger->info("Removing orphaned VEVENT from multi-event ICS");
        store->remove(prev.get());
    }
}
```

### Phase 4: Update Event Constructor

The Event constructor currently takes icsData as string. All VEVENTs from the same file will have the same icsData, which is fine - the full calendar is stored.

For displaying a specific instance, the UI will need to parse the icsData and find the relevant VEVENT based on UID + recurrenceId.

## Edge Cases

1. **All VEVENTs deleted except one:** The remaining one should still work
2. **New exception added:** Should create new event record
3. **Exception removed:** Should delete that event record
4. **All events removed (file deleted):** Handled by existing deletion logic

## Files to Modify

| File | Changes |
|------|---------|
| `mailsync/MailSync/DAVWorker.cpp` | Loop over all Events, not just front() |
| `mailsync/MailSync/MailUtils.cpp` | Ensure idForEvent handles recurrenceId |

## Relationship with Plan #8

This plan is closely related to "Recurring Event Exception Handling" (Plan #8). They should be implemented together:

- Plan #8 focuses on the data model for exceptions
- Plan #9 (this one) focuses on parsing multiple VEVENTs

If implementing both, combine into a single implementation.

## Testing

1. Sync ICS with single VEVENT - verify one event created
2. Sync ICS with master + 2 exceptions - verify three events created
3. Add exception to existing recurring event - verify new event created
4. Remove exception from recurring event - verify event deleted
5. Modify exception - verify update propagates
6. Delete ICS file with multiple VEVENTs - verify all deleted
