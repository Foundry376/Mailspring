# Sandboxed Views: agent-generated perspectives on your mail

Exploration of a second extension system that sits next to the plugin architecture: small
user- or agent-authored web views ("Views") that render live projections of the mailbox
inside an isolated process, with no Node.js and no network unless granted, and with access to
nothing except a narrow capability bridge implemented by the host.

Status: design exploration, 2026-10-02. Nothing implemented. Electron 44.5.1. Gated to Pro.

---

## 1. Goals and non-goals

**Goals**

- A user (or a cloud Claude agent acting for a Pro user) can produce a View from a prompt, and
  it runs immediately and safely, without a review or marketplace step.
- Views get the two primitives that make Mailspring powerful: **live queries** over
  threads/messages/contacts, and **per-model metadata** that syncs.
- Views get a third primitive that makes the first two useful on real mail: **on-device
  structured extraction** (§9). It turns message text into typed fields that Views chart,
  group, and store as metadata.
- A malicious or buggy View cannot read files, spawn processes, reach undeclared hosts, read
  other Views' data, or take irreversible actions without a host-rendered confirmation.

**Non-goals**

- Replacing internal packages. Plugins remain the way to build integrated features: composer
  extensions, message decorators, toolbar buttons, and so on. Views are a separate tier.
- Removing `nodeIntegration` from the main window. This design should move in that direction
  (§11), but it does not depend on it.

Target Views used to validate the API (the full idea catalog is in Appendix A):

| View | Placement | Needs |
|---|---|---|
| Arriving packages | page | search subscription, bodies, extraction |
| Kanban over threads | page | subscribe to "threads with my metadata", write metadata, reading pane |
| People I talk to, by folder/label | page | contacts + per-message participants and categories, aggregation |
| Uber/Lyft rides and spend | page | search subscription, extraction, charting library |
| Customer in Stripe | thread sidebar | focused-thread context, declared network egress to `api.stripe.com` |

## 2. How other systems sandbox extensions

| System | Extension code runs in | Node/FS access | What actually protects users |
|---|---|---|---|
| **VS Code extensions** | Extension Host, a separate Node process | **Full**. Extensions are not sandboxed | Marketplace malware scanning, publisher verification, and after-the-fact takedowns. Workspace Trust protects you from malicious *folders*, not from malicious extensions. |
| **VS Code webviews** | Sandboxed iframe on a per-webview origin (`vscode-webview://<uuid>`), strict CSP, `localResourceRoots` | None | Isolation. The webview reaches its extension only through `acquireVsCodeApi().postMessage`. |
| **VS Code workbench** | Renderer migrated to `sandbox: true` + `contextIsolation` (2022); Node work moved into utility and shared processes behind a preload | None in the renderer | This was a multi-year migration, and it is the precedent for §11. |
| **Figma plugins** | Plugin logic runs in a QuickJS/Wasm realm on the main thread; plugin UI runs in a null-origin iframe | None | Isolation. Network access is declared in the manifest (`networkAccess.allowedDomains`) and shown to users. |
| **Shopify UI extensions** | Web Worker running Remote DOM; the host renders only components from its own catalog | None | Isolation plus a fixed component vocabulary. |
| **Gmail add-ons / Slack Block Kit** | Server-side; the client renders declarative cards | n/a | No client code at all. Very safe and very limited. |
| **Obsidian, Raycast** | Main process or renderer with Node | Full | Community review. Raycast requires extension source to be published. |
| **Claude artifacts** | Sandboxed iframe on a separate origin, strict CSP, no egress | None | Isolation, plus a `window.claude` bridge that grants capabilities declared up front. |

The model that fits here is **VS Code webviews / Claude artifacts**: an isolated origin, a
postMessage-style RPC to a trusted host, and egress denied by default. Network access follows
**Figma**: declared per domain and shown at consent. VS Code extensions themselves are the
counterexample. Their ecosystem is safe only to the degree that Microsoft polices the
marketplace, which is exactly what we want to avoid needing.

## 3. Threat model

Users are the authors here: they or an agent write the code, and they install it. That
changes the threat model, but it does not shrink it:

1. **The View code itself is untrusted.** It came from an LLM, a forum post, or a friend.
2. **The data the View renders is attacker-controlled.** Every email subject, sender name, and
   body was written by a stranger. A View that does `el.innerHTML = thread.subject` gives the
   sender script execution *inside the View*, with all of the View's capabilities.
3. **The authoring agent can be prompt-injected.** If the cloud agent sees real mail while it
   builds a View, a crafted email can steer it into writing hostile code.

This is Simon Willison's "lethal trifecta": private data, untrusted content, and an
exfiltration channel. The first two are the product. So the design controls the third:

- **Egress is denied by default and granted per domain** (§4.3, §5.3). A View that can read
  bodies *and* reach a host can send your mail to that host. The consent sheet says so in
  those words, and a View that widens its domain list re-prompts.
- No capability moves data off the machine without a host-rendered confirmation. Sending,
  forwarding, and sharing are exfiltration channels, so Views cannot send. They open a
  prefilled composer, and the user presses Send.
- **Extraction never leaves the device** (§9). The AI primitive is not a hidden egress path.
- Write capabilities go through the existing Task + undo machinery and are scoped (§5.3).
- Script injection from email content into the View is blocked by hash-based CSP (§4.4).

## 4. Isolation container

### 4.1 Process: `<webview>` with a dedicated session, not an iframe

| Option | Verdict |
|---|---|
| Sandboxed `<iframe>` in the main window | **No.** It shares a renderer process with a `nodeIntegration: true` page. A single V8 or Blink bug turns into full Node access. The `sandbox` attribute is an origin boundary, not a process boundary, and whether OOPIF isolation applies to sandboxed frames depends on Chromium feature flags we don't control. |
| `<webview>` guest | **Yes.** It runs in a separate renderer process with `sandbox: true` (OS-level sandbox), its own session/partition, and DOM-positioned layout. We already use it, and `mailspring-window.ts:165` already forces guests to be low-privilege. |
| `WebContentsView` overlaid by the main process | Same isolation, but positioning it over a React layout (resizes, sheet changes, modals drawn over it) is fiddly. Keep it as the fallback if Electron ever removes the webview tag. Electron labels `<webview>` "not recommended" but has not deprecated it. |

Each View gets its own partition, `persist:view-<viewId>`. Cookies, localStorage, and
IndexedDB are isolated per View, and the session-level controls in §4.3 apply to exactly
these sessions and nothing else.

### 4.2 Loading and origin

- Register a privileged scheme `mailspring-view` in `main.js` next to `mailspring`, with
  `standard: true, secure: true` so that storage APIs work.
- Call `ses.protocol.handle('mailspring-view', …)` only on View sessions. The origin is
  `mailspring-view://<viewId>/`, so each View is its own origin as well as its own session.
- The handler serves the View bundle (§7) and a fixed catalog of vetted libraries at
  `mailspring-view://<viewId>/_lib/…`, such as Chart.js, d3, a date library, and the View UI
  kit (§6.3). Agents write against the catalog instead of a CDN.

### 4.3 Egress (enforced per session, not by CSP alone)

On each View session:

- `webRequest.onBeforeRequest`: allow `mailspring-view:`, `data:`, `blob:`, and `https:` to
  exactly the hosts in the View's granted `network` list; cancel everything else. This catches
  `img`, CSS `url()`, `fetch`, `WebSocket`, `EventSource`, beacons, prefetch, and form posts,
  independent of the page's CSP.
- `setPermissionRequestHandler` / `setPermissionCheckHandler`: deny everything (media,
  notifications, clipboard-read, geolocation, HID, serial, and so on).
- On the guest `webContents`: `setWindowOpenHandler(() => ({ action: 'deny' }))`, and call
  `preventDefault` on `will-navigate` / `will-redirect` for anything off-origin. Links go
  through the bridge (`ui.openExternal`), which shows host confirmation.
- WebRTC: `setWebRTCIPHandlingPolicy('disable_non_proxied_udp')`. For Views with no network
  grant, also set a dead proxy on the session (`setProxy({ proxyRules: 'http://0.0.0.0:0' })`).
  This also catches anything that slips past `webRequest`. STUN is the classic side channel
  here, so the spike must verify it is blocked.
- Disable DNS prefetch for the session.

Credentials for granted hosts, such as a Stripe API key, are entered in a host-rendered
settings sheet. They live in the OS keychain and are attached by the host in
`onBeforeSendHeaders`, so the View never holds the secret.

The spike (§12, M0) should include an adversarial test page that tries each channel above and
asserts that nothing leaves the machine, checked with a local listener.

### 4.4 CSP: protect the View from the mail it displays

