# Views API: `@mailspring/view` and the `window.mailspring` transport

This is the authoritative spec for the code that View authors write against. Most authors
will be LLM agents. It accompanies `sandboxed-views-exploration.md` (the "plan" below). Every
name here should be familiar to an agent that has written a Claude artifact: a single React
file, hooks, recharts, lucide-react, and Tailwind.

Status: draft for prototyping, 2026-10-02.

---

## 1. Shape of a View

```
my-view/
  manifest.json   { name, placement: "page" | "thread-sidebar",
                    sidebar?: { mode: "card" | "panel", title? },   // thread-sidebar only (§1.1)
                    permissions: [...], network: ["api.example.com"],
                    credentials?: [{ id, label, hosts, header?, format?, help?, helpUrl? }] }  // §3.10
  View.jsx        export default function View() { ... }
```

The View's id is its folder name (lowercase letters, digits and `-`). It keys the View's
storage partition and its metadata namespace (`view:<id>`). `id` and `version` fields in the
manifest are accepted and ignored for now.

| Allowed import | Notes |
|---|---|
| `react` | React 18 bundled into the View runtime, independent of the host's React 17. The default export is mounted into `#root`. |
| `recharts` | Charts. Use `useTheme().chart` for series colors. |
| `lucide-react` | Icons. |
| `@mailspring/view` | Everything in §3. |

- **Styling:** Tailwind utility classes, compiled at runtime and offline. Every key of
  `Theme.colors` (§3.6) is a Tailwind color: `bg-ms-bg`, `bg-ms-panel`, `text-ms-text`,
  `text-ms-muted`, `border-ms-border`, `text-ms-accent` / `bg-ms-accent`, `text-ms-danger`,
  `text-ms-success`, `text-ms-warning`, `text-ms-link`, `text-ms-heading`. They are also CSS
  variables (`var(--ms-accent)`). `dark:` follows the Mailspring theme, not the OS.
- **Network:** the global `fetch` works for hosts in `manifest.network` and fails for every
  other host. It never carries the user's API keys; requests that need one go through
  `credentialFetch` (§3.10), which the host sends with the key attached. Views never see
  secrets.
- **What isn't available:** other imports and CDN URLs fail at load time. There is no Node and
  no `require`.

### 1.1 Thread-sidebar Views: card and panel modes

A View with `"placement": "thread-sidebar"` picks one of two modes in its manifest:

```json
{
  "name": "Sender Context",
  "placement": "thread-sidebar",
  "sidebar": { "mode": "panel", "title": "History" },
  "permissions": ["mail.read"]
}
```

| | `card` (default) | `panel` |
|---|---|---|
| Where | Stacked with the contact cards, below the contact profile | Fills the whole sidebar, chosen from the switcher at the top of it |
| Chrome | The host draws the standard `.sidebar-section` card: 5px inset, 5px radius, 1px border, 15px padding, theme background. With `title`, it adds the same uppercase section heading as other cards. | None. The host insets the View 15px on each side to line up with the switcher. |
| Height | Content height, reported automatically by the runtime (clamped 32–900px). | The full sidebar height. The View scrolls itself. |
| Lifetime | One webview per View, kept across thread changes. Hidden while no thread is open. | Same, and also kept while another panel is selected. |
| Events | `context` on every thread change; `visibility` when shown or hidden. | Same; `visibility` is false while another panel is selected. |

**Authoring rule:** draw no card, border or background of your own. Render content on a
transparent background with `text-ms-*` colours, and the host chrome makes it look native in
every theme. Pick `panel` when the View needs more than a card's worth of vertical space, or
is a different "mode" of the sidebar (a CRM record, an agenda) rather than an addition to the
contact information.

#### The sidebar switcher

The switcher (`message-list/lib/sidebar-panels.tsx`) is generic, not specific to Views. It
appears only when at least one panel is registered:

- **Contact** is the default panel: everything registered at the `MessageListSidebar`
  location (participant picker, contact cards, card-mode Views).
- Any component registered for the `MessageListSidebar:Panel` role with a static
  `sidebarPanel = { id, title }` becomes another choice. It receives an `active` prop and stays
  mounted while hidden. A built-in Calendar Agenda panel would register the same way.
- The choice is remembered in `core.messageListSidebar.panel`, and falls back to Contact when
  its provider disappears.

## 2. Transport (`window.mailspring`)

The low-level surface is exposed by the preload through `contextBridge`. View authors never
use it directly; `@mailspring/view` is built on it.

```ts
window.mailspring.call(method: string, params: object): Promise<{ result } | { error: ViewErrorJSON }>
window.mailspring.on(event: string, cb: (payload) => void): () => void      // returns unsubscribe
```

`call` always resolves, with an envelope: `contextBridge` drops everything but `message` from a
rejected Error, so errors travel as data and `@mailspring/view` rethrows them as `ViewError`.

| Method | Params → result | Permission |
|---|---|---|
| `accounts.list` | `{}` → `Account[]` | `mail.read` |
| `threads.find` | `{ query, offset? }` → `{ items: ThreadSummary[], hasMore }` | `mail.read` |
| `messages.find` | `{ query, offset? }` → `{ items: MessageSummary[], hasMore }` | `mail.read` |
| `counts.find` | `{ query, groupBy }` → `CountRow[]` | `mail.read` |
| `identity.get` | `{}` → `Identity` | `mail.read` |
| `events.find` | `{ start, end, search? }` → `Event[]` | `calendar.read` |
| `subscribe` | `{ kind: 'threads'\|'messages'\|'counts'\|'events'\|'accounts', params }` → `{ subId }` | as the matching `find` |
| `unsubscribe` | `{ subId }` → `{}` | none |
| `messages.content` | `{ ids, text?, html?, structured?, includeQuoted? }` → `Record<id, MessageContent>` | `mail.bodies` |
| `messages.renderable` | `{ id }` → `{ html, headers }` (sanitized, for `<MessageView>`) | `mail.bodies` |
| `attachments.url` | `{ id }` → `{ url }` (`mailspring-view:` URL) | `mail.bodies` |
| `ai.extract` | `{ query? \| ids?, schema, instructions? }` → `{ jobId }` | `mail.bodies` |
| `ai.cancel` | `{ jobId }` → `{}` | none |
| `metadata.set` | `{ kind: 'thread'\|'message', id, value: object\|null }` → `{}` | `metadata.own` |
| `mail.modify` | `{ threadIds, change }` → `{ taskIds }` | `mail.modify` |
| `ui.showThread` | `{ id }` | none |
| `ui.search` | `{ search }` (opens the main thread list with this query) | none |
| `ui.compose` | `{ to?, cc?, subject?, body?, accountId? }` | none (user sends) |
| `ui.reply` | `{ messageId, body?, all? }` | none (user sends) |
| `ui.openExternal` | `{ url }` (host confirms) | none |
| `ui.setBadge` | `{ count: number\|null }` | none |
| `ui.setHeight` | `{ px }` (sidebar only; called automatically by the runtime) | none |

| Host → View event | Payload |
|---|---|
| `subscription` | `{ subId, data, hasMore }` (full snapshot) |
| `subscription.error` | `{ subId, error: ViewError }` |
| `ai.progress` | `{ jobId, results: ExtractResult[], processed, total, status }` |
| `context` | `{ thread: ThreadSummary, messages: MessageSummary[] } \| null` (sidebar only) |
| `theme` | `Theme` |
| `visibility` | `{ visible: boolean }` |

The host validates every call with zod, checks the grant, and returns data through the
serializers.

## 3. `@mailspring/view`

