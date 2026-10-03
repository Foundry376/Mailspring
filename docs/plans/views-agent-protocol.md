# Views authoring agent: client ↔ backend protocol

The contract between the Mailspring client and the id.getmailspring.com proxy for building a
View with the hosted agent. The client never talks to Anthropic directly. The agent's prompt,
skills and Managed Agents configuration live in the closed-source backend; this document only
covers the wire protocol. Design context: `sandboxed-views-exploration.md` §16–§17.

All routes require Mailspring ID auth (`Authorization: Basic base64(<identity token>:)`, the
same `identity-token` strategy as the other API routes). Bodies are JSON, and errors are
`{ error: { code, message } }`.

## Sessions

There is one Managed Agents session per (identity, viewId). The backend stores the mapping.

| Route | Body | Response |
|---|---|---|
| `POST /api/views/agent/sessions` | `{ viewId, name, request, examples: Example[], current?: { manifest, files } }` | `{ viewId, sessionId, resumed: boolean, replaced?: true }` |
| `GET /api/views/agent/sessions/:viewId/events` | (SSE) | stream of `AgentEvent`, see below |
| `POST /api/views/agent/sessions/:viewId/messages` | `{ text, examples?: Example[] }` | `{ ok: true }` |
| `POST /api/views/agent/sessions/:viewId/tool-results` | `{ toolUseId, content: ToolContent[], isError?: boolean }` | `{ ok: true }` |
| `POST /api/views/agent/sessions/:viewId/interrupt` | `{}` | `{ ok: true }` |
| `POST /api/views/agent/sessions/:viewId/budget` | `{ action: 'raise' \| 'stop' }` | `{ ok: true, maxListCostCents }` |
| `GET /api/views/agent/public-key` | | `{ alg: 'ed25519', publicKey: <base64 SPKI DER> }` (dev convenience; production pins the key in the app) |

- **Creating a session.** `POST /sessions` for a viewId that already has a session resumes
  it: the backend sends `request` as a new user message instead of starting over.
  - New View builds count against the `view-agent-build` quota: 5 per identity per day.
  - Over quota returns HTTP 429 with code `quota`, plus `{ feature: 'view-agent-build',
    limit, period, resetsAt }`.
- **Outdated sessions.** The backend records the agent version each session is pinned to.
  A session on a version older than the backend's minimum compatible version can't produce
  previews the relay accepts, so:
  - `GET …/events` and `POST …/messages` return HTTP 409 with code `session_outdated`.
  - `POST /sessions` for that View starts a fresh session seeded with `current`, reuses the
    View's mapping (the old session is abandoned, never deleted), and returns
    `{ resumed: false, replaced: true }`. A replacement doesn't count against the build quota.
  - The client shows a system line, and the user's next message calls `POST /sessions` with
    the View's current code. Opening the panel alone never starts a session.
  - A fresh session numbers its revisions from 1, so the client resets that View's
    last-accepted revision whenever `resumed` is false.
- **Budgets.** Every session is created with `budget.max_list_cost` = 200 (cents).
  - `budget: 'raise'` raises the cap by another 200 above the consumed list cost.
  - `budget: 'stop'` leaves the session paused.

## Event stream (`AgentEvent`)

The backend reconnects to Managed Agents and consolidates events, deduplicating by event id.
It normalizes them to:

| `type` | Fields | Client behaviour |
|---|---|---|
| `status` | `status: 'running' \| 'idle' \| 'budget_reached' \| 'terminated'` | Panel status line; on `budget_reached`, offer Raise / Stop |
| `message` | `id, text` (markdown) | Agent chat bubble |
| `thinking` | `id` | Optional "working…" indicator |
| `tool_request` | `id, toolUseId, name, input, signature?, resolved` | If `resolved` is false, run the client tool (below) and POST `tool-results`. Replayed requests that already have a result arrive with `resolved: true` and must not be run again |
| `tool_result` | `id, toolUseId, name, isError, summary` | How a client tool call was answered, with no content echoed: `{ examples: n } \| { skipped }` for examples, `{ answer }` for questions, `{ screenshot } \| { declined }` for screenshots, and `{ status: 'ok'\|'failed'\|'timeout'\|'rejected' }` for previews. Lets a replaying client show the user's reply under each request and each revision's outcome |
| `user_message` | `id, text, exampleCount` | The user's own turns, for both the initial request and later messages. Lets a relaunched client rebuild the transcript; the client de-dupes against its optimistic copy |
| `error` | `code, message` | Error row in the panel |
| `usage` | `listCostCents, maxListCostCents` | Optional spend meter |

The stream starts with a replay of the session's past events, so a reconnecting client
rebuilds the transcript from it. Events carry a stable `id` for dedupe. The client keeps a
`lastEventId` and sends it as `Last-Event-ID` when it reconnects.

## Client tools (Managed Agents custom tools)

| `name` | `input` | Client action | Result `content` |
|---|---|---|---|
| `preview_revision` | `{ revision, manifest, files: { 'View.jsx': string } }` + `signature` on the event | Verify the signature, check the revision is above the last accepted one, then `previewAndWait` on the draft | text: JSON `{ status: 'ok'\|'failed'\|'timeout', diagnostics: Diagnostic[] }`. Diagnostics carry no mail content |
| `request_examples` | `{ prompt }` | Show the prompt in the panel, then wait for the user to drop threads and press Send, or Skip | text: JSON `{ examples: Example[] }` or `{ skipped: true }` |
| `request_screenshot` | `{ reason }` | Capture the View preview and ask "Send screenshot?" | image (`{ type: 'image', mediaType: 'image/png', dataBase64 }`) or text `"declined"` |
| `ask_user` | `{ question, choices?: string[] }` | Show the question with optional buttons | text: the user's answer |

`ToolContent` is `{ type: 'text', text } | { type: 'image', mediaType, dataBase64 }`. The
backend forwards it as a `user.custom_tool_result`, uploading the image through the Files API
if the result content needs it.

## Signing `preview_revision`

The backend signs the canonical JSON of
`{ identityId, viewId, revision, manifest, files }` with Ed25519.

- **Canonical JSON:** keys sorted recursively, no whitespace, UTF-8.
- **Signature:** base64, in the event's `signature` field.
- **Client checks:** the client verifies with `crypto.verify(null, data, publicKey, sig)`.
  - In dev, the public key comes from `core.views.agentPublicKey`, or is fetched from
    `/public-key`. Production pins it in the app.
  - The client rejects a revision when the signature is invalid, when `identityId` or
    `viewId` don't match, or when `revision` isn't above the last accepted revision for that
    View.
  - Rejections are returned as a tool error, so the agent sees them.

## `Example`

```ts
type Example = {
  messageId: string; threadId: string;
  from: { name, email }[]; to: …; cc: …;
  subject: string; date: string;   // ISO
  text: string;                    // quote- and signature-stripped
  html: string;                    // sanitized; no remote images, scripts or tracking pixels; cid: images dropped
};
```

Examples are built by the client from host-side sanitized content. They become session file
resources at `/workspace/examples/<messageId>.json`, or are inlined in a message or tool result
when they arrive later.
