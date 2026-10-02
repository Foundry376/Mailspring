# Views authoring loop

How an agent (today a developer or a local agent, later the managed cloud agent of
sandboxed-views-exploration.md §8) iterates on a View until it works. The host side is
`app/internal_packages/views/lib/authoring/`; in a dev build it is `$m.ViewAuthoring` in the
DevTools console.

Status: implemented on branch `sandboxed-views`, 2026-10-02.

## The loop

```
agent ──revision──▶ previewView ──▶ draft on disk ──▶ View reloads in place
  ▲                                                        │
  └──── outcome + diagnostics (+ optional screenshot) ◀────┘
```

1. **Submit a revision:** `{ manifest, files: { 'View.jsx': string, 'view.css'?: string } }`.
   `previewView(viewId, revision)` validates it, writes it as the View's **draft**, and returns
   `{ revision }`, a 12-hex SHA-256 prefix of View.jsx. If the View is a page View, it opens
   it.
2. **The View reloads in place.** Mounted copies reload their page; the host layout, reading
   pane and selected thread are untouched. The bridge drops everything the previous page
   started (subscriptions, extraction jobs, replies to in-flight calls) before the new page
   runs, so the runtime's ids only need to be unique within one page.
3. **Wait for an outcome.** `previewAndWait(viewId, revision)` or
   `ViewDiagnostics.waitForOutcome(viewId, revision, timeoutMs)` resolves to one of:
   - `ok`: the first render committed and nothing failed for 1.5 s (`render-ok`);
   - `failed`: the first failure record for that revision;
   - `timeout`.

   In every case it also returns that revision's diagnostics.
4. **Send diagnostics back.** The agent fixes the code and goes to step 1 with a new revision.
   Records are tagged with the revision whose page produced them, so stale records from
   earlier revisions are never mistaken for current ones.
5. **Finish.** `promoteDraft(viewId)` copies the draft to `<configDir>/views/<viewId>/`
   (the installed copy) and removes the draft. `discardDraft(viewId)` falls back to the
   installed copy, or removes the View if it never had one.

## Diagnostics

Each record is `{ ts, viewId, revision, kind, message, level?, stack?, location?, method?,
code?, params?, untrusted? }`. Each View keeps a ring buffer of 200 records:
`getDiagnostics(viewId, { revision? })`, `onDiagnostic(cb)`.

| kind | Source |
|---|---|
| `compile-error` | Sucrase syntax error, with `location` (line, column) |
| `runtime-error` | Render error caught by the error boundary, uncaught `error` events, or a load failure |
| `unhandled-rejection` | Unhandled promise rejection |
| `console` | Guest `console.warn` and `console.error` only (the loader's own copies are skipped) |
| `bridge-error` | A failed bridge call: `method`, `code`, `message`, and `params` as names and types only |
| `crash` | The guest process exited |
| `hang` | The watchdog killed a View that stayed unresponsive for 15 s while on screen. Hidden Views are never judged. |
| `render-ok` | Host-computed from the loader's `mounted` signal plus the 1.5 s quiet period |
| `screenshot-taken` | `captureViewPreview()` captured a PNG (the record carries no image) |

Stacks are rewritten to `View.jsx:LINE:COL`. Sucrase preserves line numbers, and the
revision header shares line 1 with the wrapper. Lines are exact. Columns are exact for
compile errors, but runtime columns refer to the compiled line, because JSX expands in place. The guest can report only `page`, `mounted`
and the three error kinds. `render-ok`, `crash` and `hang` are recorded by the host and
can't be forged by the View.

**Privacy.** Records never contain bridge results or parameter values. However, error
messages and console text are written by the View at runtime, and a View can echo a subject
line into them. Those records are marked `untrusted: true`. Screenshots stay on the
machine. Nothing here sends anything anywhere; deciding what leaves the device, and with
what consent, is the authoring UI's job.

## Dev mode vs product

| | Dev mode | Product |
|---|---|---|
| Draft, preview, promote and discard API, and diagnostics | ✓ | ✓ (used by the authoring UI and the cloud relay) |
| File watching of `examples/*` and `<configDir>/views/*` with hot reload | ✓ | – |
| Hover controls on a View (↻ reload, DevTools, error count) | ✓ | – |
| `views:reload-view` command (`mod-alt-r`) | ✓ | ✓ (harmless) |
| `$m.ViewAuthoring` in the console | ✓ | – |

## Open for the product loop

- **Consent for widened permissions.** A preview currently runs with whatever permissions
  its draft manifest declares. Before a cloud agent can submit revisions, the host must hold
  a revision that widens `permissions` or `network` until the user approves it.
- **Network grants.** These are read from the draft manifest on each page load (the main
  process caches by manifest mtime), so a revision that changes `network` takes effect on its
  own reload.
- **In-flight IPC.** A call already sent by the old page when the reload begins is processed
  against the new page's bridge. Its reply is dropped if it finishes after the reset, but if
  it arrives after the reset it can collide with a new call id. Closing this needs a per-page
  nonce in the preload's call envelope.