The rule an agent can learn once: **every read has a live `useX` hook and a one-shot `getX`
function with the same arguments. Every write is a plain async function.**

### 3.1 Queries

Every read takes a `Query`. Filters are JSON: the host validates them and compiles them straight
to SQL, so there is no query syntax to get wrong and every field has one documented meaning.

```ts
type Query = {
  where?: Filter;          // omit for "everything"
  threadId?: string;       // messages only
  ids?: string[];          // exact ids, max 500
  tagged?: boolean;        // only items that carry this View's metadata
  limit?: number;          // threads default 100, max 1000; messages default 100, max 2000
  order?: 'newest' | 'oldest';   // default 'newest'
  search?: string;         // search-bar syntax (§3.8), for text the user typed
};
// A plain string is shorthand for { search: string }. Unknown keys are an error, so a filter
// written at the top level ({ from: 'x' }) fails with a hint to move it under `where`.

type Addr = string;        // 'a@b.com' (exact) or 'b.com' / '@b.com' (domain and subdomains)

type Filter =               // each object has exactly one key
  | { and: Filter[] } | { or: Filter[] } | { not: Filter }
  // Message fields. In a thread query they mean "the thread has a message that matches".
  | { from: Addr | Addr[] }
  | { to: Addr | Addr[] }                    // to, cc or bcc
  | { participant: Addr | Addr[] }           // from, to, cc or bcc
  | { direction: 'sent' | 'received' }      // sent = from one of my addresses (useIdentity)
  | { hasAttachment: boolean }               // inline images don't count
  | { listUnsubscribe: boolean }             // has a List-Unsubscribe header: newsletters, lists
  // Thread fields. In a message query they mean "the message's thread matches".
  | { in: string | string[] }                // role ('inbox', 'sent', 'archive', 'trash', 'spam',
                                             // 'drafts', 'all', 'important', 'snoozed'), a
                                             // folder/label id, or its name; unknown names error
  | { text: string }                         // full-text search, see below
  // Either.
  | { subject: string }                      // case-insensitive substring
  | { unread: boolean } | { starred: boolean }
  | { account: string | string[] }
  | { date: { after?: string; before?: string } }   // ISO dates; after is inclusive, before exclusive.
                                             // Messages: the message date. Threads: latest message.
  | { tagged: boolean }                      // carries this View's metadata
  | { search: string };                      // search-bar syntax as one term
```

```js
// Ride receipts from the last year
useMessages({
  where: { and: [
    { from: ['uber.com', 'lyft.com'] },
    { direction: 'received' },
    { date: { after: '2025-10-01' } },
  ] },
  limit: 500,
});

// Unread inbox threads with an attachment
useThreads({ where: { and: [{ in: 'inbox' }, { unread: true }, { hasAttachment: true }] } });

// Everything with one person
useMessages({ where: { participant: 'alice@example.com' }, limit: 300 });
```

- **`text` semantics:** words, not substrings. Every word must appear somewhere in the
  thread (subject, participants, folder names or body). Words are stemmed, so `riding` matches
  "rides". Punctuation is ignored, and there's no prefix or phrase matching. Use `subject` for
  substrings and `from`/`to` for addresses.
- **Limits:** at most 8 levels of nesting, 200 terms, 500 values across all address lists, and
  16 words per `text`. Exceeding one is `ViewError('limit')`. A malformed filter is
  `ViewError('invalid')` with the path of the offending term.
- **Timeouts:** one-shot reads that take longer than 15 seconds reject with
  `ViewError('timeout')`. Queries run off the UI thread, so a slow one never freezes the app.
- **Dates in filters should be stable across renders.** Hooks key subscriptions by the query's
  JSON, so `new Date().toISOString()` resubscribes on every render. Round to the day:
  `new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)`.

### 3.2 Reads

```ts
type Live<T> = { data: T; loading: boolean; error: ViewError | null; hasMore?: boolean };

function useThreads(q: Query): Live<ThreadSummary[]>;
function useMessages(q: Query): Live<MessageSummary[]>;
function useCounts(q: Query, groupBy: Dim | [Dim, Dim]): Live<CountRow[]>;
function useEvents(range: { start: Date | string; end: Date | string; search?: string }): Live<Event[]>;
function useAccounts(): Live<Account[]>;
function useIdentity(): Identity | null;                // null until loaded
function useContent(ids: string[], opts?: ContentOpts): Live<Record<string, MessageContent>> & { loaded: number; total: number };  // cached, not live
function useSelectedThread(): { thread: ThreadSummary; messages: MessageSummary[] } | null;   // sidebar placement
function useTheme(): Theme;
function useViewState<T>(key: string, initial: T): [T, (v: T) => void];   // device-local localStorage, survives reloads

function getThreads(q: Query & { offset?: number }): Promise<{ items: ThreadSummary[]; hasMore: boolean }>;
function getMessages(q: Query & { offset?: number }): Promise<{ items: MessageSummary[]; hasMore: boolean }>;
function getCounts(q: Query, groupBy: Dim | [Dim, Dim]): Promise<CountRow[]>;
function getEvents(range: {...}): Promise<Event[]>;
function getContent(ids: string[], opts?: ContentOpts): Promise<Record<string, MessageContent>>;  // batched internally
function getIdentity(): Promise<Identity>;

type ContentOpts = { text?: boolean /* default true */; html?: boolean; structured?: boolean; includeQuoted?: boolean /* default false */ };
type MessageContent = {
  text?: string | null; html?: string | null; structured?: object[];  // schema.org JSON-LD/microdata
  reason?: 'body_unavailable' | 'not_found';   // why text is null: the body hasn't downloaded yet
};                                             // (retried on the next request), or no such message

type Dim = 'sender' | 'recipient' | 'category' | 'account' | 'thread'
         | 'year' | 'month' | 'week' | 'day' | 'weekday' | 'hour';
type CountRow = {
  key: Partial<Record<Dim, string | number>>;   // sender/recipient keys are lowercase addresses
  labels: Partial<Record<Dim, string>>;          // display names: sender, recipient, category, account
  isMe: { sender?: boolean; recipient?: boolean };  // person keys that are one of my addresses
  count: number; first: string; last: string;
};
type Identity = {
  accounts: { id: string; email: string; name: string }[];
  addresses: string[];   // lowercase: account addresses, aliases, and every address found in Sent
};
```

`useCounts` runs on **messages** and aggregates in SQL on the host. It is the single analytics
primitive: volume heatmaps, top senders, people by folder, lost touch, spend counts. It
replaces pulling thousands of rows across the bridge. Rows come back sorted by `count`
descending, with at most 5,000 rows. `first` and `last` are ISO dates of the oldest and newest
message in the group. `month` keys look like `"2026-03"`, `week` keys like `"2026-W14"`,
`weekday` is 0–6 with Sunday as 0, and `hour` is 0–23 in local time. `recipient` counts the
To line only, once per recipient.

**Identity.** `useIdentity()` lists the user's accounts and every address they send from,
including aliases that aren't configured in Mailspring (found by scanning Sent mail). The host
uses the same set everywhere: `Contact.isMe`, `MessageSummary.isSent`, `CountRow.isMe` and the
`direction` filter all agree, so Views never need their own "is this me?" heuristics.

### 3.3 Extraction

