# Sync engine: message importance / priority headers

This document is a handoff for the C++ Mailspring-Sync engine. The Electron
side (this repo) has been wired up to display and edit a per-message
`importance` value; the sync engine is the missing half. Once these changes
land, the feature ships end-to-end.

## What's already done on the TypeScript side

- `Message` gained a new attribute (`app/src/flux/models/message.ts`):
  ```ts
  importance: Attributes.String({
    modelKey: 'importance',
    jsonKey: 'hImportance',
  }),
  ```
- The composer has a new "High / Normal / Low" dropdown that writes
  `draft.importance` via `session.changes.add({ importance })`. Drafts are
  serialized through `Model.toJSON()`, which emits `hImportance` whenever
  the value is set.
- The thread list shows a red exclamation icon next to (or beneath) the
  unread dot whenever any non-draft message in the thread has
  `importance: 'high'`.

The C++ engine currently neither parses these headers on inbound mail nor
emits them on outbound, so the field will always be empty until this work
lands. The Electron side is the consumer; the sync engine owns the database
schema and all MIME I/O.

## The contract

| | |
|---|---|
| JSON key on the wire | `hImportance` |
| TypeScript model key | `importance` |
| Allowed values | `"high"`, `"low"`, `"normal"`, or omitted/empty |

Treat `"normal"` and an absent/empty value as equivalent. The Electron UI
only renders an indicator for `"high"` today, but the field is a tri-state
so we don't have to break the schema later if we add a "low" indicator.

## Three pieces of work

### 1. Database schema

