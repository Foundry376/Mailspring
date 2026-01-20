# EventRSVPTask Sync Engine Specification

This document specifies exactly how the C++ sync engine (Mailspring-Sync) should handle the `EventRSVPTask` to properly format and send an iMIP RSVP reply according to RFC 5546 (iTIP) and RFC 6047 (iMIP).

## Overview

When a user clicks Accept/Tentative/Decline on a calendar invitation, the Electron app creates an `EventRSVPTask` and sends it to the sync engine. The sync engine must:

1. Construct a properly formatted MIME email message
2. Include the iCalendar REPLY as specified by RFC 5546/6047
3. Send the email to the organizer

## Task Data Received from Electron

The sync engine receives the following JSON data:

```json
{
  "type": "queue-task",
  "task": {
    "id": "<task-id>",
    "accountId": "<account-id>",
    "to": "organizer@example.com",
    "subject": "Accepted: Meeting Title",
    "ics": "<iCalendar REPLY data - see below>",
    "icsRSVPStatus": "ACCEPTED" | "TENTATIVE" | "DECLINED",
    "messageId": "<original-message-id>"
  }
}
```

### ICS Data

The `ics` field contains a complete iCalendar object that has already been modified by the Electron app:
- `METHOD` property set to `REPLY`
- The replying attendee's `PARTSTAT` parameter set to the user's response
- All other properties preserved from the original invitation

Example ICS content:
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mailspring//Calendar//EN
METHOD:REPLY
BEGIN:VEVENT
UID:unique-event-id@example.com
DTSTAMP:20240115T120000Z
DTSTART:20240120T140000Z
DTEND:20240120T150000Z
SUMMARY:Team Meeting
ORGANIZER;CN=John Doe:mailto:organizer@example.com
ATTENDEE;PARTSTAT=ACCEPTED;CN=Jane Smith:mailto:attendee@example.com
SEQUENCE:0
END:VEVENT
END:VCALENDAR
```

## RFC Requirements

### RFC 5546 (iTIP) - Required Properties for VEVENT REPLY

| Property | Presence | Notes |
|----------|----------|-------|
| `METHOD` | **Required (1)** | MUST be `REPLY` |
| `VEVENT` | **Required (1+)** | All components MUST have the same UID |
| `UID` | **Required (1)** | MUST match the original REQUEST |
| `DTSTAMP` | **Required (1)** | Timestamp of the reply |
| `ORGANIZER` | **Required (1)** | Must match the original |
| `ATTENDEE` | **Required (1)** | MUST be the replying attendee with updated `PARTSTAT` |
| `RECURRENCE-ID` | Optional (0 or 1) | Only for recurring event instances |
| `SEQUENCE` | Optional (0 or 1) | If present, must match the original REQUEST |

**Important**: Unlike REQUEST, the REPLY method does NOT require `DTSTART`, `DTEND`, or `SUMMARY`. However, including them (copied from the original) is harmless and may improve compatibility.

### RFC 6047 (iMIP) - Email MIME Requirements

The iMIP specification defines how to transport iTIP messages via email.

## Required MIME Message Structure

### Option A: Simple Structure (Recommended for REPLY)

```
MIME-Version: 1.0
From: attendee@example.com
To: organizer@example.com
Subject: Accepted: Team Meeting
Content-Type: text/calendar; method=REPLY; charset=UTF-8
Content-Transfer-Encoding: base64

<base64-encoded iCalendar data>
```

### Option B: Multipart/Alternative Structure (Better Compatibility)

```
MIME-Version: 1.0
From: attendee@example.com
To: organizer@example.com
Subject: Accepted: Team Meeting
Content-Type: multipart/alternative; boundary="----=_Part_0"

------=_Part_0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

Jane Smith has accepted the invitation to: Team Meeting
When: January 20, 2024 2:00 PM - 3:00 PM

------=_Part_0
Content-Type: text/calendar; method=REPLY; charset=UTF-8
Content-Transfer-Encoding: base64

<base64-encoded iCalendar data>

------=_Part_0--
```

## Critical Content-Type Header Requirements

The `Content-Type` header for the calendar part **MUST** include:

```
Content-Type: text/calendar; method=REPLY; charset=UTF-8
```

### Required Parameters:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `method` | `REPLY` | **CRITICAL**: Must match the `METHOD` property inside the iCalendar. Without this parameter, the message is NOT considered an iMIP message per RFC 6047. |
| `charset` | `UTF-8` | Required if iCalendar contains non-ASCII characters. Recommended to always include. |

### Optional Parameters:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `component` | `VEVENT` | Indicates the primary component type |
| `name` | `"invite.ics"` | Filename hint (not authoritative) |

## Content-Transfer-Encoding

Per RFC 6047:
- If the transport is **8-bit clean**, no encoding is strictly required
- Otherwise, use `base64` or `quoted-printable`
- **Recommendation**: Always use `base64` for maximum compatibility

## Content-Disposition (Optional but Recommended)

```
Content-Disposition: inline; filename="invite.ics"
```

- Use `inline` (not `attachment`) for the calendar part
- The `filename` is for display purposes only and must not override `Content-Type`

## Complete Example: Properly Formatted RSVP Email

```
MIME-Version: 1.0
Date: Mon, 15 Jan 2024 12:00:00 -0000
From: Jane Smith <attendee@example.com>
To: John Doe <organizer@example.com>
Subject: Accepted: Team Meeting
Content-Type: multipart/alternative; boundary="----=_Part_123456"