```ts
type FieldType = 'string' | 'number' | 'money' | 'date' | 'boolean'
  | { type: 'enum'; values: string[]; description?: string }
  | { type: 'string' | 'number' | 'money' | 'date' | 'boolean'; description?: string }
  | { type: 'list'; of: FieldType | Record<string, FieldType> };   // one level only

type Schema = Record<string, FieldType>;  // flat; max 12 fields

function useExtract(opts: { query?: Query; ids?: string[]; schema: Schema; instructions?: string }): {
  results: Record<string, ExtractResult>;     // keyed by message id, grows as it streams
  processed: number; total: number;
  status: 'idle' | 'running' | 'done' | 'quota' | 'error';
  error: ViewError | null;
};
function extract(opts, onProgress?: (p) => void): Promise<Record<string, ExtractResult>>;

type ExtractResult = {
  messageId: string;
  value: Record<string, any> | null;          // null = not found in this message
  confidence: number;                          // 0..1
  tier: 'structured' | 'model';
};
```

- **Normalized output values:**
  - `money` → `{ amount: number, currency: 'USD' }`
  - `date` → ISO string (relative phrases are resolved against the message date)
  - `enum` → exactly one of `values`, or `null`
- **Classification is extraction with an enum field.** For example,
  `{ kind: { type: 'enum', values: ['receipt', 'shipping', 'bill'] } }`. There is no separate
  `classify` call. The model is reliable at receipt/shipping/bill, not at fine distinctions
  such as newsletter vs. alert; prefer sender, `listUnsubscribe` and counts for those.
- **How values are produced:** tier `structured` is schema.org markup embedded in the email
  (exact, free). Tier `model` is one on-device model, Qwen3.5-0.8B, run by the host with a
  host-owned prompt and output constrained to your schema. `instructions` (≤500 characters
  reach the prompt) are appended as extra guidance. Nothing leaves the machine.
- **The host validates model answers before you see them**, because small models fill fields
  with the nearest plausible text. A `string` value must appear in the email; `money` must look
  like a charge (a currency marker or cents, not a rate, range or "K" figure); a `date` must
  name a day or month. A value that fails becomes `null`, so treat `null` as "not stated" and
  never as zero.
- **Speed:** about 0.6–0.9 s per message with GPU acceleration and ~1.8 s on CPU, so run regex
  or structured data first and send only the misses (Example B). If the model isn't installed,
  progress carries `modelAvailable: false` and model-tier values are `null`.
- **Caching and metering:** results are cached per (message, schema, model). Cache hits are
  free. Model-tier work counts against the `smart-extraction` quota. When the quota runs out,
  `status` becomes `'quota'`, `results` keeps everything finished so far, and the host shows the
  upgrade banner over the View. Render partial data. Don't show an error.
- **Limits:** at most 2,000 messages per job. Jobs run in a queue, and visible Views go first.

### 3.3a Summaries and briefings (`ai.summarize`, `ai.generate`)

Generation is two-phase. **Phase 1** summarizes each message on its own into a short record,
cached per message and model, so a message is summarized once and reused by every View and
every later briefing. **Phase 2** builds a briefing from those records plus signals the host
knows exactly. Views pass message ids or a query. They never pass email text, and they can't
change the prompts beyond a short `instructions` string. Requires `mail.bodies`.

```ts
// Phase 1 only: one record per message, streamed as they're produced.
function useSummaries(q: { ids: string[] } | { query: Query }): SummariesState;
function summarize(q, onProgress?): Promise<Record<string, MessageSummaryRecord>>;
type MessageSummaryRecord = {
  messageId: string; threadId: string;
  gist: string | null;          // ≤15 words, facts from the email; null if the model is unavailable
  asks: string | null;          // what the sender wants the reader to do, ≤10 words
  needsAction: boolean;         // the model's guess; weak on its own, see priorities below
};

// Phase 1 + 2. At most 40 messages (maxMessages); pass people before lists.
function useGenerate(opts: GenerateOpts | null): GenerateState;   // null = idle
function generate(opts, onProgress?): Promise<GenerateState>;
type GenerateOpts = ({ ids: string[] } | { query: Query }) & {
  task: 'prioritize' | 'summarize' | 'freeform';
  instructions?: string;        // ≤1000 chars; required for 'freeform'
  schema?: FlatSchema;          // structured answer instead of prose; see below
  maxMessages?: number;         // ≤40
  maxTokens?: number;           // ≤600
};
type GenerateState = {
  status: 'idle' | 'running' | 'done' | 'quota' | 'error';
  phase: 'summaries' | 'briefing' | null;
  processed: number; total: number;
  priorities: Priority[];       // host-chosen, always present once phase 2 runs
  groups: { source: string; count: number; threadIds: string[]; gists: string[] }[];
  headline: string | null;      // template-built: "Needs you: … Also: 6 from LinkedIn, …"
  text: string | null;          // model prose ('summarize' / 'freeform'); null if unavailable or unusable
  value: object | null;         // when `schema` is given
  modelAvailable: boolean;
  error: ViewError | null;
};
type Priority = {
  threadId: string; messageId: string; from: string; title: string;
  kind: 'security' | 'reply' | 'error' | 'direct';
  reason: string;               // e.g. "Waiting on your reply · Asks: … · <gist>"
  urgency: 'high' | 'medium';
};
```

- **Priorities are chosen by the host, not the model.** The bundled model can't reliably pick
  what matters, so the host ranks messages using exact signals: security notices; people the
  user has written to before whose message is the newest in the thread; error reports from
  monitoring senders; direct mail. Mail with List-Unsubscribe never ranks. The model's
  per-message gist and ask only explain each item.
- **`task: 'prioritize'`** returns `priorities`, `groups` and `headline` with no extra model call.
  It's the fastest choice and the one to show by default.
- **`task: 'summarize'`** also asks the model to write prose over the summaries. Treat that prose
  as optional: a 0.8B model sometimes mixes details between emails. Show `headline` first, and
  offer the paragraph as an opt-in (the Daily Briefing starter does this). `text` is null when
  the model's output copied the prompt or wasn't prose.
- **`schema`:** flat, as for `ai.extract`. Any field named `threadId` (top level, or inside a
  list of objects) can only take ids of the messages you passed. Items the model invents are
  dropped before you see them.
- **Speed (Apple M1 Pro):** phase 1 is about 0.65 s per new message with GPU and about 2 s on
  CPU. 40 messages take roughly 25 s on GPU and 80 s on CPU the first time and are nearly
  instant afterwards. Phase-2 prose adds 2–5 s. Phase 1 runs in the same queue as extraction.
- **Metering:** one `smart-extraction` unit per message summarized for the first time. Cached
  summaries, priorities, groups, headline and prose cost nothing extra. Results are cached for
  the day per (messages, task, instructions, schema).
- **Prompt safety:** email text is fenced and the model is told it's untrusted data. Even so,
  render model text as text, never HTML.

### 3.4 Writes

```ts
function setMetadata(target: ThreadSummary | MessageSummary, value: object | null): Promise<void>;
// Stored under this View's private namespace; null deletes. Max 4 KB JSON. Undoable (Cmd+Z).
// The new value appears as `target.meta` in every live hook after the write is applied.

function modify(threads: ThreadSummary[] | string[], change: {
  archive?: true; trash?: true; moveTo?: string /* folder id */;
  addLabels?: string[]; removeLabels?: string[];
  starred?: boolean; unread?: boolean;
}): Promise<void>;   // requires mail.modify; every change is undoable

const ui: {
  showThread(id: string): void;       // page: pushes the thread over the View (Back returns); sidebar: focuses the thread
  search(search: string): void;
  compose(d: { to?: string[]; cc?: string[]; subject?: string; body?: string; accountId?: string }): void;
  reply(messageId: string, opts?: { body?: string; all?: boolean }): void;
  openExternal(url: string): void;
  setBadge(count: number | null): void;
};

function attachmentUrl(id: string): Promise<string>;   // usable in <img src>, <a href download>, <iframe>
```