The protocol handler serves the View's HTML, so it can compute SHA-256 hashes of the View's own
`<script>` blocks and send:

```
default-src 'none';
script-src 'sha256-…' 'sha256-…' mailspring-view:;
style-src 'unsafe-inline' mailspring-view:;
img-src data: blob: mailspring-view:;
font-src mailspring-view:;
connect-src <granted hosts or 'none'>; frame-src mailspring-view:; form-action 'none'; base-uri 'none'
```

Agent-authored inline scripts still work because they are hashed. A `<script>` or
`onerror=` that arrives through `innerHTML = subject` does not run, and there is no
`'unsafe-eval'`. `require-trusted-types-for 'script'` would be stricter, but it breaks a lot of
ordinary agent-written code. It could be an opt-in "strict" flag.

### 4.5 Bridge injection

Use `session.registerPreloadScript({ type: 'frame', filePath })` on View sessions only. The
existing `will-attach-webview` hook can keep stripping tag-supplied preloads unconditionally,
so a View cannot choose its own preload and the GHSA-x8wg-258g-v28h posture stays intact.

The preload is deliberately trivial. It uses `contextBridge` to expose
`window.mailspring = { call(method, params), on(event, cb) }` over
`ipcRenderer.sendToHost` / the `ipc-message` event on the `<webview>` element. It contains no
logic, so it cannot introduce a privilege mistake. All validation and authorization happen in
the host. If payload size becomes a problem, swap the transport for a transferred
`MessagePort` without changing the API.

### 4.6 Resource limits

A View that spins in a loop or leaks memory only hurts its own process. The host listens for
`unresponsive` and `render-process-gone`, shows a "View stopped responding: Reload / Close"
cover, and caps bridge result sizes and the number of concurrent subscriptions per View.

## 5. The capability bridge

### 5.1 Reuse and extend the MCP server's capability layer

`internal_packages/mcp-server` already solves most of the hard part, for a different
transport:

- `mcp-tools.ts` has about 25 handlers with zod schemas and a `read | write | send` category.
- `mcp-access-control.ts` provides account and folder exclusion through pure predicates.
- `mcp-serializers.ts` is the single output gate. Its comment says that no model leaves the
  process without passing authorization, which is exactly the property Views need.
- `withAudit` gives us an audit log and a preferences UI for it.

**Proposal:** extract a transport-neutral capability layer, using `defineTool` with
handler, schema, category, and serializer. Then mount it twice: on MCP HTTP, as today, and on
the View bridge. The benefits:

- One authorization gate and one audit log for every non-plugin consumer of mail data.
- **The cloud agent that writes a View uses the same vocabulary the View runs against.** The
  agent can prototype `search_mail` queries over MCP, then emit
  `mailspring.call('search_mail', …)` in the View. The tool descriptions double as the View
  API docs.
- Access control is per-grant. MCP keeps its global access level, and each View gets its own
  grant (§5.3) that is checked by the same predicates.

The layer needs to grow and tighten:

- **Metadata tools**, which MCP lacks today. Each tool gets a namespace policy: Views are
  forced to `view:<viewId>`, while MCP gets either its own `mcp` namespace or an explicit
  allowlist, never arbitrary plugin IDs. Without this, a client could rewrite `send-later`
  expirations or forge open-tracking data.
- **A grant object** passed to every handler (`{ accounts, folders, permissions, namespace }`)
  instead of handlers reading `core.mcp.*` config directly. MCP builds its grant from config,
  and Views build theirs from the manifest.
- **Result caps and pagination** everywhere. `search_mail` defaults to 150 rows, but nothing
  stops a caller from asking for 100,000.

### 5.2 What Views need beyond MCP

MCP is request/response. Views need **live data**, which is the first core tenet:

```js
const sub = mailspring.subscribe('threads', {
  query: 'from:(uber.com OR lyft.com) subject:receipt',   // SearchQueryParser grammar
  limit: 1000,
}, (threads) => render(threads));                          // re-fires on DB changes
```

On the host, this becomes `Rx.Observable.fromQuery(dbQuery)` built exactly as `search_mail`
builds it, with the result mapped through the serializers and debounced (for example, at
most once every 250 ms) onto the bridge. Views never send SQL or `Matcher` objects. The host
owns query construction, so a View cannot reach tables or columns that the grant doesn't
cover.

| Call | Notes |
|---|---|
| `subscribe('threads' \| 'messages' \| 'contacts', filter)` | `filter` is a search string plus structured extras: `accountId`, `categoryId`, `hasMetadata: true` (own namespace), and `fields`. Summaries only. Bodies are never pushed through subscriptions. |
| `messages.bodies(ids, { format: 'text' \| 'html' })` | Batched and paged. `text` is produced on the host (HTML → text, quoted replies and signatures stripped), so Views don't parse HTML. Bodies are immutable, so Views can cache them by id. |
| `messages.structuredData(ids)` | schema.org JSON-LD/microdata embedded in the message (§9.2). Free, exact, and needs no model. |
| `attachments.get(fileId)` | Returns a `mailspring-view:` URL for the bytes, for receipts, decks, and photos. Mirrors MCP's `get_attachment`. |
| `ai.extract`, `ai.classify` | §9. |
| `metadata.get / set(modelId, value)` | Wraps `SyncbackMetadataTask.forSaving` with `undoValue`, so undo works for free. The pluginId is forced to `view:<viewId>`. |
| `events.subscribe(range)` | Calendar events, for trips and meeting-load Views. |
| `ui.showThread(id)`, `ui.search(query)`, `ui.compose({...})`, `ui.reply(messageId)` | The host navigates the real UI or opens the real composer. Only the user sends. |
| `ui.openExternal(url)` | Host confirmation dialog that shows the URL. |
| `ui.setBadge(count)` | Count shown on the View's sidebar entry ("3 bills due"). |
| `theme` event | The host reads the current theme's CSS custom properties and pushes them, and pushes again on theme change, so Views look native in Light, Dark, and Taiga. |
| `context` event | Sidebar placement only: the focused thread (§6.2). |

Metadata is indexed by pluginId presence (`Thread.attributes.pluginMetadata.contains(id)`,
already used by `send-reminders` and `activity`) but not by value. So "threads on my kanban"
is cheap, and grouping them into columns happens in View JS. That is fine at kanban scale.

The People View is the one that strains this design. Aggregating participants × categories
over tens of thousands of messages in View JS means pushing a lot of rows across the bridge.
Expect to add a host-side `aggregate` primitive, for example top-N contacts with per-category
counts computed in SQL, once that View exists to measure.

### 5.3 Grants and consent

Each View ships a manifest:

```json
{
  "id": "b3f…", "name": "Customer Context", "version": 3,
  "placement": "thread-sidebar",
  "permissions": ["mail.read", "mail.bodies", "metadata.own"],
  "network": ["api.stripe.com"],
  "accounts": "all"
}
```

| Permission | Allows | Consent |
|---|---|---|
| `mail.read` | thread/message/contact summaries, subscriptions, structured data | install |
| `mail.bodies` | `messages.bodies`, `attachments.get`, `ai.*` over messages | install, called out explicitly |
| `metadata.own` | read/write the `view:<id>` namespace | install |
| `calendar.read` | `events.subscribe` | install |
| `mail.modify` | archive, trash, move, labels, star, unread (all undoable tasks) | install, called out explicitly |
| `network: [hosts]` | HTTPS to exactly these hosts | install. Combined with `mail.bodies`, the sheet says "can send your email content to these hosts." |
| *(none)* | send, forward, delete permanently, read other plugins' metadata, filesystem | not grantable |

Account and folder exclusion reuses `core.mcp.enabledAccounts` semantics per View. Any manifest
update that **widens** permissions or hosts re-prompts the user. Narrowing is silent.

## 6. Placements and rendering mail

### 6.1 Page placement

A full-page View is an entry in the account sidebar, like Activity. An `AccountSidebar`
extension lists installed page Views, each with a perspective and a sheet whose content
location mounts `<ViewHost viewId>`. This follows `internal_packages/activity/lib/main.ts`.

A page View can call `ui.showThread(id)` to open a thread. The host **pushes the standard
Thread sheet** over the View, using the same sheet stack as Preferences and single-panel
mailbox mode. It brings the real `MessageList`, the standard `EmailFrame` body renderer,
reply/forward, every plugin that decorates messages, and the main toolbar's thread actions.
The toolbar's Back button pops the sheet and returns to the View, which stays mounted
underneath with its state. This is the same regardless of the user's reading-pane layout
preference. The kanban board and package tracker get a native reading experience without
reimplementing navigation, and the View stays a list/board/chart.

### 6.2 Thread-sidebar placement

