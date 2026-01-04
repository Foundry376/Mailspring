# CalDAV Fix: VTODO Support (Tasks/Reminders)

## Priority: Minor (Future Feature)

## Problem

The current implementation only syncs VEVENT components, ignoring VTODO:

```cpp
calendarSetDoc->evaluateXPath(
    "//D:response[./D:propstat/D:prop/caldav:supported-calendar-component-set/caldav:comp[@name='VEVENT']]",
    ...
);
```

Many calendar applications also support tasks/reminders via VTODO components. This includes:
- Apple Reminders (syncs via CalDAV)
- Google Tasks (via separate API, but some clients use CalDAV)
- Nextcloud Tasks
- Fastmail Tasks

## Current Behavior

- Only calendars with VEVENT support are synced
- VTODO components are ignored even if present

## Desired Behavior

- Optionally sync calendars with VTODO support
- Store tasks in a separate Task model
- Allow UI to display and manage tasks

## Background: VTODO vs VEVENT

| Property | VEVENT | VTODO |
|----------|--------|-------|
| Purpose | Scheduled event | Task/reminder |
| DTSTART | When event starts | When task is active |
| DTEND | When event ends | N/A |
| DUE | N/A | When task is due |
| COMPLETED | N/A | When task was completed |
| STATUS | TENTATIVE/CONFIRMED/CANCELLED | NEEDS-ACTION/IN-PROCESS/COMPLETED |
| PERCENT-COMPLETE | N/A | 0-100 completion percentage |
| PRIORITY | Event priority | Task priority (1-9) |

Example VTODO:
```ics
BEGIN:VTODO
UID:task123@example.com
DTSTAMP:20240101T000000Z
SUMMARY:Buy groceries
DUE:20240115T170000Z
PRIORITY:5
STATUS:NEEDS-ACTION
END:VTODO
```

## Implementation Plan

### Phase 1: Create CalendarTask Model

**File: `mailsync/MailSync/Models/CalendarTask.hpp`**

```cpp
class CalendarTask : public MailModel {
public:
    static string TABLE_NAME;

    CalendarTask(string etag, string accountId, string calendarId, string ics, ICalendarTodo* todo);
    CalendarTask(json & data);
    CalendarTask(SQLite::Statement & query);

    string etag();
    void setEtag(string etag);

    string calendarId();
    string icsData();
    string icsUID();

    string href();
    void setHref(string href);

    // Task-specific fields
    string summary();
    int dueDate();        // Unix timestamp
    int completedDate();  // Unix timestamp, 0 if not completed
    string status();      // NEEDS-ACTION, IN-PROCESS, COMPLETED
    int priority();       // 1-9, lower is higher priority
    int percentComplete();

    string tableName();
    vector<string> columnsForQuery();
    void bindToQuery(SQLite::Statement * query);
};
```

### Phase 2: Update Calendar Model

Add flag to indicate calendar type:

**File: `mailsync/MailSync/Models/Calendar.hpp`**

```cpp
bool supportsEvents();
void setSupportsEvents(bool supports);

bool supportsTasks();
void setSupportsTasks(bool supports);
```