### 3.5 Components

```tsx
<MessageView messageId={id} />            // the standard message: headers, body, attachments, Reply
<MessageView messageId={id} compact />    // header + snippet, expands on click
```

`<MessageView>` renders the full HTML body as the reading pane does: host-sanitized, images
proxied by the host, the user's remote-image setting applied, and dark-mode colors adjusted. It
shows headers, attachment chips and a Reply button that calls `ui.reply`, and requires
`mail.bodies`. In most cases, prefer `ui.showThread(id)`, which opens the real thread view.

On a page View, `ui.showThread` pushes the standard thread sheet over the View, the same way
the app opens a thread in single-panel mode. The main toolbar shows the thread's actions, and
its Back button returns to the View. The View stays loaded underneath with its state, scroll
position and selection intact, so don't build your own back navigation. The View always gets
the full content width, but users resize windows; lay out with flex/grid and test narrow
widths.

### 3.6 Serialized shapes

All dates are ISO 8601 strings. Every `meta` field is this View's own metadata or `null`.
Views can never see other namespaces.

```ts
interface Contact  { name: string; email: string; isMe: boolean }
interface Category { id: string; accountId: string; name: string; kind: 'folder' | 'label';
                     role: 'inbox'|'sent'|'drafts'|'trash'|'spam'|'archive'|'all'|'important'|'snoozed'|null }
interface Account  { id: string; label: string; email: string; provider: string; categories: Category[] }

interface ThreadSummary {
  id: string; accountId: string; subject: string;
  snippet: string | null;            // newest message's snippet; null until a body has downloaded
  unread: boolean; starred: boolean;
  participants: Contact[];
  categories: Category[];
  attachmentCount: number;
  firstMessageAt: string;
  lastReceivedAt: string | null;     // newest message not sent by me
  lastSentAt: string | null;         // newest message sent by me
  meta: object | null;
}

interface MessageSummary {
  id: string; threadId: string; accountId: string;
  subject: string; snippet: string | null; date: string;   // snippet: null until the body downloads
  from: Contact | null; to: Contact[]; cc: Contact[]; bcc: Contact[];
  isSent: boolean;                   // from one of my addresses (see useIdentity)
  unread: boolean; starred: boolean; draft: boolean;
  categories: Category[];
  attachments: Attachment[];
  listUnsubscribe: string | null;    // CHANGED: raw List-Unsubscribe header (Open decision 5)
  meta: object | null;
}

interface Attachment { id: string; messageId: string; filename: string; contentType: string | null; size: number; isInline: boolean }

interface Event {
  id: string; calendarId: string; accountId: string;
  title: string; start: string; end: string; allDay: boolean;
  location: string | null; description: string | null;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | null;
  organizer: Contact | null;
  attendees: (Contact & { status: 'accepted'|'declined'|'tentative'|'needs-action'|null })[];
  recurring: boolean;                // occurrences are already expanded within the range
}

interface Theme {
  mode: 'light' | 'dark';
  colors: { bg; panel; text; muted; border; accent; danger; success; warning; link; heading };
                                     // resolved CSS colors; also Tailwind ms-* colors
  chart: string[];                   // 8 categorical series colors, legible in this mode
  font: { family: string; size: string };
}

class ViewError extends Error {
  code: 'permission' | 'quota' | 'invalid' | 'not_found' | 'limit' | 'timeout' | 'unavailable' | 'internal';
  feature?: string;                  // for 'quota': which metered feature
  permission?: string;               // for 'permission': what the manifest lacks
}
```

### 3.7 Subscription semantics

| Aspect | Behavior |
|---|---|
| Initial value | `data` starts as `[]` with `loading: true`. The first snapshot arrives as soon as the query runs. |
| Updates | Full snapshots, not diffs, re-sent whenever the underlying rows change. Coalesced to at most one every 250 ms per subscription. |
| During refresh | The previous `data` is kept, so the UI doesn't flicker. `loading` is true only before the first snapshot. |
| Identity | Hooks key subscriptions by `JSON.stringify(query)`, so inline object literals are safe and don't resubscribe on every render. |
| Ordering | Threads by `lastReceivedAt`, messages by `date`, newest first unless `order: 'oldest'`. Counts by `count` descending. |
| Paging | Raise `limit` to load more. A hook with a larger limit replaces its subscription. `hasMore` reports whether the cap truncated results. Use `getX({ offset })` for exports. |
| Limits | 16 live subscriptions per View. Responses are capped at 4 MB. Exceeding either gives `ViewError('limit')`. |
| Hidden Views | While the View is hidden (sheet not visible, sidebar collapsed), the host pauses pushes and sends one fresh snapshot when it becomes visible. |
| Access control | Accounts and folders excluded from this View's grant are absent, not errors. |

### 3.8 Search grammar (for text the user types)

`{ search }` and `ui.search()` take the main search bar's syntax. Use it to pass through
something the user typed, or to open the same mail in the mailbox. Build queries in code with
`where` (§3.1).

| Syntax | Meaning |
|---|---|
| `from:` `to:` `subject:` | address or text match (word prefix, stemmed) |
| `field:(a OR b)` | the field applies to every term in the group |
| `in:inbox` `in:sent` `in:trash` `in:archive` … | folder or label by role, or by name for custom folders |
| `is:unread` `is:read` `is:starred` `is:unstarred` | flags |
| `has:attachment` | attachments |
| `before:` `since:` `after:` | `2026/05/31`, `yesterday`, `"3 months ago"` |
| `AND` (default between terms), `OR`, `NOT`, `( )`, `"exact phrase"` | combining terms |

Search matches threads, so in a message query it returns every message of a matching thread.

### 3.9 Permissions summary

| Permission | Unlocks |
|---|---|
| `mail.read` | `useThreads`/`useMessages`/`useCounts`/`useAccounts`/`useIdentity`/`useSelectedThread` (+ `get*`), `ui.*` |
| `mail.bodies` | `useContent`/`getContent`, `useExtract`/`extract`, `<MessageView>`, `attachmentUrl` |
| `metadata.own` | `setMetadata` (`meta` and `tagged` are readable with `mail.read`) |
| `mail.modify` | `modify` |
| `calendar.read` | `useEvents`/`getEvents` |
| `network` | `fetch` to listed hosts |
| `credentials` (manifest) | `credentialFetch`, `useCredentialStatus`, `ui.requestCredential` for the declared ids (§3.10) |

### 3.10 Credentials

For APIs that need a key the user holds (GitHub, Salesforce, enrichment services). Prefer data
in the user's mail; declare a credential only when an API is genuinely required.

```json
"network": ["api.github.com"],
"credentials": [{
  "id": "github",                       // [a-z0-9_-], ≤ 32 chars
  "label": "GitHub token",              // shown on the host's Connect sheet
  "hosts": ["api.github.com"],          // each must also appear in `network`, written identically
  "header": "Authorization",            // default; Cookie, Host, Origin, Proxy-*, Sec-* … refused
  "format": "Bearer {secret}",          // default; exactly one {secret}
  "help": "Create a fine-grained token with read access to pull requests.",
  "helpUrl": "https://github.com/settings/personal-access-tokens/new"   // https only
}]
```

```ts
function useCredentialStatus(id: string): { connected: boolean; loading: boolean; error: ViewError | null;
                                            connect(): Promise<boolean> }
ui.requestCredential(id: string): Promise<{ connected: boolean }>   // opens the host's Connect sheet
function credentialFetch(id: string, url: string, init?: { method?, headers?, body?: string }):
  Promise<{ ok, status, statusText, url, redirected, redacted: boolean, blockedRedirect: string | null,
            headers: { get(name), has(name), entries() }, text(), json(), arrayBuffer() }>
```