The message list already has a sidebar that plugins inject into
(`WorkspaceStore.Location.MessageListSidebar`, `MessageListSidebar:ContactCard`; used by
`participant-profile` and `github-contact-card`). A sidebar View registers a host component
at that location that mounts `<ViewHost viewId placement="sidebar">`.

- One webview per installed sidebar View, created lazily and **kept alive across thread
  changes**. The host pushes a `context` event (`{ threadId, messageIds, participants,
  accountId }`) whenever the focused thread changes, rather than reloading the page. Each
  webview process costs tens of MB, so reloading on every arrow-key press is not an option.
- The View reports its desired height through `ui.setHeight(px)`. The host clamps it and
  stacks it with the other sidebar components.
- Context is limited by the same grant: a sidebar View without `mail.bodies` gets
  participants and subject, not the message text.

Customer-in-Stripe, the CRM card, matter info, PR status, and order lookups all belong here.
This placement makes the "beside the open thread" pattern a View instead of a full plugin.

### 6.3 Rendering mail inside a View

Most of the time Views should not render mail at all. They should call `ui.showThread` and
let the host do it (§6.1). For Views that show messages inline, such as a newsletter reader
in a magazine layout, the `_lib` catalog ships a `<mailspring-message>` custom element:

- The host returns already-sanitized HTML from a `messages.renderable(id)` call. It is produced
  by the same pipeline as `EmailFrame` (`QuotedHTMLTransformer`, autolinking, the user's
  remote-image policy), and `cid:` images are rewritten to `mailspring-view:` URLs.
- The element renders that HTML into a nested sandboxed frame, plus a header row (from, to,
  date) and a Reply button that calls `ui.reply(messageId)`, which opens the real composer.
- Its styles come from the pushed theme variables, so it matches the host visually.

Separately, the `_lib` catalog includes a small UI kit (for example Preact + htm, which needs
no build step) with list, card, column, and chart primitives styled from the theme
variables. That keeps agents from hand-rolling React mounts.

## 7. Packaging and storage

- **Bundle:** one `index.html` (inline scripts and styles, plus `_lib` references) and
  `manifest.json`, stored under `<configDir>/views/<viewId>/`. A single file is what agents
  produce best and what is easiest to hash and diff.
- **Package:** everything in §4–§6 and §9 ships as one internal package, `views`.
- **Sync across devices:** later. Bundles are small, so they could live on the identity server
  next to metadata.
- **Dev loop:** a "Load View from folder…" developer action with file watching and live reload,
  plus a console pane that relays the guest's `console-message` events.

## 8. Cloud agent authoring (Pro)

Flow: the user describes a View. A managed Claude agent writes `index.html` and
`manifest.json` against the published bridge API and the `_lib` catalog. The client installs it
into a **preview** slot, with the consent sheet shown before first run.

Decisions to make before building this:

1. **Does the agent see real mail?** Without it, the agent writes against schemas and has to
   guess formats, such as what a UPS email looks like. With it, quality improves but mail
   leaves the device and the agent is exposed to injection (§3.3). A middle path: the agent
   asks for samples via `search_mail`, and the client returns them only after the user
   approves each batch.
2. **Iteration feedback.** The agent is far more effective if it sees runtime errors. Relaying
   console errors and bridge-call failures is safe. Relaying screenshots is not, because they
   contain mail.
3. **Injection blast radius.** The sandbox and the grant model bound the damage of a hijacked
   agent to "a View that does something annoying and undoable within the permissions you
   approved." Network grants are the exception, which is why they are shown so prominently.
4. **Who writes the parsers.** For high-volume, regular senders (Uber, UPS, Stripe), the agent
   should write deterministic parsers at authoring time and use `ai.extract` only as the
   fallback (§9.2). That is cheaper, faster, and more exact than running a model on every
   message.

## 9. On-device extraction: `ai.extract` and `ai.classify`

### 9.1 Requirements

- **Local only.** Message text never leaves the device for extraction. A cloud fallback, for
  example Haiku, could exist later as an explicit per-View opt-in, but it is not part of the
  design.
- **Cross-platform.** macOS (arm64 and x64), Windows (x64 and arm64), and Linux, on CPU-only
  laptops as the baseline.
- **Download under 1 GB**, fetched on demand when a Pro user first installs a View that needs it.
- **Typed output.** Results must validate against the View's schema every time, not "usually
  produce JSON."

### 9.2 Tiered pipeline

Most extraction on email does not need a generative model. The host tries each tier in order
and stops at the first one that fills the schema:

| Tier | What | Cost | Good at |
|---|---|---|---|
| 0. Embedded structured data | schema.org JSON-LD/microdata (`ParcelDelivery`, `FlightReservation`, `Order`, `EventReservation`, `LodgingReservation`), which many large senders embed for Gmail's email markup | ~0 | packages, trips, orders, tickets: exact fields, no model |
| 1. Authored parsers | per-sender regex or DOM selectors that the authoring agent writes into the View | ~0 | high-volume regular senders: Uber, Lyft, Stripe, GitHub, PagerDuty |
| 2. Encoder extraction/classification | a GLiNER2-class model: one forward pass does entities, classification, and hierarchical structure from a schema | ~200–350M params; ~130–210 ms/call on CPU per the paper | "find the tracking number, carrier, ETA"; "is this a receipt / shipping / bill / newsletter" |
| 3. Small generative model + constrained decoding | a ~0.6–1B instruction model with JSON-schema-constrained decoding | ~0.5–0.6 GB at Q4; hundreds of ms to seconds per message on CPU | normalization and composite fields: "next Friday" → date, line items, "what did I promise and by when" |

The host also **normalizes deterministically** after extraction. Money strings become
`{ amount, currency }` and date phrases become ISO dates relative to the message date. Models
only need to find the span, which is where small models are strongest.

### 9.3 Model candidates (state of the art, October 2026)