### Phase 3: Update Calendar Discovery

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
void DAVWorker::runCalendars() {
    // Query for calendars that support VEVENT OR VTODO
    calendarSetDoc->evaluateXPath(
        "//D:response[./D:propstat/D:prop/caldav:supported-calendar-component-set/"
        "(caldav:comp[@name='VEVENT'] or caldav:comp[@name='VTODO'])]",
        ([&](xmlNodePtr node) {
            // Check which components are supported
            auto components = calendarSetDoc->nodeContentAtXPath(
                ".//caldav:supported-calendar-component-set", node);

            bool supportsEvents = components.find("VEVENT") != string::npos;
            bool supportsTasks = components.find("VTODO") != string::npos;

            calendar->setSupportsEvents(supportsEvents);
            calendar->setSupportsTasks(supportsTasks);

            if (supportsEvents) {
                runForCalendarEvents(id, name, calHost + path);
            }
            if (supportsTasks) {
                runForCalendarTasks(id, name, calHost + path);
            }
        }));
}
```

### Phase 4: Implement Task Sync

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
void DAVWorker::runForCalendarTasks(string calendarId, string name, string url) {
    // Similar to runForCalendar but queries for VTODO
    auto taskEtagsDoc = performXMLRequest(url, "REPORT",
        R"(<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
            <d:prop><d:getetag /></d:prop>
            <c:filter>
                <c:comp-filter name="VCALENDAR">
                    <c:comp-filter name="VTODO"/>
                </c:comp-filter>
            </c:filter>
        </c:calendar-query>)");

    // ... similar etag comparison logic as events ...

    // Fetch task data
    auto icsDoc = performXMLRequest(url, "REPORT",
        "<c:calendar-multiget ...><c:calendar-data/></c:calendar-multiget>");

    icsDoc->evaluateXPath("//D:response", ([&](xmlNodePtr node) {
        auto icsData = icsDoc->nodeContentAtXPath(".//caldav:calendar-data/text()", node);

        ICalendar cal(icsData);
        for (auto todo : cal.Todos) {  // Note: Todos, not Events
            auto task = CalendarTask(etag, account->id(), calendarId, icsData, todo);
            task.setHref(href);
            store->save(&task);
        }
    }));
}
```

### Phase 5: Update icalendarlib

Check if the vendor library supports VTODO parsing:

```cpp
// Need to verify these exist:
cal.Todos        // List of VTODOs
todo->Summary    // Task title
todo->Due        // Due date
todo->Completed  // Completion date
todo->Status     // NEEDS-ACTION, etc.
todo->Priority   // 1-9
todo->PercentComplete
```

If not supported, may need to extend the library or parse VTODOs manually.

### Phase 6: Task Syncback

Create SyncbackTaskTask and DestroyTaskTask following the same pattern as events.

### Phase 7: TypeScript Models

**File: `app/src/flux/models/calendar-task.ts`**

```typescript
export class CalendarTask extends Model {
    static attributes = {
        ...Model.attributes,

        calendarId: Attributes.String({ queryable: true }),
        ics: Attributes.String({}),
        icsuid: Attributes.String({ queryable: true }),

        summary: Attributes.String({}),
        dueDate: Attributes.Number({ queryable: true }),
        completedDate: Attributes.Number({}),
        status: Attributes.String({ queryable: true }),
        priority: Attributes.Number({}),
        percentComplete: Attributes.Number({}),
    };

    isCompleted(): boolean {
        return this.status === 'COMPLETED';
    }

    isOverdue(): boolean {
        return !this.isCompleted() && this.dueDate < Date.now() / 1000;
    }
}
```

## Files to Create

| File | Description |
|------|-------------|
| `mailsync/MailSync/Models/CalendarTask.hpp` | Task model header |
| `mailsync/MailSync/Models/CalendarTask.cpp` | Task model implementation |
| `app/src/flux/models/calendar-task.ts` | TypeScript task model |
| `app/src/flux/tasks/syncback-task-task.ts` | Create/update task |
| `app/src/flux/tasks/destroy-task-task.ts` | Delete task |

## Files to Modify

| File | Changes |
|------|---------|
| `mailsync/MailSync/Models/Calendar.hpp/cpp` | Add supportsEvents/supportsTasks |
| `mailsync/MailSync/DAVWorker.hpp/cpp` | Add runForCalendarTasks |
| `mailsync/MailSync/TaskProcessor.hpp/cpp` | Add task syncback handlers |
| `app/src/global/mailspring-exports.js` | Register new task types |

## Scope Consideration

This is a significant feature addition. Consider:
- Is task management in scope for Mailspring?
- Would a separate "Tasks" view be needed?
- Integration with email (task from email)?

This plan is provided for completeness but may be deferred.

## Testing

1. Sync calendar with only VTODO support - verify tasks synced
2. Sync calendar with both VEVENT and VTODO - verify both synced
3. Create task, sync - verify appears on server
4. Complete task, sync - verify status updated
5. Delete task, sync - verify removed from server