- **The View never holds the key.** The user enters it on a host-rendered sheet; it is stored
  in the system keychain. `credentialFetch` asks the host to send the request from the main
  process with the header attached, and returns the response.
- **Where it can go:** https only, to one of the credential's `hosts`, default port, no
  userinfo. Redirects are followed only within those hosts; a redirect elsewhere is returned
  as-is (`status` 3xx, `blockedRedirect` set) and not followed. Anything else rejects with
  `permission`.
- **Echoes are redacted:** if a response body or header contains the key (raw, URL-encoded,
  JSON-escaped, base64/base64url, including inside Basic auth), those bytes are replaced with
  `*` and `redacted` is true. `Set-Cookie` is dropped.
- **Not connected:** `credentialFetch` rejects with `not_connected` until the user connects the
  key. Render a "Connect" button that calls `connect()` from `useCredentialStatus`.
- **Binding:** a key is stored for the credential's exact `hosts`, `header` and `format`. A
  manifest revision that changes any of them makes the stored key stop applying, and the user
  connects again.
- **Limits:** bodies must be strings (≤ 1 MB; `JSON.stringify` for JSON), responses ≤ 5 MB,
  30 s timeout, 60 requests a minute per View (bursts of 20). Non-text responses come back
  base64 and are decoded by `text()`/`arrayBuffer()`.
- **The View's own `fetch`** to the same host never carries the key, and usually fails CORS.
- **Errors** carry codes `permission`, `not_connected`, `invalid`, `limit`, `timeout`, or
  `unavailable` (network failure).

## 4. Coverage walk

The five archetypes from the plan:

| Archetype | Primitives |
|---|---|
| Extract and chart | `useMessages({ where })` → (`getContent` + own parser) → `useExtract` for misses → recharts |
| Deadline timeline | `useMessages` + `useExtract({ due: 'date' })`, optionally `useEvents` |
| Pipeline board | `useThreads({ tagged: true })` + `setMetadata` + `ui.showThread` |
| Entity-centric grouping | `useExtract({ caseNo: 'string' })` or a regex over subjects, grouped in JS; `useCounts` for totals |
| Beside the open thread | `useSelectedThread` + `useThreads`/`useCounts` with `{ participant }`, + `fetch` |

The catalog. ✓ means fully expressible, ◐ means expressible with a stated compromise, and ✗
means not expressible.

| View | | How |
|---|---|---|
| Ride/delivery spend | ✓ | messages + parser/extract `{total: money, city}` + chart (Example B) |
| Subscription tracker | ✓ | extract `{merchant, amount: money, period: enum, renews: date}`, group by merchant |
| Bills due | ✓ | extract `{biller, amount: money, due: date, autopay: boolean}` |
| Trip timeline | ✓ | `getContent({structured})` (FlightReservation, …) + extract fallback + `useEvents` |
| Return windows | ✓ | structured `Order` / extract `{orderDate, returnBy: date}` |
| Receipt/warranty locker | ◐ | extract over bodies; **PDF text isn't extracted**, only `attachmentUrl` for viewing (Open decision 4) |
| Tax collector | ◐ | `{ hasAttachment: true }` + filename/subject heuristics; same PDF limitation |
| Medical/insurance | ✓ | extract `{provider, amount: money, kind: enum}` |
| School and kids | ✓ | extract `{event, date, actionRequired: boolean}` |
| Ticket wallet | ✓ | structured `EventReservation` + extract |
| Account inventory | ✓ | `useCounts({ where: { or: [{ subject: 'welcome' }, { subject: 'verify your email' }, { subject: 'new sign-in' }] } }, 'sender')` + extract `{service}` |
| Waiting on | ✓ | `useThreads({ where: { direction: 'sent' } })` filtered on `lastSentAt > lastReceivedAt` |
| Who I owe replies | ✓ | threads where `lastReceivedAt > lastSentAt`; reply latency from `useMessages({threadId})` |
| Volume heatmap | ✓ | `useCounts(q, ['weekday','hour'])` |
| Newsletter reader | ✓ | `useMessages({ where: { listUnsubscribe: true } })` + `<MessageView>`; "never opened" via `useCounts` with `{ unread: true }` vs. without |
| Coupon wallet | ✓ | extract `{code, discount, expires: date}` |
| Attachment gallery | ✓ | `useMessages({ where: { hasAttachment: true } })` → `attachments` + `attachmentUrl` |
| Lost touch | ✓ | `useCounts({ where: { direction: 'sent' } }, 'recipient')` → `last` older than 6 months and `count` high |
| Intro graph | ✓ | `{ or: [{ subject: 'intro' }, { text: 'meet' }] }` + extract `{introducer, introduced}` |
| Commitments | ✓ | `{ direction: 'sent' }` + extract `{promise, due: date}` (model tier, quality TBD) |
| Job seeker funnel | ✓ | extract `{company, stage: enum}` + `setMetadata` overrides |
| Recruiter pipeline | ✓ | pipeline board |
| CRM / deals going cold | ✓ | pipeline board + `lastSentAt`/`lastReceivedAt` |
| Investor deal flow | ✓ | pipeline board + attachments |
| Portfolio metrics | ◐ | extract `{company, mrr: money, burn: money}` from bodies; metrics inside PDF/deck attachments ✗ |
| Lawyer matters | ✓ | regex/extract `{matter}` + group; deadlines via extract |
| Billable reconstruction | ✓ | `useMessages({ where: { direction: 'sent' } })` grouped by matter and day |
| Freelancer invoices | ✓ | extract `{client, amount: money, status: enum}` |
| Academic submissions | ✓ | extract `{paper, venue, status: enum}` |
| OSS maintainer | ◐ | from/subject/body footer ("you were mentioned"); `X-GitHub-Reason` header isn't available (Open decision 5); GitHub API via `fetch` |
| On-call alerts | ✓ | `useCounts(q, ['day','sender'])` + extract `{service, severity: enum}` |
| E-commerce sales | ✓ | extract `{orderNo, total: money}`; sidebar via `useSelectedThread` |
| Real estate / landlord | ✓ | pipeline board + extract `{property, unit}` |
| Event/wedding planner | ✓ | extract `{vendor, quote: money}` + board |
| Journalist embargoes | ✓ | extract `{embargo: date}` |
| Executive assistant | ✓ | `useEvents` + waiting-on |
| People by folder | ✓ | `useCounts(q, ['sender','category'])`, with `labels` for names and `isMe` to drop the user |
| Kanban | ✓ | Example A |
| Stripe customer sidebar | ✓ | `useSelectedThread` + `fetch('https://api.stripe.com/...')` |
| Contact context sidebar | ✓ | Example C |

### Deliberately impossible

| Not available | Why |
|---|---|
| Send, forward, or save drafts silently | These are exfiltration channels. `ui.compose`/`ui.reply` hand off to the user. |
| Delete permanently, empty trash | Irreversible. `modify({ trash })` is undoable. |
| Other plugins' metadata (send-later, open/link tracking) | Namespace isolation, and the risk of forging tracking data. Read-only tracking access is Open decision 6. |
| Raw SQL, Matchers, arbitrary tables | The host owns query construction (plan §5.2). |
| Address book contacts (phone, company) | Not needed by any catalog View except CRM-style ones, which use `fetch` against the user's CRM. |
| Raw MIME and headers | See Open decision 5. |
| Files on disk, clipboard read, notifications, background execution | Process sandbox. Background execution is deferred (plan §10.6). |
| Creating or editing calendar events | Out of scope for v1. |
| Reading other Views' data | Each View has its own partition and namespace. |