------=_Part_123456
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit

Jane Smith has accepted the invitation to: Team Meeting

------=_Part_123456
Content-Type: text/calendar; method=REPLY; charset=UTF-8
Content-Transfer-Encoding: base64
Content-Disposition: inline; filename="invite.ics"

QkVHSU46VkNBTEVOREFSDQpWRVJTSU9OOjIuMA0KUFJPRFVJRC...
(base64 encoded iCalendar REPLY)

------=_Part_123456--
```

## Validation Checklist

The sync engine should validate/ensure:

### Before Sending:

1. [ ] `ics` field is not empty
2. [ ] `to` field contains a valid email address
3. [ ] `ics` contains `METHOD:REPLY`
4. [ ] `ics` contains exactly one `ATTENDEE` property (the replying user)
5. [ ] The `ATTENDEE` has a valid `PARTSTAT` parameter

### MIME Construction:

1. [ ] `Content-Type` header includes `method=REPLY` parameter
2. [ ] `Content-Type` header includes `charset=UTF-8` parameter
3. [ ] Content-Transfer-Encoding is `base64` (or `quoted-printable`)
4. [ ] `From` header matches the replying attendee's email
5. [ ] `To` header is the organizer's email (from task `to` field)
6. [ ] `Subject` is set from task `subject` field

## Common Implementation Mistakes

### 1. Missing `method` parameter in Content-Type

**Wrong:**
```
Content-Type: text/calendar; charset=UTF-8
```

**Correct:**
```
Content-Type: text/calendar; method=REPLY; charset=UTF-8
```

Without the `method` parameter, RFC 6047 states the body part "is not considered to be an iMIP body part."

### 2. Sending as attachment instead of inline

**Wrong:**
```
Content-Type: multipart/mixed
...
Content-Disposition: attachment; filename="invite.ics"
```

**Correct:**
```
Content-Type: multipart/alternative
...
Content-Disposition: inline; filename="invite.ics"
```

Calendar clients may not automatically process attachments as RSVP responses.

### 3. Mismatched METHOD values

**Wrong:** `Content-Type: text/calendar; method=REQUEST` with `METHOD:REPLY` inside the ICS

**Correct:** Both must be `REPLY`

### 4. Including multiple ATTENDEEs in REPLY

Per RFC 5546, a REPLY MUST have exactly one ATTENDEE - the one responding. The Electron app should have already trimmed this, but verify.

### 5. Wrong From address

The `From` header MUST match the email of the `ATTENDEE` in the iCalendar. Mismatches may cause the response to be rejected.

## Testing Recommendations

Test RSVP replies against:

1. **Google Calendar** - Strict RFC compliance
2. **Microsoft Outlook/Exchange** - May have quirks with MIME structure
3. **Apple Calendar** - Generally compliant
4. **Fastmail** - Good RFC compliance

### Test Cases:

1. Accept a simple one-time event
2. Accept a recurring event instance (with RECURRENCE-ID)
3. Decline an event
4. Tentatively accept an event
5. Reply to an event with non-ASCII characters in summary
6. Reply to an all-day event

## References

- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - iCalendar Core Object Specification
- [RFC 5546](https://datatracker.ietf.org/doc/html/rfc5546) - iTIP (Transport-Independent Interoperability Protocol)
- [RFC 6047](https://datatracker.ietf.org/doc/html/rfc6047) - iMIP (Message-Based Interoperability Protocol)
- [CalConnect Developer Guide](https://devguide.calconnect.org/Scheduling/iTIP/) - Practical iTIP implementation guidance

## Appendix: PARTSTAT Values

| Value | Meaning |
|-------|---------|
| `NEEDS-ACTION` | No response yet (default in REQUEST) |
| `ACCEPTED` | Attendee has accepted |
| `DECLINED` | Attendee has declined |
| `TENTATIVE` | Attendee has tentatively accepted |
| `DELEGATED` | Attendee has delegated to another |

## Appendix: Example iCalendar REPLY Body

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mailspring//EN
METHOD:REPLY
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E00800000000B0635B7
DTSTAMP:20240115T120000Z
DTSTART:20240120T140000Z
DTEND:20240120T150000Z
SUMMARY:Team Meeting
ORGANIZER;CN="John Doe":mailto:organizer@example.com
ATTENDEE;PARTSTAT=ACCEPTED;CN="Jane Smith":mailto:attendee@example.com
SEQUENCE:0
REQUEST-STATUS:2.0;Success
END:VEVENT
END:VCALENDAR
```

Note: `REQUEST-STATUS:2.0;Success` is optional but recommended to indicate successful processing of the request.