Add a new column on the messages table — likely `importance TEXT` (or an
enum/int if that's the convention; `listUnsubscribe` uses TEXT). Default
empty string / NULL.

**Strong precedent to follow:** `listUnsubscribe` and `listUnsubscribePost`.
On the TypeScript side these only exist as model attributes (see
`app/src/flux/models/message.ts:181-189`); the entire round-trip — DB
column, MIME header parsing, JSON serialization in deltas — lives in the
C++ engine. Find where `hListUnsub` / `listUnsubscribe` are read and
written in the C++ code and mirror that pattern for `hImportance`.

A schema migration will be needed for existing user databases.

### 2. Inbound: parse priority headers when fetching/syncing messages

When ingesting a message (IMAP fetch / append parsing), look at the MIME
headers in this priority order and store the first one that resolves:

1. **`Importance:`** (RFC 2156 / RFC 4021) — values `high`, `normal`, `low`,
   case-insensitive. Map directly to our enum. This is the standardized
   header and should win when present.
2. **`X-Priority:`** — numeric `1`–`5` (sometimes followed by a word in
   parentheses, e.g. `1 (Highest)`). Map:
   - `1` or `2` → `"high"`
   - `3` (or absent) → `"normal"`
   - `4` or `5` → `"low"`
3. **`X-MSMail-Priority:`** — `High`, `Normal`, `Low`, case-insensitive.
   Used as a final fallback; Outlook always emits this alongside the others.

If none are present, store empty / NULL. If multiple are present and they
disagree (rare, but real — buggy senders), prefer `Importance`, then
`X-Priority`, then `X-MSMail-Priority`. Do **not** try to "merge" them.

Be defensive about whitespace and casing. Don't lowercase the stored value
— pick the canonical form (`"high"` / `"normal"` / `"low"`) yourself.

When a message row is emitted in a delta to Electron, include
`hImportance` whenever the column is non-empty. Empty/NULL should
either be omitted or sent as `""` — either is fine, the model treats
both as unset.

### 3. Outbound: inject all three headers when sending

When the engine receives a `SendDraftTask` whose draft has a non-empty
`importance` value, inject **all three** headers into the outgoing MIME so
that every receiving client (Outlook, Apple Mail, Thunderbird, Gmail web,
mobile clients) renders the indicator. Different clients honor different
headers, and Outlook itself emits all three, so this is the safe default.

Mapping for outbound:

| `importance` | `Importance` | `X-Priority` | `X-MSMail-Priority` |
|---|---|---|---|
| `"high"` | `high` | `1 (Highest)` | `High` |
| `"low"` | `low` | `5 (Lowest)` | `Low` |
| `"normal"` or empty | *omit all three* | *omit* | *omit* |

For `"normal"` we deliberately emit nothing — clients treat absence as
normal, and emitting `Importance: normal` is just noise.

Header injection should happen wherever the engine builds the MIME
envelope for the SMTP send (look for the existing code that handles
`In-Reply-To`, `References`, `Message-Id`, etc.). It should also be
preserved if the engine ever appends sent mail to the IMAP "Sent" folder
itself — i.e. the headers should be in the canonical MIME the engine
generates, not bolted on at SMTP time only.

## Edge cases to think through

- **Drafts.** The `importance` field on a draft round-trips through the
  database like any other draft field. No special handling needed — when
  the user finally hits Send, the value is already on the message row the
  send task reads.
- **Reply / forward.** When the user replies to a high-importance message,
  the reply should **not** inherit `importance`. The composer creates a
  fresh draft and the importance dropdown defaults to normal. (No work
  needed — just don't accidentally propagate it on the C++ side either.)
- **Thread aggregation.** Threads have no aggregate importance column.
  Electron determines "does this thread have a high-priority message?" by
  iterating `thread.__messages` (which is populated client-side from the
  per-message column). No new thread column is needed.
- **Plaintext drafts.** Importance is just a header, independent of body
  format. Works for both HTML and plaintext drafts.
- **Encrypted (PGP/MIME) messages.** Headers stay outside the encrypted
  body, so importance should still be parseable on inbound and settable on
  outbound for encrypted mail without special-casing.

## Testing checklist

Inbound:
- [ ] Receive a message with `Importance: high` only — stored as `"high"`.
- [ ] Receive a message with `X-Priority: 1` only — stored as `"high"`.
- [ ] Receive a message with `X-MSMail-Priority: High` only — stored as `"high"`.
- [ ] Receive a message with `X-Priority: 5 (Lowest)` — stored as `"low"`.
- [ ] Receive a message with all three headers in agreement — stored as
      the matching value.
- [ ] Receive a message with conflicting headers — `Importance` wins.
- [ ] Receive a message with no priority headers — stored empty / NULL.
- [ ] `hImportance` appears in the JSON delta sent to Electron.

Outbound:
- [ ] Send a draft with `importance: "high"` — outgoing MIME contains
      `Importance: high`, `X-Priority: 1 (Highest)`, and
      `X-MSMail-Priority: High`.
- [ ] Send a draft with `importance: "low"` — outgoing MIME contains
      `Importance: low`, `X-Priority: 5 (Lowest)`, `X-MSMail-Priority: Low`.
- [ ] Send a draft with `importance: ""` or `"normal"` — outgoing MIME
      contains *none* of the three headers.
- [ ] Round-trip: send to a Gmail account, fetch the sent copy via IMAP,
      confirm the headers survived and the field is repopulated correctly
      on the received side.

Schema:
- [ ] Existing users' databases migrate cleanly; the new column starts
      empty for all pre-existing rows.

## How to find the relevant C++ code quickly

`listUnsubscribe` is the closest existing analogue: a single string
column on the messages table, populated from a MIME header on inbound,
serialized to Electron via the `hListUnsub` JSON key. Grepping the C++
tree for `hListUnsub`, `listUnsubscribe`, and `List-Unsubscribe` should
land you on every file you need to touch (schema, parser, serializer).
The new `hImportance` plumbing should sit right next to it in each of
those files.

For outbound MIME composition, look for where `In-Reply-To` or
`References` headers are written when sending — that's the same spot
that needs to learn about `Importance` / `X-Priority` /
`X-MSMail-Priority`.