## 5. Authoring guide for agents

*This section is the exact text for the authoring agent's system prompt.*

> You are building a **Mailspring View**: a single React file `View.jsx` whose default export
> renders inside the Mailspring email client. It works like a Claude artifact, with these
> differences:
>
> - **Imports:** only `react`, `recharts`, `lucide-react`, and `@mailspring/view`. No other
>   packages, CDNs, or `require`.
> - **Style:** use Tailwind. Use the theme colors `bg-ms-bg`, `bg-ms-panel`, `text-ms-text`,
>   `text-ms-muted`, `border-ms-border`, `text-ms-accent`, `bg-ms-accent`, `text-ms-danger`,
>   `text-ms-success`, `text-ms-warning`, never hard-coded grays, so the View works in light and
>   dark themes. For chart colors use `useTheme().chart[i]`. Recharts tooltips default to a
>   white box: pass `contentStyle={{ background: theme.colors.panel, borderColor:
>   theme.colors.border, color: theme.colors.text }}`.
> - **Width:** page Views get narrower when the user opens a thread beside them. Use flexible
>   layouts.
> - **Data is live:** `useThreads(query)`, `useMessages(query)`, and `useCounts(query, groupBy)`
>   re-render automatically when mail changes. Every hook returns `{ data, loading, error }`, and
>   `data` is never undefined. Pass `null` for "no query yet".
> - **Queries are JSON.** Put filters under `where`, one key per object, combined with
>   `and`/`or`/`not`:
>   `useMessages({ where: { and: [{ from: ['uber.com', 'lyft.com'] }, { direction: 'received' }] }, limit: 500 })`.
>   Addresses can be exact (`a@b.com`) or a domain (`uber.com`). `subject` is a substring,
>   `text` is word search, `in` takes a role like `'inbox'` or a folder name. Keep date values
>   at day precision so the query doesn't change on every render. Only use the `search` string
>   syntax to pass along text the user typed.
> - **Counting:** use `useCounts` for anything that counts or groups messages, such as top
>   senders, volume over time, or per-folder breakdowns. Do not fetch thousands of messages to
>   count them in JS. Person rows carry a display name in `labels` and `isMe` flags.
> - **The user:** `isMe` on contacts, `isSent` on messages, `{ direction: 'sent' }` and
>   `useIdentity()` all know every address the user sends from, including aliases. Don't guess
>   from `useAccounts()`.
> - **Reading message text:** `getContent(ids)` / `useContent(ids)` return plain text, with
>   `reason` set when it's null (body not downloaded yet, or no such message). For
>   regular senders (receipts, alerts), parse the text with a regex first. Use
>   `useExtract({ ids, schema })` only for messages your parser missed. It runs an on-device
>   model, is metered, and may stop early with `status: 'quota'`. When that happens, render the
>   partial results and don't show an error.
> - **Schemas:** flat, at most 12 fields. Types are `'string' | 'number' | 'money' | 'date' |
>   'boolean'`, `{ type: 'enum', values }`, or `{ type: 'list', of }`. `money` comes back as
>   `{ amount, currency }` and `date` as an ISO string.
> - **Saving state:**
>   - Per-thread state (board columns, notes, statuses): `setMetadata(thread, { ... })`. It
>     appears as `thread.meta` in every hook. `useThreads({ tagged: true })` returns exactly the
>     threads your View has tagged.
>   - View settings: `useViewState(key, initial)`.
> - **Opening mail:** `ui.showThread(thread.id)` opens the thread over your View, with the app's
>   own toolbar and a Back button that returns to your View unchanged. Don't build your own
>   reading pane or back navigation, and don't render message bodies yourself unless the design
>   needs inline mail. In that case, use `<MessageView messageId={id} />`, which renders the full
>   message like the app does.
> - **Never set `innerHTML` or use `dangerouslySetInnerHTML` with email content.** Subjects and
>   bodies are written by strangers. Render text with JSX.
> - **Sidebar Views:** (`placement: "thread-sidebar"`) call `useSelectedThread()` to get the
>   open thread. Pick `"sidebar": { "mode": "card" }` (default; compact, height is automatic)
>   or `"panel"` (fills the sidebar behind the switcher). **Draw no card, border or background
>   of your own**: the host draws the chrome.
> - **Network:** `fetch` only reaches hosts listed in `manifest.network`.
> - **API keys:** prefer what the user's email already says. When an API truly needs the user's
>   key, declare a credential in the manifest, call it with `credentialFetch(id, url, init)`,
>   and render a "Connect" state from `useCredentialStatus(id)` until it is connected (§3.10).
>   Never ask the user to paste a key into your View.
> - **Permissions:** declare only what you use in `manifest.permissions`: `mail.read`,
>   `mail.bodies`, `metadata.own`, `mail.modify`, `calendar.read`.
> - **States:** handle empty and loading states. Dates are ISO strings, so wrap them with
>   `new Date()`.

## 6. Examples

### A. Kanban (page; `mail.read`, `metadata.own`)

```jsx
import { useState } from 'react';
import { Inbox, GripVertical } from 'lucide-react';
import { useThreads, setMetadata, ui } from '@mailspring/view';

const COLUMNS = ['Inbox', 'To do', 'Waiting', 'Done'];

export default function View() {
  const board = useThreads({ tagged: true, limit: 500 });
  const inbox = useThreads({ where: { in: 'inbox' }, limit: 40 });
  const [dragId, setDragId] = useState(null);

  const all = [...board.data, ...inbox.data.filter((t) => !t.meta)];
  const columnOf = (t) => t.meta?.column ?? 'Inbox';

  const drop = (column) => {
    const thread = all.find((t) => t.id === dragId);
    if (thread && columnOf(thread) !== column) {
      setMetadata(thread, column === 'Inbox' ? null : { column, movedAt: new Date().toISOString() });
    }
    setDragId(null);
  };

  return (
    <div className="flex h-screen gap-3 p-4 bg-ms-bg text-ms-text">
      {COLUMNS.map((column) => {
        const items = all.filter((t) => columnOf(t) === column);
        return (
          <div key={column} className="flex flex-col flex-1 min-w-0 rounded-lg bg-ms-panel border border-ms-border"
               onDragOver={(e) => e.preventDefault()} onDrop={() => drop(column)}>
            <div className="px-3 py-2 text-sm font-semibold flex justify-between">
              {column}<span className="text-ms-muted">{items.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
              {items.map((t) => (
                <div key={t.id} draggable onDragStart={() => setDragId(t.id)}
                     onClick={() => ui.showThread(t.id)}
                     className="group cursor-pointer rounded-md border border-ms-border bg-ms-bg p-2 hover:border-ms-accent">
                  <div className="flex items-start gap-1">
                    <GripVertical size={14} className="mt-0.5 text-ms-muted opacity-0 group-hover:opacity-100" />
                    <div className="min-w-0">
                      <div className={`truncate text-sm ${t.unread ? 'font-semibold' : ''}`}>{t.subject || '(no subject)'}</div>
                      <div className="truncate text-xs text-ms-muted">
                        {t.participants.filter((p) => !p.isMe).map((p) => p.name || p.email).join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && column !== 'Inbox' && (
                <div className="flex flex-col items-center py-8 text-xs text-ms-muted">
                  <Inbox size={18} className="mb-1" />Drag threads here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### B. Rides spend chart (page; `mail.read`, `mail.bodies`)

```jsx
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useMessages, useContent, useExtract, useTheme, ui } from '@mailspring/view';