- **GLiNER2** ([paper](https://arxiv.org/abs/2507.18546),
  [code](https://github.com/fastino-ai/GLiNER2)) is the closest fit to "small, focused on
  classification and extraction, not general purpose." It is a bidirectional encoder that
  handles NER, text classification, and hierarchical structured extraction from a declarative
  schema in one CPU-efficient model. The base model is 205M params and the large one 340M,
  with a multilingual variant. Limits: span extraction only (no paraphrase or normalization),
  and a bounded context window, so long emails are chunked after the host strips quoted text.
- **Small generative models with constrained decoding.** Qwen3.5-0.8B is about 0.58 GB at
  Q4_K_M ([GGUF](https://huggingface.co/bartowski/Qwen_Qwen3.5-0.8B-GGUF)). Qwen3.5-2B
  (~1.4 GB) breaks the budget. Gemma 3 270M is explicitly positioned for task-specific
  fine-tuning into a JSON extractor
  ([Google](https://developers.googleblog.com/en/introducing-gemma-3-270m/)). Untuned small
  models are known to struggle with complex schemas, so constrained decoding plus flat schemas
  is mandatory, not optional.
- **NuExtract 2.0** ([model](https://huggingface.co/numind/NuExtract-2.0-8B)) is purpose-trained
  for template-based JSON extraction, but its smallest size is 2B (Qwen2-VL base), which is
  over budget at useful quantizations. It is worth benchmarking as a quality ceiling.
- **OS-provided models.** Apple's Foundation Models framework (macOS 26+) offers an on-device
  model with guided generation at zero download cost, but nothing equivalent exists across
  Windows (Phi Silica is limited to Copilot+ PCs) or Linux. At most, use it as an optional
  macOS fast path behind the same API.

**Budget:** GLiNER2-base (int8, ~200–250 MB) plus Qwen3.5-0.8B (Q4, ~0.58 GB) comes to roughly
0.8 GB, under the 1 GB target. A Mailspring fine-tune (§9.6) could replace the generative model
with a 270M-class model and bring the total near 0.4 GB.

### 9.4 Runtime

- **Process:** an Electron `utilityProcess` owned by the main process, never the renderer. Model
  memory and CPU stay out of the UI, a crash does not take the window down, and it is the
  natural home for a job queue.
- **Generative tier:** [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp), which
  provides llama.cpp bindings with prebuilt binaries, Metal/CUDA/Vulkan/CPU, explicit Electron
  support, and **JSON-schema-enforced generation** at the token level.
- **Encoder tier:** `onnxruntime-node`, with an ONNX export of the GLiNER2 model (CPU EP
  everywhere, and CoreML/DirectML EPs where they help).
- **Scheduling:** a priority queue. Visible rows go first, backfill runs at low priority,
  battery and thermal state are respected, and progress events stream to the View.

### 9.5 API and caching

```js
const stream = mailspring.ai.extract({
  messages: { query: 'from:(ups.com OR fedex.com OR usps.com)' },   // or ids: [...]
  schema: {
    carrier: { type: 'enum', values: ['UPS', 'FedEx', 'USPS', 'DHL', 'Other'] },
    trackingNumber: 'string',
    expectedDelivery: 'date',
    status: { type: 'enum', values: ['shipped', 'out_for_delivery', 'delivered', 'exception'] },
  },
});
stream.on('result', ({ messageId, value, confidence, tier }) => …);

const kinds = await mailspring.ai.classify({ ids, labels: ['receipt', 'shipping', 'bill', 'newsletter', 'personal'] });
```

- **Schemas are flat and typed** (`string`, `number`, `money`, `date`, `enum`, `bool`, and one
  level of arrays). This is the subset that both the encoder and constrained decoding handle
  reliably, and it is what the agent is told to write.
- **Inputs are message ids or queries, not arbitrary text.** That gets host preprocessing
  (HTML → text, quote and signature stripping) and caching, and it keeps the extractor from
  becoming a general-purpose local LLM service that Views can abuse.
- **The cache is keyed by `(messageId, schemaHash, modelVersion)`.** Messages are immutable, so
  results are computed once. The mail database is read-only from Electron, so the cache lives
  in its own SQLite file in the config directory (better-sqlite3 is already a dependency). It
  is local only and never synced.
- **Promoting results to metadata is the View's choice.** A View can write `metadata.set`
  (for example, a package's delivered status) to make it sync and survive cache eviction.
  Users should understand that metadata syncs through the Mailspring ID server, so the
  consent copy for `metadata.own` must say so.
- **Extraction is not metered.** Every tier runs on this device and costs us nothing (§14.3).

### 9.6 Evaluation and fine-tuning

Before choosing models, build a labelled eval set of about 300 messages across the dogfood
Views (receipts, shipping, invoices, school, alerts). Measure field-level accuracy and
p50/p95 latency for each tier on a low-end Windows laptop CPU, which is the worst case.

If the off-the-shelf models fall short, fine-tuning on email-specific extraction is the
obvious lever. Email has a narrow distribution, and published work suggests sub-1B models
fine-tuned for a single extraction task get close to much larger general models. The eval set
can grow from permissioned, synthetic, or public receipt corpora. The training data must never
be real user mail.

### 9.7 Spike results (2026-10-02, M1 Pro, 4 CPU threads)

| Model (download) | Receipt | Shipping | Publication | 7-way class | p50 per message |
|---|---|---|---|---|---|
| Qwen3.5-0.8B Q4, host prompt v2 (561 MB) | 0.93 | 0.91 | 0.85 | 0.66 | 0.6 s Metal / ~1.8 s CPU |
| NuExtract-2.0-2B (945 MB) | 0.93 | 0.83 | 0.78 | 0.63 | 1.8 s CPU |
| GLiNER2-base, Python only (830 MB) | 0.93 | 0.87 | 0.50 | 0.55 | 98 ms |
| GLiNER2.5-small, ONNX in `onnxruntime-node` (289 MB) | 0.77 | 0.78 | 0.65 | 0.51 | 42–128 ms |
| kev-0.6b / open-jev (380 / 480 MB) | – | yes/no fields only | – | 0.43 / 0.46 | 180–340 ms |
| Gemma 3 270M, untuned (288 MB) | 0.62 | 0.63 | 0.23 | 0.20 | 0.7 s CPU |

Scores are field-level accuracy averaged per schema. Qwen's v2-prompt numbers were measured on Metal.

- **Stack:** GLiNER2.5-small (ONNX, Node, no Python) as tier 2, plus Qwen3.5-0.8B with JSON-schema-constrained output as tier 3. Total ≈ 850 MB.
- **The host owns the prompt template.** Field descriptions, one worked example, and "null, never invent" moved Qwen from 0.80 to 0.93 on receipts. Views supply only the schema.
- **Jev-style models** (TypeSafe's Jev is cloud-only; its open reproductions are open-jev and kev) handle only yes/no and multiple-choice fields, not free-text spans. They are not suitable as the main extractor.
- **Don't classify with models.** Receipt, shipping and bill classification is reliable, but alert vs. newsletter is not. Use list headers and sender history for that (needs `List-Id`; see views-api.md Open decision 5).
- **Backfilling 2,400 messages:** GLiNER alone takes about 3 minutes. GLiNER plus Qwen on the ~30% GLiNER leaves unfilled takes about 25 minutes on CPU. Low-end Windows is unmeasured, estimated 2–4× slower.
- **Caveats:** the receipt and shipping sets are synthetic (the test inboxes hold only 8 real transactional emails), and all labels are one person's judgement. No Windows or Linux runs, and tier 0 is unproven on these inboxes (1.7% of bodies carry schema.org, none of them transactional).

### 9.8 Decision: one model, Qwen3.5-0.8B (2026-10-02)

The owner chose to bundle exactly one model. **We ship Qwen3.5-0.8B Q4_K_M (561 MB) through
`node-llama-cpp`.** This replaces the two-model stack in §9.7 and the tier 2/3 split in §9.2.
The pipeline is now tier 0 (schema.org) followed by one model.

**Why Qwen and not GLiNER2.5-small:**

| | Qwen3.5-0.8B | GLiNER2.5-small |
|---|---|---|
| Receipt / shipping field accuracy | **0.93 / 0.91** | 0.77 / 0.78 |
| Merchant / order number | **0.91 / 0.85** | 0.68 / 0.45 |
| Arbitrary View schemas | any flat JSON schema, enums, lists; free-form fields such as "promise" or "topics" | spans and label classification only; no paraphrase, no "null, never invent" |
| p50 / p95 per message, CPU, 4 threads | 1.6 s / 2.0 s | 42–128 ms / 73–298 ms |
| p50 per message, Metal | 0.5–0.6 s | n/a (CPU EP only) |
| Download | 561 MB | 289 MB |

Views write their own schemas, so the model has to cope with fields we've never seen. A span
extractor can't fill a field that isn't a verbatim span ("is this a renewal?", "which
city?"), and GLiNER's 0.45 on order numbers is the same weakness on a field that *is* a span.
Speed is the cost. It is acceptable because extraction is a cached background backfill, not
an interactive call, and because Views are told to parse cheap formats themselves and send
only the misses (Rides needed the model for 9 of 46 emails).

**Latency work: what helped and what didn't** (CPU, 98 receipt and shipping messages,
average prompt 396 tokens):

- **Decode dominates.** About 60 output tokens at about 39 tok/s on CPU (88 on Metal) take
  roughly 1.5 s of the 2.2 s per message. Prefill of about 260 tokens takes 0.6 s (0.13 s on
  Metal). Qwen tokenizes digits one at a time, so dates and order numbers are the expensive
  part. Truncating input further barely helps.
- **8 threads instead of 4:** no gain (1.67 s vs 1.61 s p50). Decode is memory-bound. Ship 4
  threads, which leaves the UI cores alone.
- **Reusing the shared prompt prefix:** no gain. Qwen3.5 is a hybrid recurrent model, so
  llama.cpp can't keep a partial prefix state.
- **4 parallel sequences in one context:** 1.47–2.27 s of wall time per message, versus 1.6 s
  sequential. That isn't worth four times the KV memory.
- **Speculative decoding from the input (`InputLookupTokenPredictor`):** 2–4× slower, and
  accuracy fell to 0.66, because rejected drafts force recurrent state rollback. Don't use it.
- **Chat template:** encoding `<|im_start|>` as real special tokens instead of plain text
  raised receipts to 0.95 but cut classification to 0.49 and shipping to 0.87, and was slower.
  The shipped template keeps the measured plain-text form. Revisit this once there is a larger
  eval set.

**Backfill for 2,400 messages, if every one needs the model:** about 65 minutes on CPU and
about 24 minutes on Metal. The expected case is the misses only, roughly 20–30%: about
15–20 minutes on CPU and 5–7 on Metal. The queue runs at low priority in a utility process,
and the cache makes the cost one-time per (message, schema, model).

**Not decided:** CPU-only Windows laptops are probably 2–4× slower, and that hasn't been
measured. If they are too slow, the fallback is a fine-tuned 270M–350M model behind the same
interface (§9.6), not a second runtime.

**The generic prompt, and why grounding is mandatory** (measured with the production compiler
in `views/lib/extraction/prompt.ts`, which builds the prompt from any View schema, rather than
the per-task prompts of §9.7):

- **No worked example.** An example with unrelated field names cut newsletter `publication`
  from 0.95 to 0.73. Hints never carry sample values: with `e.g. "$23.10"` in the money hint,
  the model reported $23.10 as the total of every marketing email that mentioned no price.
- **The model fills fields on mail that doesn't contain them.** With `{ total: money }` on 80
  non-receipt emails it returned a value 88% of the time: the nearest number, a street
  address, a time, a salary range. A "relevant: true/false" question asked first in the same
  prompt didn't help (95%).
- **The host filters every answer deterministically** (`normalize.ts`):
  - Copied values must occur in the email.
  - Money must look like a charge (a currency marker or cents, and not a rate, range or
    "K/M" figure), and the amount is the number next to the marker, so "38 minutes $0.00"
    reads as $0.00.
  - Dates must name a day or month.

  The result: receipts total 52/53 correct, and 0/80 false positives on non-receipt mail.
- **Generic-prompt field accuracy** (Metal): receipt 0.93, shipping 0.83, newsletter
  publication 0.95, 7-way classification 0.58. Shipping `status` (0.56) is the weak field.
  Telling `shipped` from `out_for_delivery` from `exception` needs per-value descriptions,
  which Views can give through `instructions` or the field `description`.

**In the app** (Rides View, 46 receipt-like emails over 24 months; its regex parses 37):

- **Agreement:** with every email sent to the model, the model matched the regex amount on
  36 of the 37 parsed emails.
- **No invented amounts:** it returned no total for all 9 that the regex couldn't parse (Metropolis
  promotions and Microsoft "sign in to view your invoice" notices that state no amount).
- **Speed:** 44 s uncached on Metal (0.96 s per message including body loading), and 9.5 s
  on a re-run from the answer cache.
- **Before grounding:** the same View reported 46 receipts and an inflated total.

### 9.9 Generation (daily briefing), 2026-10-02

**Question:** can the bundled model write a daily briefing ("summarize today's mail and
identify priorities") on its own, or does that need a different design?

**Eval set:** 36 real threads from the dev inbox, the newest message in each from the last
24 hours, with bodies. They're a realistic mix: a Google security alert, Sentry error reports,
GitHub PR activity on two repos, a mailing-list thread, LinkedIn notifications, newsletters,
political fundraising, marketing and a Terms-of-Service notice. Timings are from an Apple M1
Pro; "CPU" means zero GPU layers.

| Approach | 0.8B (bundled) | 2B (1.4 GB, for comparison) |
|---|---|---|
| **Single pass**: 36 emails × 220 chars in one prompt (3.4k tokens), prose | 3.0 s Metal. Plausible but wrong: "50 people viewed your profile", invented names, newsletter content presented as the user's activity, priorities omitted | 6.4 s. Alarmist: the Google notice that the user granted Mailspring access became "unauthorized access to your Google Account" |
| **Single pass**, JSON list of up to 5 priorities | 2.1 s. Empty list (`{"priorities":[]}`) | — |
| **Phase 1**: per-message record (gist, asks, needs_action), grammar-constrained | p50 0.66 s / p95 0.89 s Metal, p50 2.0 s / p95 3.6 s CPU. Gists mostly faithful, some embellishment ("indicating a missing dependency"), and some wrong attribution (a LinkedIn digest became "Benjamin received a remote job opportunity") | p50 1.4 s Metal, 3.8 s CPU. Tighter and more faithful gists |
| **Phase 2, model picks priorities** from the 36 records | 1.4 s. Empty list again | — |
| **Phase 2, host picks priorities** from exact signals plus the phase-1 records | Instant. On the live inbox: Google security alert (urgent) and Dave's Codako meeting notes (a known correspondent waiting on a reply). No newsletters | same |
| **Phase 2 prose** over the records | 2.2–5 s. With headings and `[T1]` ids in the prompt it copied the digest verbatim; with plain bullet sections it wrote prose, but merged neighbouring items ("Google alert … urges viewers to watch the episode ad-free", from a podcast email) | 3.6–8.6 s. Better prose, but still merged items, e.g. "a Google email warning you about … Trump and AI executives" |

**Findings:**

- **Phase 1 is the one thing the 0.8B model does reliably.** One email at a time, a short
  grammar-constrained record is mostly faithful. It's the right unit to cache: computed once
  per message and reused across days and Views, and cheap enough to run in the background as
  mail arrives (≈0.7 s per message on GPU).
- **Selection is beyond the model.** It returned an empty priority list every time, whether
  single-pass or two-phase. The `kind` and `needs_action` fields are weak as well: most
  messages came back "other", and political newsletters were labelled "travel". Signals the
  host knows exactly do the job instead: List-Unsubscribe; automated senders; whether the
  user's message is newest in the thread; whether the user has ever written to the sender;
  security and monitoring patterns.
- **Free prose synthesis is unreliable at both sizes.** Both models move details between
  adjacent emails. 2B is better but not trustworthy. Prose is the least valuable part of a
  briefing and the most dangerous when it's wrong.

**Design (implemented):**

- **`ai.summarize`** is phase 1, cached per (message, model, prompt version).
- **`ai.generate`** runs phase 1, then phase 2 on the host: priorities chosen deterministically,
  sender groups, and a template-built **headline** ("Needs you: a security notice from Google and
  Dave is waiting on a reply. Also: 6 from LinkedIn, 5 from The New York Times…"). The model's
  per-message gists explain each item.
- **Model prose** (`task: 'summarize'`) is optional. It's validated (no prompt echo, whole
  sentences only), and the Daily Briefing starter offers it as an opt-in "Write a paragraph
  (experimental)".

**Options to improve prose later:**

1. **Background phase 1 for every new inbox message**, so opening a briefing is instant. This is
   the biggest UX win and needs no new model.
2. **An optional ~2B download for Pro** (1.4 GB, ~1.4 s per message on GPU). It gives better
   gists, but prose still needs the "headline first, prose opt-in" framing.
3. **Prose per priority item** instead of one paragraph: a one-sentence rewrite of each gist,
   which can't merge items. Untested.
4. **Cloud prose for users who opt in.** It contradicts the on-device promise, so it isn't
   proposed as a default.

## 10. Implications from the idea catalog

The catalog in Appendix A was used to check that the primitives are general enough:

1. **Five patterns cover nearly every idea:** extract and chart; extract dates and show a
   deadline timeline; a pipeline board stored in metadata; mail grouped around one thing (a
   person, case, property, or order); and context beside the open thread. These are the starter
   templates the authoring agent should know.
2. **"Beside the open thread" is common enough to be a placement** (§6.2), not a reason to
   write a plugin.
3. **Views need mail rendering, and the default should be the host's** (§6.1, §6.3).
4. **Network access is legitimate** (Stripe, carrier tracking APIs, currency conversion,
   GitHub), so it is declared per domain, and its combination with body access is spelled out
   at consent (§5.3).
5. **Extraction is the hard part, not rendering.** Hence §9 and the tiered pipeline.
6. **Some primitives are needed beyond the first draft:** attachment bytes, calendar events,
   badges, and eventually background execution. Alerts like "bill due tomorrow" only work if a
   View, or a declared rule it registers, can run while closed. Background execution is
   deferred, and `ui.setBadge` covers the open-app case.

## 11. Relationship to removing Node from the main window

The capability layer is the seed of a renderer-safe API. VS Code's migration followed the same
route: define a narrow IPC surface, move each Node-dependent call site behind it, and only then
flip `sandbox: true`. Each primitive added for Views is one less reason the main window needs
Node. The extraction service is already outside the renderer by design. The plugin system can
later be offered the same bridge as an opt-in "sandboxed plugin" tier without merging the two
systems.

## 12. Milestones

**Prototype in the webview from the start, not as plugins.** A plugin version of these Views
would read `DatabaseStore` synchronously, share `Model` instances, and render `EmailFrame`
directly. None of that survives the move to a process boundary, so the prototype would answer
the wrong questions. The bridge API is the main thing being designed, and the only way to
design it is to write Views that can't cheat:

- The host side is still an ordinary internal package (`views`). It contains `ViewHost`, the
  sidebar extension, and the bridge handlers. Only the View side is new.
- Views call only `window.mailspring`. Every time a View needs something the bridge lacks,
  that gap is logged as an API decision, not worked around.
- Security lockdown (M0) and the first Views (M3) overlap. The lockdown is mostly session
  configuration plus an adversarial test page, so it doesn't block writing Views behind a dev
  flag.
- `ai.extract` starts as a stub backed by tiers 0–1, so View work doesn't wait on the
  extraction spike.

| | Scope | Exit criterion |
|---|---|---|
| **M0 spike** | `<webview>` + `mailspring-view:` scheme + per-session lockdown + registered preload + echo bridge | adversarial page (fetch/img/css/ws/webrtc/beacon/open/navigate/form) leaks nothing without a grant, and reaches only the granted host with one; renderer crash is contained |
| **M0′ extraction spike** (parallel) | eval set; GLiNER2 vs Qwen3.5-0.8B-constrained vs NuExtract-2B as the ceiling; ONNX + node-llama-cpp in a `utilityProcess` | accuracy and latency table on a low-end Windows CPU; model choice made |
| **M1 bridge** | extract capability layer from `mcp-server` with grants and metadata namespaces; `subscribe`, `bodies`, `structuredData`, `metadata.own`, `ui.*`, theme push | MCP specs still pass; bridge specs cover authz for every call |
| **M2 placements** | page sheet with host reading pane; thread-sidebar host with `context` and `setHeight` | the Kanban View (page) and the Stripe View (sidebar) work end to end |
| **M3 dogfood** | hand-write Packages, Rides, Kanban, People, and Stripe; ship `ai.extract` | each View works with no API change that we didn't expect, or the API is fixed |
| **M4 install UX** | manifest, consent sheet, sidebar listing, badges, dev loop, crash cover | non-developer can install a View from a file |
| **M5 agent** | cloud authoring for Pro | decisions in §8 made |

Gating (§14) is not a milestone of its own. The runtime, the agent, and the quotas ship
together in one public release. A fake-door test (§14.6) runs before M0.

## 13. Open questions

- Does the identity server accept arbitrary `view:<id>` pluginIds, and what are its per-value
  size limits? Kanban state is tiny, but Views will be tempted to cache derived data in
  metadata.
- Are Views global or per account? Global with an account filter in the grant seems right.
- Should `mail.modify` exist in v1? Kanban only needs `metadata.own`.
- How should the `_lib` catalog be versioned so that old Views keep working?
- Model distribution: our own CDN or Hugging Face, plus integrity pinning (hash in the app
  binary) and delta updates when the model version bumps.
- Model licenses must be checked before shipping. GLiNER2 and Qwen3.5 are believed to be
  Apache-2.0; Gemma has custom terms.
- **Resolved:** the identity server does not reject metadata writes for quota today. This
  needs a new client↔server contract: a typed quota rejection on metadata syncback, carried
  by the sync engine as a distinct task error, which the bridge maps to
  `{ error: 'quota', feature }` (§14.3).
- **Resolved:** `view:*` metadata has 12-month retention, measured from the value's last
  write. A kanban card that keeps moving persists, and an abandoned View's data ages out. The
  server currently keeps all metadata indefinitely. Separately from Views, there are a few
  billion existing values that could be reviewed for a similar policy.
- The free limits (number of Views, extraction units, trial length) are set to be tested,
  not decided. Starting points are in §14.2.

---

## 14. Packaging and Pro gating

### 14.1 Principles

Mailspring is GPL. Anyone can build the client from source and remove a check, so
client-side limits are **nudges, not protection**. The design puts the real gates on the
things that cost money and require our servers, and uses local quotas only to shape the
free experience:

1. **Gate what costs us money or needs a server.** Those are the authoring agent (LLM tokens)
   and metadata storage and sync (recurring storage and bandwidth on the identity server).
   Both are enforced server-side, so a fork cannot bypass them.
2. **Never gate the security boundary.** The sandbox, bridge, egress controls, and consent
   flow are open source and identical for free and Pro.
3. **Let free users reach the "wow" moment, then ask.** The upgrade prompt should appear at
   the moment of value, with partial results on screen, not as a lock icon in front of
   something nobody has tried.
4. **Never destroy user work.** Going over a limit pauses things. It never deletes them.

The existing `FeatureUsageStore` (`app/src/flux/stores/feature-usage-store.tsx`) already
provides all of the client mechanics:

- per-feature `quota` / `period` / `usedInPeriod`, delivered with the Mailspring ID;
- `featureLimitName` for server-side A/B variants (e.g. `"snooze-experiment-A"`);
- `markUsedOrUpgrade()` and the `FeatureUsedUpModal`;
- `UsageRecordedServerSide` for features whose usage the server counts itself.

Every limit below is a feature key in that system. That way limits and trial lengths can be
tuned and A/B tested from the server without shipping a client.

### 14.2 Free vs. Pro

| | Free | Pro | Enforced |
|---|---|---|---|
| Runtime, sandbox, bridge, consent, security | ✓ | ✓ | n/a |
| Active installed Views (page + sidebar) | 2 | unlimited | client (`views-active`) |
| Build a View by asking the agent | first View free | ✓, with a monthly fair-use cap | **server** (`view-agent-build`) |
| Edit or remix a View with the agent | – | ✓, same cap | **server** |
| Embedded schema.org data and agent-written parsers (tiers 0–1) | ✓, unmetered | ✓ | n/a |
| Smart extraction (model tiers 2–3) | ✓, unmetered (on device) | ✓ | n/a (§14.3) |
| `view:*` metadata stored | capped | unlimited | **server** |
| Sync Views across devices | – | ✓ | **server** |
| Publish or share a View by link | install only (counts toward the 2) | publish | **server** |
| Dev mode: load a hand-written View from a folder | ✓ (counts toward the 2) | ✓ | client |

The numbers are starting points for `featureLimitName` experiments, not decisions.

**Agent fair-use cap from day one.** The cost of an agent build varies widely (iteration
count, sample size, retries). Pro gets a monthly cap through the same quota system, set
generously. It is much easier to loosen a cap later than to add one to a feature people
already pay for.

**Bring-your-own-agent is allowed.** The free MCP server already lets a Claude Desktop user
have their own Claude write a View and load it in dev mode. We don't fight this: those users
are evangelists, the 2-View cap still applies, and their Views can feed a future shared
gallery.

### 14.3 On-device extraction is unmetered (decided 2026-10-05)

Extraction, summaries and generation all run on the user's machine (§9) and cost us nothing per
call, so they are not metered or limited beyond per-job caps. A client-side `smart-extraction`
meter existed briefly as a placeholder and was removed: the feature was never defined
server-side, so it was always usable, and it only added a dead 'quota' path for Views to
handle.

Persisted results are different: every `view:*` metadata value is stored and synced by the
identity server. If that cost becomes material, metering metadata **creates** server-side
(with a typed rejection the sync engine surfaces) is the place to add a limit later.

- **Retention:** `view:*` metadata expires 12 months after its last write, for all accounts.
  That bounds storage cost independently of the free/Pro split. The consent copy for
  `metadata.own` mentions it.

### 14.4 Upgrade moments

Each prompt appears where the user has just seen value:

| Moment | What the user sees |
|---|---|
| Extraction backfill reaches the free quota | The View renders with the results it has, e.g. a spend chart filled through March. A host-rendered banner over the View: "Extracted 500 of 2,340 receipts. Upgrade to finish." Remaining messages queue and resume after upgrade or at the next period. |
| Installing or building a third View | The consent sheet appears as usual. Instead of Install: "You have 2 active Views. Upgrade, or pause one of them." The user picks which to pause. |
| Trial or subscription ends with more than 2 Views | Extra Views become **paused**. They stay in the sidebar, the page shows the last render snapshot blurred, and a Resume button opens the upgrade modal. Kanban columns and other metadata are kept untouched. |
| Second agent build | The prompt box works as normal. On submit: "Your first View was on us. Pro includes N builds a month." The prompt text is kept, so upgrading continues straight into the build. |
| Remixing a shared View | "Customize with the agent" is visible on every installed shared View and opens the upgrade modal on free accounts. |
| Metadata stored-object cap | The View keeps working from the local cache. Its sidebar entry shows a "not syncing" badge that explains why and links to upgrade. |

The blurred snapshot is taken by the host with `webContents.capturePage()` when the View is
paused, and stored locally next to the bundle. It never leaves the device.

All upgrade UI is **host-rendered**, never View-rendered. A View must not be able to draw a
fake upgrade or payment prompt, and the host's `FeatureUsedUpModal` is the only purchase
surface.

### 14.5 Precedents

- **Home Assistant / Nabu Casa:** fully open source, funded by an optional cloud subscription
  for things that genuinely need a server (remote access, voice). This is the closest match
  to Mailspring.
- **Obsidian:** a free app with paid Sync and Publish. Charge for the server-backed parts.
- **Raycast:** extensions free, AI and cloud sync Pro. Same split as here: the runtime is free,
  the agent and services are paid.
- **IFTTT:** caps active applets on its free plan. A direct precedent for "2 free Views". It
  drove upgrades but also drew backlash, so make the free limit feel generous at first.
- **Trello:** used to allow one Power-Up per board on its free plan. Counting extensions worked
  as an upsell, and Trello later loosened it once it had other gates.
- **Notion AI:** a fixed number of free AI responses, then a paywall. The "taste then pay"
  pattern for AI features.
- **Bitwarden:** open source, with premium features gated on the client side. Honor-system
  gates work when the price is fair and the mission is visible ("Pro funds the open-source
  project").

### 14.6 Sequencing to avoid building a free product by accident

- **Ship the runtime, the agent, and the quotas in one release.** If hand-written Views ship
  first on their own, that becomes the free product and the agent becomes an add-on to
  something people already have.
- **Run a fake-door test before M0.** Add a "Custom Views (beta)" sidebar entry with a
  "Describe the View you want" box that leads to a waitlist. The click-through rate measures
  demand. The submitted descriptions (prompt text only, with opt-in) show which verticals
  matter and become eval cases for the agent and for extraction (§9.6).
- **Build the server-side quota work (§14.3) during M1**, alongside metadata namespaces. It
  lives on the same identity-server endpoints.

---

## 15. Prototype findings (2026-10-02)

The prototype is in the working copy (uncommitted): `app/internal_packages/views/`,
`app/src/browser/view-sessions.ts` and `view-sandbox-policy.ts`, and the capability layer in
`mcp-server/lib/capabilities/`. The API is specified in `docs/plans/views-api.md`.

**Built and verified in the dev app:**
- Page and thread-sidebar placements.
- Opening a thread with `ui.showThread`, which pushes the host Thread sheet over the View.
- `<MessageView>` with sanitized HTML and proxied images.
- Theme push (light, dark and accent colour, all live).
- Badges, and crash/hang/error covers.
- Per-domain network grants.
- A red-team View: 31 escape attempts blocked, 0 listener hits.

Specs: views 22, sandbox policy 17, MCP 29, account-sidebar 8.

**Dogfood Views, each written by a fresh agent with only views-api.md:** Board (kanban),
Rides & Receipts, Packages, People, Newsletters, Sender Context (sidebar). None threw at
runtime. Every problem was wrong data, missing docs, or a non-native look.

**Fixes before the API is ready for an authoring agent**, ranked by how much they cost the
agents (gap logs: `scratchpad/dogfood-a/GAPS.md`, `scratchpad/dogfood-b/GAPS.md`):

1. **Edit loop.** Reloading a View breaks every hook with `Subscription sN already exists`,
   because the host keeps the old page's subscriptions and the new page reuses the same ids.
   New View folders appear only after an app relaunch. Needed:
   - drop all of a View's subscriptions on navigation and dom-ready;
   - file-watch View folders and hot-reload them;
   - a host "Reload View" command.
2. **Query correctness.**
   - `field:(a OR b)` returns nothing, silently, and the doc's own example uses that form.
   - An 80-term OR query hangs forever. Calls need a timeout and limit errors.
   - Free-text search is stem- and prefix-matched (`ups` matches 1,000+ messages).
   - Message search matches at the thread level, so `in:sent` can't count "mail I sent".
     Add `participants: string[]` and `direction: 'sent' | 'received'` filters, and a
     has-List-Unsubscribe filter for newsletters.
3. **Identity.**
   - Count rows have no `isMe` and no names.
   - The user's old alias addresses come back as other people. Resolve aliases on the host
     (account aliases plus addresses seen in Sent) and add `isMe` to every contact-shaped
     value.
4. **Exploration before writing.** Agents had to use CDP to learn what the mailbox contains.
   The authoring loop should expose the same tools read-only through MCP (`search_mail`,
   `count`), which is the shared-vocabulary argument of §5.1.
5. **Native sidebar look.** The host should wrap sidebar Views in the standard sidebar card
   (5px inset, 5px radius, 1px border, 15px padding), so a plain View looks native with no
   coaching.
6. **Doc and type mismatches.**
   - `snippet` is null on threads; some theme tokens are undocumented.
   - The manifest `id`/`version` fields disagree with the examples, and `CountRow.labels` and
     `<MessageView>` notes are stale.
   - Recharts tooltips need dark-mode styling.
   - Page Views shrink to about 470px when the reading pane opens, and the doc doesn't say so.
7. **Slow content.** `useContent` over 60+ messages is slow, shows no progress, and doesn't
   say why a body is `null`. `useExtract` restarts when its id list grows.
8. **Data gaps that need the sync engine:** `List-Id` / `X-GitHub-Reason` headers (§13),
   downloading attachments on demand, and PDF text.

The real extraction tiers (§9.7) replace the `useExtract` stub. Regex-only parsing missed
2 of 3 real receipt layouts in Rides.

**Wave 4 status.** Items 1, 2, 3, 5, 6 and 7 are addressed:
- **Edit loop:** the bridge drops a page's state on reload and pins calls to a per-document
  nonce. Drafts and the `previewAndWait` diagnostics loop are in place; the contract is in
  `views-authoring-loop.md`.
- **Queries:** JSON queries are the primary form, with the search-layer bugs fixed.
- **Identity:** resolved on the host, with `isMe` everywhere.
- **Sidebar:** card and panel modes, behind a generic switcher.
- **Docs and types:** the mismatches are fixed.
- **Slow content:** `useContent` reports progress and a reason for every `null`.

Extraction runs Qwen3.5-0.8B on-device (§9.8). Item 4 (exploration through MCP) is partly
covered by the `count_mail` / `get_identity` MCP tools. Item 8 is sync-engine work: `List-Id`
joins the extra-header allowlist, while GitHub-style data comes from body parsing.

## 16. View creation workflow (direction, 2026-10-02)

Most users won't have a desktop AI client, so creation runs against **an agent hosted on
id.getmailspring.com**, not a local Claude. This is the reverse of Claude artifacts: the
artifact is published *down* to the user's machine.

**Flow**

1. **Creation workspace (host-rendered).** A large free-form request box, plus an example
   picker: a compact search bar over the user's mail. Results are dragged or checked into an
   "Examples" tray. **Only tray items leave the device**, and the tray is the consent surface:
   - Each item shows exactly the text that will be sent, after host-side cleanup (quoted text
     and signatures stripped, attachments excluded by default).
   - The user can trim the item down to a single message in a thread, or redact parts of it.
   - It must be host-rendered (§14.4), never a View.
2. **Local suggestions.** The on-device model (§9) can propose candidates from the request
   without sending anything, e.g. "Found 12 shipping emails, add some?". The user still picks.
3. **Submit.** The request and the tray contents go to the server. The agent writes
   `manifest.json` + `View.jsx`, and the server returns a **signed revision**.
4. **Verify and preview.** The client:
   - verifies the signature against a public key pinned in the app binary;
   - checks that the revision is bound to this account, view id and revision number, so a
     revision can't be replayed onto another user or rolled back;
   - loads it as a draft through the edit loop (`previewView`).
5. **Automatic fix loop.** Diagnostics from the edit loop (compile and runtime errors,
   bridge errors, render-ok) go back to the server automatically, with no mail content, for
   up to N revisions before the user is shown a result.
6. **Iterate.** The user sends feedback text and may add more examples. If the agent needs
   more data, it *asks* ("I need an example of a delivered notification"), and the request
   appears in the workspace for the user to fill from the picker. Nothing is pulled
   automatically.
7. **Install.** Promoting the draft shows the permission consent sheet (§5.3). Widening
   permissions or network hosts in a later revision re-prompts.

**Preview feedback (errors and screenshots)**

Polishing a View needs the agent to see its errors and what it looks like, and a screenshot
of a live preview contains whatever mail the View renders. That can go beyond the tray. The
workspace discloses this up front: "While building, Mailspring sends error messages and
screenshots of the preview to the agent." It also keeps a visible log of everything sent,
with thumbnails. Two preview modes keep the automatic channel within what the user already
consented to:

- **Example-scoped preview (automatic).** The draft runs with a grant restricted to the tray's
  messages and threads, so the bridge returns nothing else. Errors and screenshots from this
  mode are sent automatically during the fix loop, because they can only contain consented
  mail.
- **Live preview (user-initiated).** The draft runs against the full mailbox, so the user
  sees it on their real data. Error text is sent automatically. It is truncated, and View
  stacks rarely carry mail. Screenshots are sent only when the user clicks "Send screenshot",
  and the image is shown before it goes.

An account-level setting can turn off screenshot sending entirely. The agent then works from
errors and user feedback alone, and the workspace says so.

**Notes**

- **Signing proves origin, not safety.** It stops tampered or injected bundles. The sandbox
  and the consent sheet remain the security boundary, because examples are attacker-written
  mail that reaches the cloud agent (§3.3). Unsigned local Views (dev mode, bring-your-own
  agent) stay allowed and are labelled as such.
- **Envelope:** a JSON envelope `{ viewId, revision, accountId, manifest, files, sig }` is
  simpler than a zip while Views are a single file.
- **Retention:** the server keeps examples only for the build session (state the retention
  period in the UI) and never uses them for training. Build sessions are metered server-side
  (§14.2, `view-agent-build`).
- **Version history:** drafts keep local revision history, so a user can roll back a bad
  iteration.

**MCP parity.** The capability layer is shared (§5.1), so new primitives (JSON queries,
counts, identity, namespaced metadata) should also be MCP tools where that comes for free.
Power users with a desktop AI client get the same reach, and the hosted agent and MCP share
one vocabulary.

## 17. Authoring experience and agent substrate (draft, 2026-10-02)

### 17.1 Surfaces

- **Views home.** This is the root sheet for the Views concept. It shows the user's installed
  Views as cards (with a thumbnail of the last render), Mailspring-published starter Views
  (Board, Packages, Newsletters, …) that install verbatim and can then be remixed, and a
  prominent **Create a View** entry. Starters can ship bundled first; a server-published
  gallery comes later.
- **Create flow.** Name the View, then type a free-form request, then the floating panel
  opens and asks for examples.
- **Floating authoring panel.** A dark panel in the bottom corner of the window, roughly the
  bottom quarter, floating above every sheet. It persists while the user navigates the inbox.
  It is the only surface where anything is shared with the agent:
  - a chat transcript (agent messages and user feedback);
  - **drop zone:** threads dragged from the thread list or message list onto the panel become
    attached examples. Chips show exactly what will be sent, and each can be removed before it
    goes;
  - **agent-initiated requests:** "Drag a couple of delivered-package emails here", or "I took
    a screenshot of the preview, send it?" with a thumbnail and Send / Don't send;
  - revision status (building, previewing, errors being fixed automatically, ready) and
    **Install** or **Discard**.
- **"Edit with AI" on any installed View** opens the same panel attached to that View. It
  starts from the View's current code and permissions.
- **Opening threads.** `ui.showThread` pushes the standard Thread sheet over the View, and the
  app's Back button returns to it (wave 5). There is no in-View reading pane.

### 17.2 Substrate: Claude Managed Agents on Sonnet

Managed Agents provides the agent loop plus a per-session cloud container, which is the same
shape as the desktop subagents that wrote the dogfood Views. The model is
`claude-sonnet-5-5`.

- **Agent object** (persisted and versioned). It holds the system prompt, the authoring skill
  (views-api.md, the authoring guide, example Views, and a headless test harness), and the
  custom tools below. **It is defined in the closed-source backend repo** and synced with
  `ant apply`, so the prompts and skills never live in the open-source client. The client
  only knows an agent id.
- **Environment.** `limited` networking with no allowed hosts. The agent needs no internet:
  vendored libraries come with the skill, and examples arrive as files or tool results.
- **Custom tools drive the loop.** The client executes them, so every boundary crossing is
  mediated by the app:

| Tool | Client behaviour |
|---|---|
| `preview_revision({ manifest, files })` | `previewAndWait` on a draft, which returns status plus diagnostics (no mail content) |
| `request_examples({ prompt })` | Shows the prompt in the panel and returns the examples the user drops in, as cleaned message JSON |
| `request_screenshot({ reason })` | Captures the preview and asks "Send screenshot?". Returns the image or "declined" |
| `ask_user({ question })` | Shows the question in the panel and returns the user's answer |

- **Inside the container,** the agent compiles and renders `View.jsx` against a mock bridge
  seeded with the attached examples, so trivial errors are caught before a preview round trip.
- **Examples** go up as session file resources (`/workspace/examples/*.json`) at kickoff, and
  later ones as `request_examples` results.
- **Cost controls:**
  - every session gets a hard `budget.max_list_cost`; at the cap it pauses with
    `budget_reached`, and the panel offers to upgrade or continue;
  - the backend keeps per-user monthly build quotas (`view-agent-build`, §14.2);
  - turn limits are enforced by the client/backend counting user turns.

### 17.3 Wiring (decided 2026-10-02)

The proxy is built now. The client never talks to Anthropic directly, even in development.

- **Backend (closed source, branch `sandboxed-views` in `../backend`):**
  - Agent and environment definitions plus the authoring skill, synced with `ant apply`.
  - Hapi routes under Mailspring ID auth (`identity-token`):
    - create or resume the session for a View;
    - send a user message or a custom-tool result;
    - relay the event stream to the client (SSE), with reconnect and consolidation per the
      Managed Agents client patterns;
    - interrupt.
  - The Anthropic API key lives only in the backend `.env`.
- **Sessions:** one Managed Agents session per View. The backend stores the mapping
  (identity, viewId) → sessionId and resumes it for "Edit with AI".
- **Examples:** sent as from/to/cc, subject and date, quote-stripped text, and sanitized HTML
  (no remote images or tracking pixels). Attachments are excluded.
- **Signing:** each `preview_revision` payload is signed by the backend before relay. The
  signature covers `{ identityId, viewId, revision, manifest, files }` and uses an Ed25519 dev
  keypair. The client verifies against a public key pinned in the app and rejects replays
  (revision must increase per View).
- **Limits:**
  - each session gets `budget.max_list_cost` = $2.00, and at the cap the panel offers to raise
    it or stop;
  - the proxy allows 5 new View builds per identity per day (the `view-agent-build` feature
    key), returning a typed quota error that the client maps to the upgrade modal.
- **Local development:** the dev client runs with `env=development` against the local backend
  (`localhost:5101`), with a local Mailspring ID. Identity, metadata and Pro features all hit
  the local DB in this mode.

---

## Appendix A. View idea catalog

Tags: **B** bodies, **A** attachments, **X** extraction, **M** metadata write,
**N** network, **S** thread sidebar, **C** calendar.

**Personal life and money**
- Ride and delivery spend: Uber, Lyft, and DoorDash by month, city, and trip, with surge outliers. *B X*
- Subscription tracker: recurring charges, next renewal, price increases, trial ends. *B X*
- Bills due: statements with amounts and due dates on a calendar, with autopay status. *B X*
- Trip timeline: flight, hotel, car, and restaurant confirmations merged into trip cards. *B X C*
- Return windows: recent orders with a countdown to each return deadline. *B X*
- Receipt and warranty locker: purchases with their PDF receipts, searchable by product. *A X*
- Tax season collector: 1099s, W-2s, and donation and medical receipts, checked against last year. *A X*
- Medical and insurance: appointments, lab notices, insurance statements reconciled against bills. *B X*
- School and kids: events, forms to sign, permission slips, lunch balance. *B X C*
- Ticket wallet: concerts, games, and reservations. *B X*
- Account inventory: every service with your address, plus a timeline of security alerts. *X*

**Inbox analytics and productivity**
- Waiting on: threads where you sent the last message, with no reply in N days.
- Who I owe replies to: median reply time per contact, and the slowest open threads.
- Volume heatmap: email by hour × weekday, over time.
- Newsletter reader: magazine layout, read statistics, and a "never opened" list for unsubscribing. *B*
- Coupon wallet: active promo codes and their expiry dates. *B X*
- Attachment gallery: all photos and documents, filterable by person. *A*
- Lost touch: frequent contacts gone quiet.
- Intro graph: who introduced you to whom. *B X*
- Commitments: promises in sent mail and their deadlines. *B X*

**Professional verticals**
- Job seeker: application funnel with days in each stage. *B X M*
- Recruiter: candidate pipeline board and response latency. *M*
- Founder or sales: lightweight CRM, deal stage per thread, deals going cold. *M S*
- Investor: deal-flow board with decks, and portfolio metrics pulled from monthly updates and charted. *A X M*
- Lawyer: threads by matter or case number, extracted deadlines, billable time reconstructed from sent mail. *B X M S*
- Freelancer: invoices sent vs. paid, aging chart, revenue per client. *B X*
- Academic: paper submission tracker, review assignments, student mail by course. *B X M*
- Open-source maintainer: GitHub notifications by repo and PR, review requests vs. mentions. *B N S*
- On-call engineer: alert heatmap, flapping detection, on-call week summary. *B X*
- E-commerce seller: daily sales from order notifications, with customer questions linked to orders. *B X S*
- Real estate agent: per-property board with showings, offers, inspection, and closing. *B X M*
- Landlord: maintenance requests and rent notices per unit. *B X M*
- Event or wedding planner: vendor quotes compared side by side, contracts signed or pending. *A X M*
- Journalist: embargo calendar from press releases, log of contacts with sources. *B X*
- Executive assistant: pending meeting requests and a "waiting on" list across the boss's threads. *C*
- Support: the customer's Stripe plan, payments, and recent issues beside their email. *N S*
