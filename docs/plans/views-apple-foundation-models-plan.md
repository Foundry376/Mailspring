# Views: Apple's on-device model as an alternative to the Qwen download

Plan for a future stacked PR. Research as of 2026-10-05. Confidence tags:
**[V]** verified in an Apple source, **[R]** reported by a credible third party,
**[I]** our inference.

## 1. Foundation Models: what we can rely on

| Topic | macOS 26 (Tahoe) | macOS 27 (shipped 2026-09-14) |
|---|---|---|
| On-device model | ~3B model, Apple Intelligence | Rebuilt from the ground up with better reasoning, tool calling and fewer guardrail false positives, plus image input **[V]** ([WWDC26 #241][wwdc26]). Reported as "AFM 3 Core" (3B dense), with an optional 20B sparse "Core Advanced" variant on capable Macs **[R]** ([callstack][callstack]) |
| Context window | 4,096 tokens **[R]** | 8,192 tokens, readable through `model.contextSize` **[V]** ([WWDC26 #241][wwdc26]). One pre-release report still said 4,096 ([apfel #189][apfel]), so **read `contextSize` at runtime and don't hard-code it** |
| Structured output | `@Generable` and `DynamicGenerationSchema` (built at runtime), which guarantees schema-valid output **[V]** ([docs][fmdocs]) | Same, plus `tokenCount(for:)`, usage counters and `ToolCallingMode` **[V]** ([WWDC26][wwdc26]) **[R]** ([apfel][apfel]) |
| Availability | `SystemLanguageModel.default.availability`: `.available`, or `.unavailable(.deviceNotEligible / .appleIntelligenceNotEnabled / .modelNotReady)` **[V]** ([docs][fmdocs], [dev.to][devto]) | Same |
| Hardware | Apple silicon only. No Intel Macs **[V]** | macOS 27 runs only on Apple silicon **[R]** ([rits][rits]) |
| User opt-in | Apple Intelligence must be enabled, and its language and region must be supported **[V]** | Same |
| Guardrails | Unsafe-looking input throws `guardrailViolation`, with occasional false positives (some caused by model assets that hadn't finished downloading) **[R]** ([forums][forums]) | Fewer false positives **[V]**. Email bodies will still trigger refusals sometimes **[I]** |
| Throttling | Rate-limited when the process runs in the background on battery **[R]** ([forums][forums-rl]) | Unchanged as far as anyone reports **[R]** |
| Non-Swift access | none | `/usr/bin/fm` CLI (`respond`, `chat`, `schema`, `--schema file`) and a Python SDK **[V]** ([WWDC26][wwdc26], [rits][rits]) |
| Cost / terms | Free on-device, no keys. Apple's acceptable-use requirements apply (no regulated advice, etc.). Mailspring's use (summarizing and extracting from the user's own mail) is ordinary **[I]**; read the current terms before shipping |

**What this means for us:**
- On an Apple-silicon Mac running macOS 26+ with Apple Intelligence enabled, there's a free ~3B model with guaranteed structured output and no download. On macOS 27 it has twice the context and better reasoning.
- That's likely better than Qwen3.5-0.8B for summarization **[I]**. We need to measure it on our eval set rather than assume.

## 2. Calling it from Electron

| Option | Verdict |
|---|---|
| Shell out to `/usr/bin/fm` | Fine for a quick test. Only on macOS 27, no cancellation or streaming control, a new process per call, and its stable surface isn't guaranteed **[I]**. Use only for the spike |
| **Bundled Swift helper (`mailspring-fm`) speaking newline-delimited JSON over stdio, started by the extraction utility process** | **Recommended.** It's isolated, so a crash only kills the helper, and works on macOS 26 and 27. One long-lived process holds the `LanguageModelSession` and loaded model. It builds `DynamicGenerationSchema` from our flat schemas. It matches how llama.cpp is hosted today, and it's ~200 KB and adds no dependencies |
| Node-API addon in Swift (node-swift) | Runs in-process. An ABI rebuild per Electron upgrade plus Swift runtime linking makes it brittle **[I]** |
| XPC service | Most "Apple-correct", but heavier packaging for no gain over stdio |

**Packaging** (from reading `app/build/build.js`):
- Darwin builds are per-arch (`process.arch`), so the helper only needs building for arm64. x64 builds skip it and always use llama.cpp.
- Ship it as an `extraResource`.
- Sign it with `entitlements.child.plist` under the hardened runtime, the same treatment as other helpers. No extra entitlement should be needed, since Foundation Models is a public framework with no capability **[I]**. Confirm during the M1 notarization dry run.
- Build it with `swift build -c release` in a new `app/build/tasks/build-fm-helper` step on macOS CI. The SDK minimum must be macOS 26.
- At runtime, availability is checked through the helper (`{op:'availability'}`). The app never links FoundationModels itself.

## 3. Mapping our three operations onto it

| Bridge call | Apple provider | Notes |
|---|---|---|
| `ai.extract` (flat typed schema) | One session per batch; a `DynamicGenerationSchema` built from the View schema (string/number/money/date/enum/bool, one level of arrays); host prompt template | Enums become `anyOf` string choices. Money and dates stay strings and are normalized on the host |
| `ai.summarize` (per-message record `{gist, asks, needsAction}`) | A fixed `@Generable` struct in the helper | Cache per (message, provider + model version) |
| `ai.generate` (prioritize / summarize / freeform) | Phase 2 over the phase-1 records; prose only when asked | A larger window means fewer stages when combining summaries. Size the input with `tokenCount(for:)`, never a fixed number |

**Host-side validation stays exactly as it is.**
- Guided generation guarantees the *shape* of the output, not the *truth* of the values. A ~3B model still invents totals and thread ids, as Qwen did 88% of the time on non-receipts.
- So `normalize.ts` (a value must appear in the source; charge-shaped money; dates that name a day or month), threadId whitelisting, and prompt-echo trimming all apply to both providers.
- The checks belong to the host contract, not to the model.

**Quality:** there's no public benchmark of AFM against Qwen3.5-0.8B on email extraction **[R: none found]**. Rerun the §9.7 eval set (receipts / shipping / newsletter / classification, plus the briefing quality notes in §9.9) against both providers before making Apple the default.

## 4. `LocalModelProvider` abstraction

```ts
interface LocalModelProvider {
  id: 'apple-fm' | 'llama-qwen';
  modelVersion(): string;                 // e.g. 'apple-fm@macOS27.0(24A123)' / 'qwen3.5-0.8b-q4km@fb044e93…'
  availability(): Promise<{ state: 'ready' | 'downloading' | 'needs-setup' | 'unsupported';
                            reason?: string; progress?: number }>;
  contextTokens(): Promise<number>;       // Apple: model.contextSize; Qwen: 8192
  countTokens?(text: string): Promise<number>;
  generate(req: { system: string; prompt: string; schema?: FlatSchema; maxTokens: number;
                  signal: AbortSignal }): Promise<{ text?: string; value?: any; refused?: boolean }>;
  warmup(): Promise<void>;
}
```

**Choosing a provider**, evaluated once per launch and again when availability changes:

| Situation | Provider |
|---|---|
| Apple silicon, macOS ≥ 26, Apple FM available | `apple-fm` |
| …but `.modelNotReady` | `apple-fm`, waiting (status "Apple Intelligence is preparing…"); don't download Qwen |
| `.appleIntelligenceNotEnabled` | Offer a choice: "Turn on Apple Intelligence" (deep link to Settings), or "Use Mailspring's model (560 MB)" |
| `.deviceNotEligible`, Intel, Windows, Linux | `llama-qwen` |
| Setting `core.views.localModel = 'mailspring'` | Always `llama-qwen` (escape hatch, and lets us compare quality) |

**Other rules:**
- **Cache keys** already include `modelVersion`, and the provider id is added to it. The Apple version includes the OS build, because a macOS update changes the model ("test your prompts with the new model" **[V]**). Cached extractions are recomputed after an OS update, which is correct.
- **Prompts:**
  - Each provider gets its own template file (`prompt.apple.ts`, `prompt.qwen.ts`).
  - Apple takes `Instructions` plus a typed schema, so the template doesn't need "answer only with JSON" or worked examples.
  - Qwen keeps its current template.
  - Both keep "email content is untrusted; null, never invent".
- **Refusals:** Apple guardrail refusals come back as `refused: true`. For extraction, the host treats them as "no value". For generation, it leaves the item out and doesn't fall back to Qwen per call, to keep the system simple.

## 5. First-run download (Qwen users)

**Recommendation: start the download automatically and in the background the first time someone opens the Views home or installs/tries their first View. Don't ask for consent up front; show clearly that it's happening and make it easy to pause.**
- **Why not ask first:** nearly every View needs the model, so a separate "Download?" step is friction with only one sensible answer. 560 MB is about the size of a macOS app update.
- **Exceptions:** on a metered or low-data connection, ask first (`navigator.connection.saveData`, or Windows' metered-network flag through `net`), and when free disk space is < 2 GB.

| Surface | Copy / behaviour |
|---|---|
| Views home header | Thin progress bar: "Setting up on-device AI · 38% of 560 MB". Link: "Pause". When done: "On-device AI is ready" for 3 s, then hidden |
| Any View calling `ai.*` before it's ready | Status `model_downloading` with `progress`. The deterministic sections render; model sections show "Preparing on-device AI… 38%" (the starters already degrade this way) |
| Metered / low disk | Card on the Views home: "Views use a 560 MB on-device AI model so your mail never leaves your computer. **Download now** · Not now". On low disk: "…needs 560 MB free (you have 1.2 GB)" |
| Apple FM available | No download, no banner |
| Apple Intelligence off | Card: "Use Apple Intelligence (no download) — **Turn on** · or **Download Mailspring's model (560 MB)**" |

**Mechanics:** `extraction-model.ts` already has the pinned URL, size and SHA-256, a resumable download and an integrity check.
- Add a download manager in the main process: a singleton, progress events to every window, pause/resume, retry with backoff, and a check for free disk space.
- Download through `net` so system proxies apply.
- Delete partial files older than 7 days.
- Never start it from a View; only the host decides.

## 6. Phased plan

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 spike (1–2 days)** | Use `/usr/bin/fm schema` on macOS 27 for the §9.7 eval and the briefing set | Accuracy and latency table, Apple FM vs Qwen 0.8B. Decide whether Apple becomes the default where available |
| **M1 helper** | `mailspring-fm` Swift package: `availability`, `generate` (text and `DynamicGenerationSchema`), `countTokens`, `cancel`, stdio JSON. Build step, signing, notarization dry run | Notarized arm64 build launches the helper; Intel and Windows builds unaffected |
| **M2 provider layer** | `LocalModelProvider`, `apple-fm` and `llama-qwen` implementations, selection, per-provider prompts, cache-key change, refusal handling | Existing extraction, generation and summary specs pass with both providers mocked; live run on an Apple-silicon Mac |
| **M3 download UX** | Download manager, Views home banner, metered and low-disk card, `model_downloading` status in bridge and runtime docs, Apple Intelligence card | Fresh profile on Windows and Intel: the download starts on first Views home open, Views degrade and recover. Apple-silicon Mac with AI on: no download |
| **M4 hardening** | Throttling on battery or in the background (back off, surface "paused on battery"); OS-update cache refresh; telemetry of provider choice (counts only) | A day of normal use without stuck jobs |

**Test matrix:**

| Platform | Expected |
|---|---|
| macOS 27, Apple silicon, AI on | Apple FM, 8K context |
| macOS 27, Apple silicon, AI off | The choice card |
| macOS 26, Apple silicon | Apple FM, 4K context |
| Apple silicon, `.modelNotReady` | Waiting state |
| Intel macOS 26 | Qwen download |
| Windows x64 and arm64 | Qwen download |
| Linux | Qwen download |
| Metered connection | Download asks first |
| Low disk | Download asks first and shows free space |

**Risks:**
- **Model changes with each OS update:** quality can drop silently. Mitigation: the eval runs on each macOS beta, and `core.views.localModel` lets users opt out.
- **Guardrail refusals on ordinary mail:** extraction gets missing fields, mitigated by the deterministic fallbacks.
- **Throttling:** background briefings running on battery get rate-limited.
- **Users who've turned Apple Intelligence off on purpose:** never nag them more than once.

## 7. Eval results (2026-10-09, M0–M2 implemented)

Machine: MacBook Pro, Apple silicon, macOS 27.0.1 (26A434), Apple Intelligence on. The system
model reported **`contextSize` 4,096**, not the 8,192 the WWDC session describes, which confirms
reading it at runtime. Qwen3.5-0.8B Q4_K_M ran through node-llama-cpp with Metal. Both used the
app's own `prompt.ts` and `normalize.ts`.

**Synthetic set** (68 emails generated with labels, no real mail): receipts in four layouts
(including the amount on the line above "Total"), shipping notices, marketing mail with prices
and no purchase, and newsletters.

| Set | Apple FM | Qwen 0.8B |
|---|---|---|
| Receipts (merchant, total, order #) | **0.94** | 0.85 |
| Shipping (carrier, tracking #, status) | 1.00 | 1.00 |
| Marketing (all fields should be null) | 0.50 | 0.53 |
| Newsletters (publication, kind) | **1.00** | 0.92 |
| **Overall field accuracy** | **0.89** | 0.84 |
| p50 / p95 latency (short emails) | 1.1–1.5 s / 2.1 s | 0.6–0.7 s / 0.9 s |

- **Qwen's receipt misses** were merchants copied from the fare text ("Trip fare $19.10 …").
- **Apple's two receipt misses** were both in one layout, where the amount sits on its own line
  above "Total".
- **Marketing mail fooled both models** equally: "Jackets from $49" was read as a total. The host
  check passes it because it looks like a charge.

**Real mail, in the app.**
- **Rides:** Apple worked through 45 receipts the parser missed in about 150 s, roughly **3.3 s per
  message**, against about 1 s for Qwen. Bodies of up to 4,000 characters are decode-heavy for a
  3B model.
- **Daily Briefing:** 21 per-email summaries took 65 s on Apple, about 3.1 s each, and 24 took 35 s
  on Qwen, about 1.4 s each. Apple's summaries were tighter, Qwen's longer and more detailed. Both
  were usable.
- **Guardrail refusals:** 3 of 16 real receipt-adjacent emails were refused. All three were
  political fundraising mail ("May contain sensitive content"). They count as "no value", as
  designed.
- **"null" strings:** Apple sometimes writes the string `"null"` for nullable fields. The backend
  maps that to a real null before the host checks.

**Decision:** make Apple the default where it's available, which is now implemented. It's more
accurate on receipts and newsletters, needs no 560 MB download, and refusals degrade safely. The
cost is about 2–3× more time per message. Extraction is cached and runs in the background, so
that shows up mainly on a View's first run. Users who want the faster model can set
`core.views.localModelProvider = 'qwen'`.

### Bugs found and fixed during M0–M2

- **Request lines cut in half:** Swift's `FileHandle.bytes.lines` also splits on U+2028/U+2029/NEL,
  which real email text contains. The helper now splits on `\n` bytes only, and the client
  escapes U+2028/U+2029 when writing requests.
- **Guardrail reported as a failure:** macOS 27 describes guardrail blocks only in prose ("May
  contain sensitive content"), so they were classified `failed`. They're now `refused`.
- **Answers reused across providers:** the renderer's in-memory extraction cache and the briefing's
  generation key ignored the model, so switching providers reused the other model's answers. Both
  now include the model version.

## 8. As built

| Piece | Where |
|---|---|
| Swift helper (`availability`, `generate` with `DynamicGenerationSchema`, `cancel`, `warmup`; NDJSON over stdio) | `app/native/mailspring-fm/` (`npm run build:fm-helper` in dev) |
| Helper process and system-model snapshot (`getSystemModel`, `probeSystemModel`, `onSystemModelChange`) | `app/src/browser/apple-fm.ts` |
| Backend choice, Apple backend (prompt split, context fitting, refusal/rate-limit/context handling), cache versions | `app/src/browser/local-model-provider.ts` |
| Routing in the extraction queue, status `backend` / `throttled` | `app/src/browser/extraction-service.ts` |
| Packaging: built for darwin-arm64, shipped as `extraResource`, signed with `entitlements.child.plist` by osxSign | `app/build/build.js` |

[wwdc26]: https://developer.apple.com/videos/play/wwdc2026/241/
[callstack]: https://www.callstack.com/blog/on-device-ai-after-wwdc-2026-whats-new
[apfel]: https://github.com/Arthur-Ficial/apfel/issues/189
[rits]: https://rits.shanghai.nyu.edu/ai/apple-foundation-models-macos-27/
[fmdocs]: https://developer.apple.com/documentation/foundationmodels
[devto]: https://dev.to/arshtechpro/how-to-fall-back-gracefully-when-apple-intelligence-isnt-available-48j
[forums]: https://developer.apple.com/forums/topics/machine-learning-and-ai/machine-learning-and-ai-foundation-models
[forums-rl]: https://developer.apple.com/forums/thread/789788