const SINCE = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const RIDES = {
  and: [
    { from: ['uber.com', 'lyft.com'] },
    { or: [{ subject: 'trip' }, { subject: 'ride' }, { subject: 'receipt' }] },
    { direction: 'received' },
    { date: { after: SINCE } },
  ],
};

// Tier 1: deterministic parser for the common receipt layouts.
function parseTotal(text) {
  const m = text.match(/\bTotal\b[^$\d]{0,20}\$\s?(\d{1,4}(?:[.,]\d{2}))/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

export default function View() {
  const theme = useTheme();
  const messages = useMessages({ where: RIDES, limit: 1000 });
  const ids = messages.data.map((m) => m.id);
  const content = useContent(ids);

  const parsed = useMemo(() => {
    const out = {};
    for (const id of ids) {
      const text = content.data[id]?.text;
      if (text) out[id] = parseTotal(text);
    }
    return out;
  }, [content.data]);

  const missed = ids.filter((id) => content.data[id] && parsed[id] == null);
  const ai = useExtract({ ids: missed, schema: { total: 'money' } });

  const rows = useMemo(() => {
    const byMonth = {};
    for (const m of messages.data) {
      const total = parsed[m.id] ?? ai.results[m.id]?.value?.total?.amount;
      if (total == null) continue;
      const month = m.date.slice(0, 7);
      const provider = /lyft/i.test(m.from?.email ?? '') ? 'Lyft' : 'Uber';
      byMonth[month] ??= { month, Uber: 0, Lyft: 0, rides: [] };
      byMonth[month][provider] += total;
    }
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }, [messages.data, parsed, ai.results]);

  const sum = rows.reduce((s, r) => s + r.Uber + r.Lyft, 0);

  if (messages.loading) return <div className="p-6 text-ms-muted bg-ms-bg h-screen">Loading rides…</div>;

  return (
    <div className="h-screen p-6 bg-ms-bg text-ms-text flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Rides, last 12 months</h1>
        <div className="text-2xl font-semibold">${sum.toFixed(2)}</div>
      </div>
      {ai.status === 'running' && (
        <div className="text-xs text-ms-muted">Reading receipts… {ai.processed}/{ai.total}</div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <XAxis dataKey="month" stroke={theme.colors.muted} />
            <YAxis stroke={theme.colors.muted} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              formatter={(v) => `$${v.toFixed(2)}`}
              contentStyle={{ background: theme.colors.panel, borderColor: theme.colors.border, color: theme.colors.text }}
            />
            <Legend />
            <Bar dataKey="Uber" stackId="a" fill={theme.chart[0]} />
            <Bar dataKey="Lyft" stackId="a" fill={theme.chart[1]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <button className="self-start text-sm text-ms-accent"
              onClick={() => ui.search('from:uber.com OR from:lyft.com since:"12 months ago"')}>
        Show these {messages.data.length} receipts in the inbox
      </button>
    </div>
  );
}
```

### C. Contact context (thread-sidebar; `mail.read`)

```jsx
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Mail, Folder } from 'lucide-react';
import { useSelectedThread, useCounts, useThreads, useTheme, ui } from '@mailspring/view';

const YEAR_AGO = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);

export default function View() {
  const selected = useSelectedThread();
  const person = selected?.thread.participants.find((p) => !p.isMe);
  const withThem = person ? { participant: person.email } : null;
  const theme = useTheme();

  const monthly = useCounts(
    withThem && { where: { and: [withThem, { date: { after: YEAR_AGO } }] } },
    'month'
  );
  const folders = useCounts(withThem && { where: withThem }, 'category');
  const recent = useThreads(withThem && { where: withThem, limit: 6 });

  if (!person) return null;

  const total = folders.data.reduce((s, r) => s + r.count, 0);
  const series = [...monthly.data].sort((a, b) => String(a.key.month).localeCompare(String(b.key.month)));
  const first = folders.data.reduce((d, r) => (!d || r.first < d ? r.first : d), null);

  return (
    <div className="p-3 text-sm text-ms-text space-y-3">
      <div>
        <div className="font-semibold truncate">{person.name || person.email}</div>
        <div className="text-xs text-ms-muted">
          {total} messages{first ? ` since ${new Date(first).toLocaleDateString()}` : ''}
        </div>
      </div>
      <div className="h-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <Line dataKey="count" stroke={theme.chart[0]} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1">
        {folders.data.slice(0, 4).map((r) => (
          <div key={r.key.category} className="flex items-center gap-2 text-xs">
            <Folder size={12} className="text-ms-muted" />
            <span className="flex-1 truncate">{r.labels.category}</span>
            <span className="text-ms-muted">{r.count}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {recent.data.filter((t) => t.id !== selected.thread.id).slice(0, 5).map((t) => (
          <button key={t.id} onClick={() => ui.showThread(t.id)}
                  className="flex w-full items-center gap-2 text-left text-xs hover:text-ms-accent">
            <Mail size={12} className="shrink-0 text-ms-muted" />
            <span className="truncate">{t.subject}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

`useCounts(…, 'category')` keys rows by category id; `labels.category` carries the name.

## 7. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | React vs. Preact in the View runtime | **React 18.** Agents write React artifacts fluently. Size doesn't matter for local files, and Preact's compat quirks would cost coaching. |
| 2 | Group keys for `category`/`account`/`sender`: ids only, or labels too | **Implemented:** keys stay ids or addresses; `labels` carries names for category, account, sender and recipient, and `isMe` flags person keys. |
| 3 | Tailwind delivery | **Vendor the Tailwind v4 browser build** with an `@theme` block that maps `ms-*` colors to host CSS variables. It gives full JIT with no build step. |
| 4 | PDF/attachment text | **Add `getContent(ids, { attachments: true })` returning extracted PDF text** once a local PDF text extractor exists. Many finance and tax Views need it, and extraction should also accept attachment ids. Not in v1. |
| 5 | Headers (`List-Id`, `List-Unsubscribe`, `X-GitHub-Reason`) | **Owner decision (2026-10-02):** add `List-Id` to the sync engine's extra-header allowlist (keep the allowlist; storing every header costs too much). GitHub-style needs are met by parsing bodies. |
| 5 | Header storage today | **Answered (2026-10-02):** the sync engine persists only `List-Unsubscribe` and `List-Unsubscribe-Post` (Message JSON `hListUnsub`/`hListUnsubPost`, exposed on the model as `listUnsubscribe`/`listUnsubscribePost`) and `Importance` (`hImportance`, not on the model). `List-Id` and `X-GitHub-Reason` are not stored anywhere, and `extraHeaders` is empty on all 27,471 synced messages in the dev DB (it's only used for outgoing drafts). **Changed:** `MessageSummary.listUnsubscribe` is now exposed. A general header allowlist needs a Mailspring-Sync change to persist the headers first. |
| 6 | Read-only tracking metadata (opens and clicks) | **Defer.** Add a `tracking.read` permission later. The Activity panel already covers it. |
| 7 | `mail.modify` in v1 | **Include it**, opt-in per manifest. Triage boards are among the most compelling Views, and every change is undoable. |
| 8 | Message vs. thread metadata | **Support both.** Boards use threads and extraction-backed Views use messages. Examples should steer toward threads. |
| 9 | `useContent` caching across reloads | **Keep the cache on the host** (bodies are immutable), with no persistence in the View. Re-opening a View should be instant without a View-side cache. |
| 10 | Live `useContent` | **Not live.** Bodies never change, and drafts are excluded. |
| 11 | Expose `ai.extract` over arbitrary text (for example, fetched API data) | **No.** It keeps the extractor from becoming a general local LLM, and it keeps metering tied to messages. |
| 12 | Hook-call rules when `q` is null (Example C passes `{ ids: [] }`) | **Accept `null` as "no query":** return empty `data`, `loading: false`. This matches common React data-hook conventions and reads better. |

## 8. Prototype implementation status (2026-10-02)

The bridge lives in `app/internal_packages/views/lib/view-bridge.ts` and `lib/bridge/*`. It
shares its grant predicates, query builders, and audit log with MCP through
`app/internal_packages/mcp-server/lib/capabilities/`. Spec changes forced by the
implementation are marked **CHANGED**.

| Area | Status |
|---|---|
| `threads/messages/counts/events/accounts` find + subscribe | Implemented. |
| **CHANGED:** transport ids | `subscribe` takes `{ subId, kind, params }` and `ai.extract` takes `{ jobId, … }`, with ids **chosen by the View runtime**. Listeners are registered before the host can emit, so the first snapshot can't race the reply. `unsubscribe`/`ai.cancel` are as specified. |
| **CHANGED:** queries are JSON (wave 4) | `where` filters (§3.1) compile directly to SQL in `mcp-server/lib/capabilities/filter.ts`: message fields via `json_each` over `Message.data`, thread fields via `ThreadCategory`/`ThreadSearch`, each wrapped as "has a message"/"thread matches" across targets, with OR'd message terms sharing one subquery. Validated with explicit limits; unknown keys and folder names are errors. The search grammar is still accepted (`search`), and in message queries it still matches at the thread level. |
| Search grammar fixes (wave 4) | `subject:(a OR b)` used to parse as a subject match on `(` and silently return nothing; a field followed by a group now applies to every term (`search-query-parser.ts`, with specs). The "80-term OR hangs" report did not reproduce as slow SQL (an 80-term FTS query takes ~40 ms); View queries now run in DatabaseStore's background agent and one-shot reads time out after 15 s with `ViewError('timeout')`, so a slow query can neither freeze the UI nor hang a View. |
| Identity (wave 4) | `identity.get` / `useIdentity()`. Addresses = configured accounts and aliases plus every From address in Sent folders (or Gmail `\Sent`), rescanned every 10 minutes. `Contact.isMe`, `isSent`, `CountRow.isMe` and `direction` all use it. |
| MCP parity (wave 4) | `search_mail` takes the same JSON `filter`; new `count_mail` (the `useCounts` dimensions) and `get_identity` tools. Same grant, serializers and audit log. |
| **CHANGED:** `CountRow.labels` / `isMe` | Rows carry `labels` with names for `category`, `account`, `sender` and `recipient` (the most common display name in the group), and `isMe` for person keys. `week` keys use SQLite `%W` (Monday-based week of year), not strict ISO weeks. |
| Counts and folder exclusion | Account scope is applied in SQL; per-folder exclusion is not (Views currently get a full-account grant). |
| `setMetadata(target, null)` | Stored as `{}` because metadata rows can't be deleted. Empty values read back as `meta: null`, and `tagged` queries skip them. Undo restores the previous value. |
| `useExtract` / `extract` (wave 4) | Tier 0 (schema.org JSON-LD + microdata, with field-name synonyms such as `carrier`→`provider`), then Qwen3.5-0.8B in a utility process (`app/src/browser/extraction-service.ts`, node-llama-cpp, JSON-schema-constrained), batches of 4, then host-side validation (`views/lib/extraction/normalize.ts`). Results cached in `<configDir>/extraction-cache.db` by (message, schema + instructions, model). Jobs are cancelled when a View reloads, and hidden Views' prompts queue behind visible ones. Quota is a local monthly `smart-extraction` meter for now; `core.views.extractQuotaForTesting = N` forces it. |
| `useContent` / `getContent` | Implemented, including host-side HTML→text with one line per block (table rows stay on one line) and quoted-text stripping. Missing bodies are fetched and waited for up to 10 s per batch; each id comes back with `reason` when text is null, `body_unavailable` results are retried on the next request rather than cached, and `useContent` reports `loaded`/`total`. |
| Thread snippets | Threads have no stored snippet. `threads.find` and live `useThreads` subscriptions fill it from the newest message that has one; threads whose bodies haven't been fetched keep `snippet: null`. |
| `ui.reply` `body` option | Ignored for now; the reply opens empty in a popout composer. |
| `ui.search` | Submits the query to the main search bar. |
| `messages.renderable` | Implemented: `{ ids (≤10), includeQuoted? }` → `{ [id]: { html, plaintext } }`. The body goes through `MessageBodyProcessor` (sanitizer, MessageViewExtensions, the user's remote-image policy), quoted text is collapsed, and it is wrapped in the theme's `email-frame.less` styles. Every image (`cid:`, http(s), CSS `url()`) is rewritten to `mailspring-view://<id>/_res/<token>`; tokens are minted in the main process at the host window's request, so a View can't send the image proxy anywhere an email didn't. Remote images are fetched from a cookie-less session, image types only, no loopback/private hosts. |
| **CHANGED:** `attachmentUrl(idOrAttachment)` | Implemented as `attachments.url { fileId }` → `{ url }`. Images are served with their type; every other type is `application/octet-stream`, so the URL works for `<img>` but not for rendering PDFs or HTML. Rejects with `unavailable` if the sync engine hasn't downloaded the file. |
| `<MessageView>` | Header (avatar, from, to, date, Reply), the renderable body in an `<iframe sandbox="allow-same-origin" srcdoc>` (no scripts; same-origin only so the View can size it and route clicks: `http(s)` → `ui.openExternal`, `mailto:` → `ui.compose`), and attachment chips. `compact` shows the snippet until clicked. The transparent-vs-white-page decision runs the reading pane's own `email-color-detection` module, served to Views as `_runtime/email-colors.js`, so dark themes match EmailFrame. |
| **CHANGED:** query options | `useThreads(search, { limit })`, `useMessages(search, opts)`, `getThreads(search, opts)` and `getMessages(search, opts)` merge the second argument into the query object. Agents write this form unprompted. |
| Badges | `ui.setBadge(n)` shows `n` on the View's sidebar entry. The last count is remembered across launches, because a page View only runs while open. |
| Error cards | View.jsx is compiled by Sucrase, which preserves line numbers, so stack frames in the error card read `View.jsx:LINE:COL`. A syntax error shows Sucrase's message with its position. The card shows the **first** error of the page (often the cause of a later render crash) and counts the rest, which are in the View's diagnostics. |
| Page nonce (wave 4) | The preload announces a random nonce per document (`mailspring-view:hello`) and stamps every call with it. The host ignores calls from any other page and stamps replies, so a reload can't deliver an old page's reply to the new page. Only the top-level document gets `window.mailspring`; frames inside a View (message bodies) don't. |
| Sidebar modes (wave 4) | §1.1. Implemented in `views/lib/sidebar-view.tsx` and the generic switcher in `message-list/lib/sidebar-panels.tsx`. |
| Hooks with `null` | Open decision 12 implemented: `useThreads(null)` etc. return empty data with `loading: false`. |
| Errors | Spec codes throughout; an unknown method is `invalid`. |
| Hidden Views | Emitting `visibility: { visible: false }` from the host pauses pushes; each subscription's latest snapshot is sent on resume. |
| Audit | Every call except `unsubscribe`, `theme.get`, and `ui.setHeight` is logged under `view:<id>` in the shared audit log. |
