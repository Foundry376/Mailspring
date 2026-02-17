# Grammar Check Composer Plugin — Implementation Plan

## Overview

Add an inline grammar-checking plugin to the Mailspring composer that checks draft text against a LanguageTool-compatible API (or local Harper WASM engine), displays errors as wavy underlines in the Slate editor, and lets users accept suggestions or dismiss errors via a floating popover.

---

## Table of Contents

- [Architecture Summary](#architecture-summary)
- [Component Inventory](#component-inventory)
- [Phase 1: Core Infrastructure](#phase-1-core-infrastructure)
- [Phase 2: Slate Editor Plugin](#phase-2-slate-editor-plugin)
- [Phase 3: Composer UI Integration](#phase-3-composer-ui-integration)
- [Phase 4: Preferences & Backend Configuration](#phase-4-preferences--backend-configuration)
- [Phase 5: Privacy & Polish](#phase-5-privacy--polish)
- [Detailed Design](#detailed-design)
  - [Grammar Check Service](#grammar-check-service)
  - [Dirty Paragraph Tracking](#dirty-paragraph-tracking)
  - [Slate Decorations for Underlines](#slate-decorations-for-underlines)
  - [Floating Correction Popover](#floating-correction-popover)
  - [Replacement Application](#replacement-application)
  - [Preferences UI](#preferences-ui)
- [File Layout](#file-layout)
- [Key Technical Decisions](#key-technical-decisions)
- [Open Questions](#open-questions)

---

## Prior Art: The Deleted Spellcheck Decoration Plugin

Mailspring previously had a custom Slate-based spellcheck plugin (`app/src/components/composer-editor/spellcheck-plugins.tsx`) that was removed in commit `c062378d6` (2026-01-04, "Use native browser spellcheck with typing-debounce optimization") in favor of Chromium's built-in spellchecker. That plugin is the direct architectural predecessor for this grammar checker and establishes all the key patterns we will reuse.

### What the Old Spellcheck Plugin Did

The deleted plugin used `Decoration.create()` with `editor.withoutSaving()` and `editor.setDecorations()` to overlay red dotted underlines on misspelled words — exactly the mechanism we will use for grammar error underlines.

Its **two-phase checking strategy** is directly applicable:
1. **Immediate (focused block only)**: On every `onChange` (throttled to once per 200ms), spellcheck ran only on text nodes in the currently focused block. This kept typing responsive.
2. **Deferred (full document)**: After 1 second of inactivity via `setTimeout`, the entire document was scanned.

For grammar checking, we adapt this to:
1. **Immediate**: Mark the focused block as dirty (don't check yet — API calls are async, unlike `isMisspelled()` which was synchronous).
2. **Deferred**: After 800ms of inactivity, send all dirty blocks to the LanguageTool API.

### Key APIs from the Old Plugin We Will Reuse

**Decoration creation** — The old plugin created decorations like this:
```typescript
const range = Decoration.create({
  anchor: { key: key, offset: match.index },
  focus: { key: key, offset: match.index + match[0].length },
  mark: { type: MISSPELLED_TYPE },
});
```
We will use the same pattern but with `mark: { type: GRAMMAR_ERROR_MARK, data: { ...errorDetails } }` to carry the error message and replacements.

**Applying decorations without polluting undo** — The old plugin used:
```typescript
editor.withoutSaving(() => {
  editor.setDecorations(decorations);
});
```
This is critical — it prevents decorations from appearing in the undo/redo stack. The `composer-view.tsx` `skipSaving` logic (line 191) then prevents them from triggering draft persistence.

**Underline rendering via CSS background gradients** — The old plugin rendered misspellings as:
```typescript
style={{
  backgroundImage: 'linear-gradient(to left, red 40%, rgba(255, 255, 255, 0) 0%)',
  backgroundPosition: 'bottom',
  backgroundSize: '5px 1.3px',
  backgroundRepeat: 'repeat-x',
}}
```
We will use a similar gradient approach but with a wavy pattern and color-coding by error category (blue for grammar, red for typos, amber for style).

**Block-type exclusion** — The old plugin skipped blockquotes, code blocks, links, template variables, and inline code:
```typescript
const EXCEPT_BLOCK_TYPES = [BLOCK_CONFIG.blockquote.type, BLOCK_CONFIG.code.type];
const EXCEPT_MARK_TYPES = [MARK_CONFIG.codeInline.type, LINK_TYPE, VARIABLE_TYPE];
```
We will apply the same exclusions, plus skip `uneditable` blocks (quoted email content).

**IME composition handling** — The old plugin tracked IME composition state via a `WeakMap` to avoid checking mid-composition. We should do the same:
```typescript
const composingWeakmap = new WeakMap();
// ...
onCompositionStart: (event, editor, next) => {
  composingWeakmap.set(editor, (composingWeakmap.get(editor) || 0) + 1);
  next();
},
onCompositionEnd: (event, editor, next) => {
  composingWeakmap.set(editor, Math.max(0, (composingWeakmap.get(editor) || 0) - 1));
  next();
},
```

**Right-click/Ctrl+click selection** — The old plugin had an `onMouseDown` handler that expanded the selection to the entire misspelled word on right-click, so the system context menu could offer suggestions. We will instead show our own floating popover on click (since grammar suggestions come from the API, not the OS).

### What Changes from Spellcheck to Grammar Check

| Aspect | Old Spellcheck Plugin | New Grammar Plugin |
|--------|----------------------|-------------------|
| **Check function** | `AppEnv.spellchecker.isMisspelled(word)` — synchronous, per-word | LanguageTool HTTP API — async, per-paragraph |
| **Granularity** | Per-word regex scan of text nodes | Per-block (paragraph) API call |
| **Timing** | onChange → immediate focused block check + 1s full document check | onChange → mark dirty + 800ms debounced API call |
| **Decoration data** | Just the mark type (`MISSPELLED_TYPE`) | Mark type + error message, replacements, ruleId, category |
| **Correction UI** | Relied on browser's right-click context menu | Custom floating popover with replacement buttons |
| **State management** | Stateless (recalculated on every check) | Flux store caching results by `(draftId, blockKey)` |
| **Staleness** | N/A (synchronous) | Check that block text hasn't changed between request and response |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  Composer:ActionButton  (GrammarCheckToggle)                    │  Toggle on/off, show status
├─────────────────────────────────────────────────────────────────┤
│  Slate Editor Plugin  (grammar-check-plugins.tsx)               │
│  ├── decorateNode()  → wavy underline decorations               │
│  ├── renderMark()    → <span> with error styling                │
│  ├── topLevelComponent → FloatingCorrectionPopover              │
│  └── onChange()      → dirty paragraph tracking                 │
├─────────────────────────────────────────────────────────────────┤
│  GrammarCheckStore  (Flux store)                                │
│  ├── Debounced paragraph-level checking                         │
│  ├── Error cache: Map<blockKey, GrammarError[]>                 │
│  ├── Backend abstraction (LanguageTool HTTP / Harper WASM)      │
│  └── Dismissed rules / ignored errors                           │
├─────────────────────────────────────────────────────────────────┤
│  ComposerExtension  (GrammarCheckComposerExtension)             │
│  └── warningsForSending() → warn about uncorrected errors       │
├─────────────────────────────────────────────────────────────────┤
│  Preferences Tab  (PreferencesGrammar)                          │
│  └── Backend selection, server URL, language, privacy notice    │
└─────────────────────────────────────────────────────────────────┘
```

The grammar checker runs asynchronously and never blocks the editor. When the user pauses typing, dirty paragraphs are sent to the configured backend. Results are stored in a Flux store and projected into the editor as Slate **decorations** — lightweight visual overlays that don't modify the document content and are explicitly excluded from draft persistence by the existing `skipSaving` logic in `composer-view.tsx` (line 191).

---

## Component Inventory

| Component | Type | Role/Registration | File |
|-----------|------|-------------------|------|
| `GrammarCheckToggle` | React component | `Composer:ActionButton` | `lib/grammar-check-toggle.tsx` |
| `GrammarCheckComposerExtension` | ComposerExtension | `ExtensionRegistry.Composer` | `lib/grammar-check-extension.ts` |
| `GrammarCheckStore` | Flux Store | Singleton (activated in `main.ts`) | `lib/grammar-check-store.ts` |
| `GrammarCheckEditorPlugin` | Slate plugin | Registered in `conversion.tsx` | `app/src/components/composer-editor/grammar-check-plugins.tsx` |
| `FloatingCorrectionPopover` | React component | `topLevelComponent` in Slate plugin | Inside `grammar-check-plugins.tsx` |
| `PreferencesGrammar` | React component | `PreferencesUIStore.TabItem` | `lib/preferences-grammar.tsx` |
| `GrammarCheckService` | Service class | Used by `GrammarCheckStore` | `lib/grammar-check-service.ts` |

---

## Phase 1: Core Infrastructure

### 1.1 Grammar Check Service (`lib/grammar-check-service.ts`)

An abstraction layer over the grammar-checking backend.

```typescript
interface GrammarError {
  // --- From LanguageTool match ---
  offset: number;          // Character offset within the paragraph text (0-based)
  length: number;          // Number of characters in the error span
  message: string;         // Full human-readable description
                           //   e.g., "The verb 'do' does not agree with the subject 'He'."
  shortMessage: string;    // Brief label for popover header
                           //   e.g., "Subject-verb agreement" (may be empty)
  replacements: string[];  // Suggested fix strings (extracted from match.replacements[].value)
  ruleId: string;          // Rule identifier, e.g., "HE_VERB_AGR"
                           //   Used for dismissing rules (→ disabledRules API param)
  ruleDescription: string; // Rule description, e.g., "'He/she' + verb agreement"
  category: string;        // Category ID: "GRAMMAR", "TYPOS", "STYLE", "PUNCTUATION",
                           //   "REDUNDANCY", "CASING", etc. → determines underline color
  categoryName: string;    // Human-readable: "Grammar", "Possible Typo", etc.
  issueType: string;       // "grammar", "misspelling", "typographical", "style", etc.
  sentence: string;        // The full sentence containing the error
  contextText: string;     // Surrounding text snippet (from match.context.text)
  contextOffset: number;   // Error offset within contextText (from match.context.offset)
  contextLength: number;   // Error length within contextText (from match.context.length)
}

interface GrammarCheckResult {
  paragraphKey: string;    // Slate block key for cache association
  paragraphText: string;   // The text that was checked (for staleness detection)
  errors: GrammarError[];
}

interface GrammarCheckBackend {
  check(text: string, language?: string, signal?: AbortSignal): Promise<GrammarError[]>;
  isAvailable(): boolean;
  name: string;
}
```

**LanguageTool HTTP backend** — see [LanguageTool API Reference](#languagetool-api-reference) below for the full schema. The service implementation:

```typescript
class LanguageToolBackend implements GrammarCheckBackend {
  name = 'LanguageTool';
  private serverUrl: string;
  private language: string;
  private apiKey?: string;
  private disabledRules: string[] = [];

  constructor(config: {
    serverUrl: string;
    language: string;
    apiKey?: string;
    disabledRules?: string[];
  }) {
    this.serverUrl = config.serverUrl;
    this.language = config.language || 'auto';
    this.apiKey = config.apiKey;
    this.disabledRules = config.disabledRules || [];
  }

  isAvailable(): boolean {
    return !!this.serverUrl;
  }

  async check(text: string, language?: string, signal?: AbortSignal): Promise<GrammarError[]> {
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('language', language || this.language);

    if (this.apiKey) {
      params.append('apiKey', this.apiKey);
    }
    if (this.disabledRules.length > 0) {
      params.append('disabledRules', this.disabledRules.join(','));
    }

    const response = await fetch(`${this.serverUrl}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal,
    });

    if (!response.ok) {
      throw new Error(`LanguageTool API error: ${response.status} ${response.statusText}`);
    }

    const data: LanguageToolResponse = await response.json();
    return data.matches.map(match => ({
      offset: match.offset,
      length: match.length,
      message: match.message,
      shortMessage: match.shortMessage || '',
      replacements: match.replacements.map(r => r.value),
      ruleId: match.rule.id,
      ruleDescription: match.rule.description,
      category: match.rule.category.id,
      categoryName: match.rule.category.name,
      issueType: match.rule.issueType,
      sentence: match.sentence,
      contextText: match.context.text,
      contextOffset: match.context.offset,
      contextLength: match.context.length,
    }));
  }
}
```

---

## LanguageTool API Reference

Our backend is LanguageTool running in a Docker container (`docker run -p 8010:8010 erikvl87/languagetool`). The API follows the standard LanguageTool HTTP API (Swagger spec at `/http-api/languagetool-swagger.json`).

### Docker Setup

```bash
# Standard self-hosted deployment
docker run -d \
  --name languagetool \
  -p 8010:8010 \
  erikvl87/languagetool

# With n-gram data for better detection (recommended, needs ~8GB disk + ~4GB RAM)
docker run -d \
  --name languagetool \
  -p 8010:8010 \
  -v /path/to/ngrams:/ngrams \
  -e langtool_languageModel=/ngrams \
  erikvl87/languagetool
```

The server will be available at `http://localhost:8010`.

### POST /v2/check — Primary Endpoint

This is the only endpoint we call during grammar checking.

**Request** (`Content-Type: application/x-www-form-urlencoded`):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes* | The text to check. *Either `text` or `data` is required. |
| `data` | string | No | Alternative: JSON document with text and markup annotations (markup is ignored by the checker). |
| `language` | string | **Yes** | Language code: `en-US`, `de-DE`, `fr`, or `auto` for auto-detection. |
| `motherTongue` | string | No | User's native language code. Enables false-friends detection (e.g., German user writing English). |
| `preferredVariants` | string | No | Comma-separated preferred variants when `language=auto`. E.g., `en-US,de-DE` to prefer US English over British. |
| `enabledRules` | string | No | Comma-separated rule IDs to enable. |
| `disabledRules` | string | No | Comma-separated rule IDs to disable. Used for dismissed rules. |
| `enabledCategories` | string | No | Comma-separated category IDs to enable. |
| `disabledCategories` | string | No | Comma-separated category IDs to disable. |
| `enabledOnly` | boolean | No | Default `false`. If `true`, only rules/categories explicitly enabled are checked. |
| `level` | string | No | `"default"` or `"picky"`. Picky mode enables additional rules for formal writing. |
| `username` | string | No | For premium API access. |
| `apiKey` | string | No | For premium API access. |
| `dicts` | string | No | Comma-separated list of user dictionary IDs. |

**Typical request from our plugin**:

```
POST http://localhost:8010/v2/check
Content-Type: application/x-www-form-urlencoded

text=He+do+not+like+bananas.&language=auto&disabledRules=WHITESPACE_RULE,EN_QUOTES
```

**Response** (`200 OK`, `application/json`):

```typescript
interface LanguageToolResponse {
  software: {
    name: string;           // "LanguageTool"
    version: string;        // "6.4"
    buildDate: string;      // "2024-06-25 10:45:00 +0000"
    apiVersion: number;     // 1
    status: string;         // ""
    premium: boolean;       // false (for self-hosted)
  };

  language: {
    name: string;           // "English (US)"
    code: string;           // "en-US"
    detectedLanguage: {
      name: string;         // "English (US)"
      code: string;         // "en-US"
      confidence: number;   // 0.99 (not in spec but often present)
    };
  };

  matches: LanguageToolMatch[];
}

interface LanguageToolMatch {
  message: string;          // Full human-readable description
                            // e.g., "The verb 'do' does not agree with the subject 'He'."
  shortMessage: string;     // Brief label, e.g., "Subject-verb agreement"
                            // May be empty string for some rules.
  offset: number;           // Character offset in the submitted `text` (0-based)
  length: number;           // Number of characters in the error span
  replacements: Array<{
    value: string;          // Suggested replacement text
                            // e.g., "does", "did"
  }>;
  context: {
    text: string;           // A snippet of surrounding text for display
    offset: number;         // Offset of the error within `context.text`
    length: number;         // Length of the error within `context.text`
  };
  sentence: string;         // The full sentence containing the error
  rule: {
    id: string;             // Rule identifier, e.g., "HE_VERB_AGR"
    subId?: string;         // Sub-rule ID (optional)
    description: string;    // Rule description, e.g., "'He/she' + verb agreement"
    issueType: string;      // "grammar", "typographical", "misspelling", "style", etc.
    category: {
      id: string;           // Category ID, e.g., "GRAMMAR", "TYPOS", "STYLE",
                            // "PUNCTUATION", "REDUNDANCY", "CASING"
      name: string;         // Human-readable: "Grammar", "Possible Typo", etc.
    };
    urls?: Array<{
      value: string;        // URL to rule documentation
    }>;
  };
}
```

**Example response**:

```json
{
  "software": {
    "name": "LanguageTool",
    "version": "6.4",
    "buildDate": "2024-06-25 10:45:00 +0000",
    "apiVersion": 1,
    "status": "",
    "premium": false
  },
  "language": {
    "name": "English (US)",
    "code": "en-US",
    "detectedLanguage": {
      "name": "English (US)",
      "code": "en-US"
    }
  },
  "matches": [
    {
      "message": "The verb 'do' does not agree with the subject 'He'. Consider using: \"does\"",
      "shortMessage": "Subject-verb agreement",
      "offset": 3,
      "length": 2,
      "replacements": [
        { "value": "does" },
        { "value": "did" }
      ],
      "context": {
        "text": "He do not like bananas.",
        "offset": 3,
        "length": 2
      },
      "sentence": "He do not like bananas.",
      "rule": {
        "id": "HE_VERB_AGR",
        "description": "'He/she' + verb agreement",
        "issueType": "grammar",
        "category": {
          "id": "GRAMMAR",
          "name": "Grammar"
        }
      }
    }
  ]
}
```

### Mapping LanguageTool Response → GrammarError

The critical fields for our plugin and how they map:

| LanguageTool Field | GrammarError Field | Used For |
|---|---|---|
| `match.offset` | `error.offset` | Slate decoration anchor position |
| `match.length` | `error.length` | Slate decoration focus position |
| `match.message` | `error.message` | Popover full description |
| `match.shortMessage` | `error.shortMessage` | Popover header / tooltip |
| `match.replacements[].value` | `error.replacements` | Popover suggestion buttons |
| `match.rule.id` | `error.ruleId` | Dismiss rule, `disabledRules` param |
| `match.rule.category.id` | `error.category` | Underline color selection |
| `match.rule.issueType` | `error.issueType` | (reserved for future filtering UI) |
| `match.sentence` | (not stored) | Could be used for context display |
| `match.context.*` | (not stored) | Redundant — we have the paragraph text |

**Category → underline color mapping**:

| `rule.category.id` | `rule.issueType` | Underline Color | Hex |
|---|---|---|---|
| `GRAMMAR` | `grammar` | Blue (wavy) | `#3498db` |
| `TYPOS` | `misspelling` | Red (wavy) | `#e74c3c` |
| `STYLE`, `REDUNDANCY` | `style` | Amber (wavy) | `#f39c12` |
| `PUNCTUATION` | `typographical` | Blue (wavy) | `#3498db` |
| `CASING` | `typographical` | Blue (wavy) | `#3498db` |
| Everything else | * | Blue (wavy) | `#3498db` |

### GET /v2/languages — Language List

Used to populate the language dropdown in preferences.

**Request**: No parameters.

**Response** (`200 OK`):

```typescript
type LanguageToolLanguagesResponse = Array<{
  name: string;     // "English (US)"
  code: string;     // "en"
  longCode: string; // "en-US"
}>;
```

Fetch once on preferences panel open, cache indefinitely.

### Dismissed Rules → disabledRules Parameter

When a user clicks "Dismiss" on a grammar error, we store its `rule.id` (e.g., `"HE_VERB_AGR"`) in the `GrammarCheckStore.dismissedRules` set (persisted to `AppEnv.config`). On subsequent API calls, we pass all dismissed rule IDs as the `disabledRules` parameter:

```
disabledRules=HE_VERB_AGR,EN_QUOTES,COMMA_PARENTHESIS_WHITESPACE
```

This makes the server skip those rules entirely, avoiding unnecessary matches that the user has already seen and dismissed.

### Error Handling

| HTTP Status | Meaning | Our Response |
|---|---|---|
| `200` | Success | Parse matches normally |
| `400` | Bad request (invalid language, etc.) | Log warning, skip this check cycle |
| `413` | Text too long | Split paragraph and retry, or skip |
| `429` | Rate limited | Back off exponentially, retry after delay |
| `500+` | Server error | Log warning, skip, retry on next debounce |
| Network error | Server unreachable | Show subtle "offline" indicator on toggle button, skip check |

---

### 1.2 Grammar Check Store (`lib/grammar-check-store.ts`)

A Flux store that manages the checking lifecycle.

**State**:
```typescript
{
  enabled: boolean;                               // Global on/off
  checking: boolean;                              // Currently checking
  errorsByDraft: Map<string, Map<string, {        // headerMessageId → blockKey → result
    text: string;
    errors: GrammarError[];
  }>>;
  dismissedRules: Set<string>;                    // Rules the user has dismissed
  dirtyBlocks: Map<string, Set<string>>;          // headerMessageId → Set<blockKey>
}
```

**Core flow**:
1. Listen to `DraftStore` for session changes. When a session's `bodyEditorState` changes, diff the blocks to find which have changed text content. Mark changed block keys as dirty.
2. Debounce (800ms after typing stops) — for each dirty block, extract its text content and send to the grammar check service.
3. Store results keyed by `(headerMessageId, blockKey)`. If the block text has changed since the check was initiated, discard the stale result.
4. Trigger store change → the Slate plugin's `decorateNode` re-runs and applies new decorations.

**Actions**:
- `Actions.toggleGrammarCheck` — enable/disable
- `Actions.dismissGrammarError(ruleId)` — add to dismissed set
- `Actions.acceptGrammarSuggestion(headerMessageId, blockKey, error, replacement)` — apply fix
- `Actions.recheckGrammar(headerMessageId)` — force full recheck

### 1.3 Dirty Paragraph Tracking & onChange (Adapted from Old Spellcheck Plugin)

The key efficiency optimization. Rather than re-checking the entire draft on every change, we track which Slate blocks (paragraphs) have been modified. The old spellcheck plugin used a similar two-phase approach: check the focused block immediately on every onChange, then check the full document after 1 second of inactivity. We adapt this for async API calls.

**Implementation in the Slate `onChange` handler**:

```typescript
const composingWeakmap = new WeakMap();
let previousDocumentByDraft = new Map<string, Document>();
let timer: ReturnType<typeof setTimeout> = null;
let timerStart = Date.now();

function onChange(editor: Editor, next: () => void) {
  if (!AppEnv.config.get('core.composing.grammarCheck')) {
    return next();
  }

  // Don't check during IME composition (adapted from old spellcheck plugin)
  if (composingWeakmap.get(editor)) {
    return next();
  }

  // Throttle: don't diff on every keystroke if changes are very rapid
  const now = Date.now();
  if (timer && now - timerStart < 200) {
    return next();
  }

  const draft = editor.props.propsForPlugins.draft;
  if (!draft) return next();

  const draftId = draft.headerMessageId;
  const currDoc = editor.value.document;
  const prevDoc = previousDocumentByDraft.get(draftId);

  if (prevDoc) {
    // Diff blocks to find which paragraphs changed
    currDoc.nodes.forEach(block => {
      if (block.object !== 'block') return;
      const prevBlock = prevDoc.getNode(block.key);
      if (!prevBlock || prevBlock.text !== block.text) {
        GrammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });

    // Clear errors for deleted blocks
    prevDoc.nodes.forEach(block => {
      if (!currDoc.getNode(block.key)) {
        GrammarCheckStore.clearBlock(draftId, block.key);
      }
    });
  } else {
    // First onChange for this draft — mark all blocks dirty for initial check
    currDoc.nodes.forEach(block => {
      if (block.object === 'block') {
        GrammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });
  }

  previousDocumentByDraft.set(draftId, currDoc);

  // Debounce the actual API check (adapted from spellcheck's setTimeout pattern)
  timerStart = now;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    GrammarCheckStore.checkDirtyBlocks(draftId).then(() => {
      // Apply new decorations once results arrive
      applyGrammarDecorations(editor, draftId);
    });
  }, 800);

  return next();
}
```

This mirrors both LibreOffice's approach (only re-check modified paragraphs) and the old spellcheck plugin's two-phase pattern (throttled immediate tracking + debounced full check).

---

## Phase 2: Slate Editor Plugin

### 2.1 File: `app/src/components/composer-editor/grammar-check-plugins.tsx`

This is the most technically interesting piece. It uses Slate's **decoration** system to overlay grammar errors on the editor without modifying the document.

### 2.2 Decorations vs. Marks

Mailspring's composer already handles decorations correctly — the `onChange` handler in `composer-view.tsx` (line 185-192) classifies `set_value` operations that only touch `decorations` as `skipSaving: true`. This means decorations don't trigger draft saves, which is exactly what we want. The deleted spellcheck plugin proved this approach works.

**Why decorations, not marks:**
- Marks modify the document model. Grammar underlines are ephemeral visual overlays.
- Marks would trigger draft saves and sync. Decorations are explicitly skip-saved.
- Marks would be serialized to HTML. We never want grammar underlines in the sent email.
- Decorations are recalculated from external state — they can be updated without changing the document.
- The deleted spellcheck plugin used exactly this approach and it worked correctly with undo/redo.

### 2.3 Decoration Application via onChange (Proven Pattern)

The deleted spellcheck plugin established the exact pattern we will follow. Rather than using `decorateNode` (a per-node callback), it used `onChange` + `editor.setDecorations()`. This is the right approach because:

1. We need to control **when** decorations update (only after API results arrive), not recalculate them on every render.
2. `editor.setDecorations()` lets us set all decorations atomically from our cached results.
3. `editor.withoutSaving()` ensures decorations don't pollute the undo/redo stack.

```typescript
const GRAMMAR_ERROR_MARK = 'grammar-error';

// Called by GrammarCheckStore when new results arrive for a draft
function applyGrammarDecorations(editor: Editor, draftId: string) {
  const { value } = editor;
  const allErrors = GrammarCheckStore.allErrorsForDraft(draftId);
  const decorations = [];

  value.document.nodes.forEach(block => {
    if (block.object !== 'block') return;

    const blockErrors = allErrors.get(block.key);
    if (!blockErrors || !blockErrors.errors.length) return;

    // Verify the text hasn't changed since we checked
    if (block.text !== blockErrors.text) return;

    const texts = block.getTexts().toArray();

    for (const error of blockErrors.errors) {
      const range = offsetToSlateRange(texts, error.offset, error.length);
      if (!range) continue;

      decorations.push(
        Decoration.create({
          anchor: { key: range.startKey, offset: range.startOffset },
          focus: { key: range.endKey, offset: range.endOffset },
          mark: {
            type: GRAMMAR_ERROR_MARK,
            data: {
              message: error.message,
              shortMessage: error.shortMessage,
              replacements: error.replacements,
              ruleId: error.ruleId,
              category: error.category,
            },
          },
        })
      );
    }
  });

  // Compare with existing decorations to avoid unnecessary re-renders
  const previous = value.get('decorations');
  if (previous && previous.size === decorations.length) {
    const table = {};
    previous.forEach(
      d => (table[`${d.anchor.key}:${d.anchor.offset}-${d.focus.key}:${d.focus.offset}`] = true)
    );
    let changed = false;
    for (const d of decorations) {
      if (!table[`${d.anchor.key}:${d.anchor.offset}-${d.focus.key}:${d.focus.offset}`]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;  // No change — skip the re-render
  }

  // Apply decorations without affecting undo/redo
  editor.withoutSaving(() => {
    editor.setDecorations(decorations);
  });
}
```

This approach is directly adapted from the old spellcheck plugin's `onSpellcheckFullDocument()` function, which used the same `Decoration.create()` → `editor.withoutSaving()` → `editor.setDecorations()` pattern and the same diff-before-apply optimization.

### 2.4 Offset-to-Slate Mapping

The LanguageTool API returns character offsets within the paragraph text. We need to map these to Slate's `(textNodeKey, offset)` coordinate system.

```typescript
function offsetToSlateRange(
  texts: Text[],
  offset: number,
  length: number
): { startKey: string; startOffset: number; endKey: string; endOffset: number } | null {
  let charsSoFar = 0;
  let startKey: string, startOffset: number, endKey: string, endOffset: number;

  for (const text of texts) {
    const textLength = text.text.length;

    if (startKey === undefined && charsSoFar + textLength > offset) {
      startKey = text.key;
      startOffset = offset - charsSoFar;
    }
    if (startKey !== undefined && charsSoFar + textLength >= offset + length) {
      endKey = text.key;
      endOffset = offset + length - charsSoFar;
      return { startKey, startOffset, endKey, endOffset };
    }
    charsSoFar += textLength;
  }
  return null;  // Offset out of bounds — text changed
}
```

### 2.5 renderMark for Grammar Error Underlines

```typescript
function renderMark({ mark, children, targetIsHTML }, editor, next) {
  if (mark.type !== GRAMMAR_ERROR_MARK) return next();

  // Never render grammar marks in HTML output
  if (targetIsHTML) return children;

  const category = mark.data.get('category') || mark.data.category;
  const underlineColor = category === 'TYPOS' ? '#e74c3c' : '#3498db';

  return (
    <span
      className="grammar-error"
      data-grammar-error={true}
      style={{
        backgroundImage: `linear-gradient(45deg, transparent 65%, ${underlineColor} 80%, transparent 90%),
                          linear-gradient(135deg, transparent 5%, ${underlineColor} 15%, transparent 25%),
                          linear-gradient(135deg, transparent 45%, ${underlineColor} 55%, transparent 65%),
                          linear-gradient(45deg, transparent 25%, ${underlineColor} 35%, transparent 50%)`,
        backgroundSize: '8px 2px',
        backgroundPosition: 'bottom left',
        backgroundRepeat: 'repeat-x',
        paddingBottom: '2px',
      }}
    >
      {children}
    </span>
  );
}
```

**Color scheme** (following LibreOffice conventions):
- Grammar errors: blue wavy underline (`#3498db`)
- Spelling/typo errors: red wavy underline (`#e74c3c`)
- Style suggestions: yellow/amber underline (`#f39c12`)

The wavy underline is rendered via CSS background gradients rather than `text-decoration` because `text-decoration: underline wavy` has inconsistent rendering across Chromium versions and doesn't allow color customization independent of text color. The background-image approach produces consistent 2px-high wavy lines.

### 2.6 Floating Correction Popover

A `topLevelComponent` that appears when the user clicks on an underlined error.

```typescript
function FloatingCorrectionPopover({ editor, value }: ComposerEditorPluginTopLevelComponentProps) {
  // Find the grammar-error mark at the current cursor position
  if (!value.selection.isFocused || !value.selection.isCollapsed) return null;

  const grammarMark = value.activeMarks.find(m => m.type === GRAMMAR_ERROR_MARK);
  if (!grammarMark) return null;

  // Position the popover below the error span
  const sel = document.getSelection();
  if (!sel.rangeCount) return null;
  const target = sel.getRangeAt(0).startContainer.parentElement.closest('[data-grammar-error]');
  if (!target) return null;

  const parent = target.closest('.RichEditor-content') as HTMLElement;
  const parentRect = parent.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  const message = grammarMark.data.get('message');
  const shortMessage = grammarMark.data.get('shortMessage');
  const replacements = grammarMark.data.get('replacements');
  const ruleId = grammarMark.data.get('ruleId');

  return (
    <div
      className="grammar-correction-popover"
      style={{
        position: 'absolute',
        left: targetRect.left - parentRect.left,
        top: targetRect.bottom - parentRect.top + 4,
        zIndex: 10,
      }}
    >
      <div className="grammar-message">
        <strong>{shortMessage || 'Grammar'}</strong>
        <p>{message}</p>
      </div>
      <div className="grammar-replacements">
        {replacements.slice(0, 5).map((replacement, i) => (
          <button
            key={i}
            className="btn btn-small"
            onMouseDown={e => {
              e.preventDefault();
              applyReplacement(editor, grammarMark, replacement);
            }}
          >
            {replacement}
          </button>
        ))}
      </div>
      <div className="grammar-actions">
        <button
          className="btn btn-small btn-dismiss"
          onMouseDown={e => {
            e.preventDefault();
            Actions.dismissGrammarError(ruleId);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
```

### 2.7 Applying a Replacement

When the user clicks a suggestion, we need to replace the error span in the editor:

```typescript
function applyReplacement(editor: Editor, grammarMark: Mark, replacement: string) {
  const { document, selection } = editor.value;
  const node = document.getNode(selection.anchor.key);

  // Find the decoration range for this error
  // Walk backward/forward from cursor to find the extent of the grammar-error mark
  // (Similar to expandSelectionToRangeOfMark in toolbar-component-factories.tsx)
  const anchor = selection.anchor;
  let start = anchor.offset;
  let end = anchor.offset;

  while (start > 0 && node.getMarksAtIndex(start).find(m => m.type === GRAMMAR_ERROR_MARK)) {
    start--;
  }
  while (
    end < node.text.length &&
    node.getMarksAtIndex(end + 1).find(m => m.type === GRAMMAR_ERROR_MARK)
  ) {
    end++;
  }

  // Select the error range and replace with the suggestion
  editor
    .select({
      anchor: { key: anchor.key, offset: start },
      focus: { key: anchor.key, offset: end },
      isFocused: true,
    })
    .insertText(replacement)
    .focus();
}
```

Note: Because the replacement modifies the block text, the `onChange` handler will mark the block as dirty, triggering a re-check. The old decorations are automatically removed because the staleness check (`block.text !== blockErrors.text`) will fail.

### 2.8 Putting It Together: The Full Slate Plugin Export

```typescript
const plugins: ComposerEditorPlugin[] = [
  {
    onChange,
    renderMark,
    topLevelComponent: FloatingCorrectionPopover,
    rules: [],  // No HTML serialization rules — decorations are never serialized

    // IME composition handling (from old spellcheck plugin)
    onCompositionStart: (event, editor, next) => {
      composingWeakmap.set(editor, (composingWeakmap.get(editor) || 0) + 1);
      next();
    },
    onCompositionEnd: (event, editor, next) => {
      composingWeakmap.set(editor, Math.max(0, (composingWeakmap.get(editor) || 0) - 1));
      next();
    },
  },
];

export default plugins;
```

Register in `conversion.tsx`:
```typescript
import GrammarCheckPlugins from './grammar-check-plugins';

export const plugins: ComposerEditorPlugin[] = [
  ...InlineAttachmentPlugins,
  ...UneditablePlugins,
  ...BaseMarkPlugins,
  ...TemplatePlugins,
  ...EmojiPlugins,
  ...GrammarCheckPlugins,   // After emoji, before links
  ...LinkPlugins,
  ...BaseBlockPlugins,
  ...MarkdownPlugins,
];
```

---

## Phase 3: Composer UI Integration

### 3.1 Toggle Button (`Composer:ActionButton`)

A simple button in the composer toolbar to toggle grammar checking on/off and show the current status.

```typescript
class GrammarCheckToggle extends React.Component<{
  draft: Message;
  session: DraftEditingSession;
}> {
  static displayName = 'GrammarCheckToggle';

  render() {
    const enabled = GrammarCheckStore.isEnabled();
    const checking = GrammarCheckStore.isChecking(this.props.draft.headerMessageId);
    const errorCount = GrammarCheckStore.errorCount(this.props.draft.headerMessageId);

    return (
      <button
        tabIndex={-1}
        className={`btn btn-toolbar btn-grammar-check ${enabled ? 'enabled' : ''}`}
        onClick={() => Actions.toggleGrammarCheck()}
        title={enabled ? `Grammar check: ${errorCount} issues` : 'Enable grammar check'}
      >
        <RetinaImg
          url="mailspring://composer-grammar-check/assets/icon-grammar@2x.png"
          mode={RetinaImg.Mode.ContentIsMask}
        />
        {checking && <span className="grammar-check-spinner" />}
        {errorCount > 0 && <span className="grammar-error-count">{errorCount}</span>}
      </button>
    );
  }
}
```

### 3.2 ComposerExtension (`warningsForSending`)

Optionally warn the user about uncorrected grammar errors before sending:

```typescript
class GrammarCheckComposerExtension extends ComposerExtension {
  static warningsForSending({ draft }: { draft: Message }): string[] {
    if (!GrammarCheckStore.isEnabled()) return [];

    const errorCount = GrammarCheckStore.errorCount(draft.headerMessageId);
    if (errorCount > 0) {
      return [`with ${errorCount} grammar issue${errorCount > 1 ? 's' : ''}`];
    }
    return [];
  }
}
```

This produces dialogs like: "Send with 3 grammar issues?"

---

## Phase 4: Preferences & Backend Configuration

### 4.1 Settings Schema

Add to `core.composing` config namespace:

```json
{
  "core.composing.grammarCheck": false,
  "core.composing.grammarCheckServerUrl": "http://localhost:8010",
  "core.composing.grammarCheckLanguage": "auto",
  "core.composing.grammarCheckPreferredVariants": "",
  "core.composing.grammarCheckMotherTongue": "",
  "core.composing.grammarCheckLevel": "default",
  "core.composing.grammarCheckApiKey": "",
  "core.composing.grammarCheckDisabledRules": "",
  "core.composing.grammarCheckDisabledCategories": "",
  "core.composing.grammarCheckWarnOnSend": true
}
```

Default is **disabled** — user must opt in. Default server URL points to a local Docker instance.

### 4.2 Backend Configuration

The primary backend is a self-hosted LanguageTool Docker container. The user configures the server URL and optional parameters:

| Setting | Config Key | Default | Maps to API param |
|---------|-----------|---------|-------------------|
| Server URL | `grammarCheckServerUrl` | `http://localhost:8010` | Base URL for `POST /v2/check` |
| Language | `grammarCheckLanguage` | `auto` | `language` |
| Preferred variants | `grammarCheckPreferredVariants` | `""` | `preferredVariants` |
| Mother tongue | `grammarCheckMotherTongue` | `""` | `motherTongue` |
| Strictness level | `grammarCheckLevel` | `default` | `level` (`default` or `picky`) |
| API key | `grammarCheckApiKey` | `""` | `apiKey` (for premium/cloud) |
| Disabled rules | `grammarCheckDisabledRules` | `""` | `disabledRules` (also appended by dismiss action) |
| Disabled categories | `grammarCheckDisabledCategories` | `""` | `disabledCategories` |

### 4.3 Preferences UI

Register a section within the existing Composing preferences tab (or its own tab):

- **Enable grammar check** toggle
- **Backend** dropdown: Cloud / Premium / Self-hosted / Local (Harper)
- **Server URL** field (visible for self-hosted)
- **API Key** field (visible for premium)
- **Language** dropdown: Auto-detect / specific language
- **Warn on send** toggle
- **Privacy notice**: "When using cloud or premium backends, paragraph text is sent to the LanguageTool server for analysis. Use self-hosted or local backends to keep text on your machine."

---

## Phase 5: Privacy & Polish

### 5.1 Privacy Safeguards

- Only send the text of individual paragraphs, never the full email body (mirrors LibreOffice's approach)
- Never send `To`, `From`, `Subject`, or attachment data to the grammar API
- Display a one-time notice when cloud backend is first enabled
- Default to grammar check disabled — opt-in only
- If configured backend is unreachable, silently disable and show a subtle indicator

### 5.2 Performance Considerations

- **Debounce**: 800ms after typing stops (matches the existing spellcheck re-enable timer in `composer-editor.tsx`)
- **Paragraph-level granularity**: Only re-check modified paragraphs
- **Staleness detection**: Discard results if the paragraph text changed between request and response
- **Request cancellation**: Use `AbortController` to cancel in-flight requests when the user continues typing
- **Concurrency limit**: Max 2 concurrent API requests per draft to avoid hammering the server
- **Rate limiting**: Respect LanguageTool's free tier limits (20 req/min) with a token bucket

### 5.3 Error Display Lifecycle

```
User types → onChange marks block dirty
                ↓
800ms debounce expires
                ↓
GrammarCheckStore sends paragraph to API
                ↓
API returns GrammarError[]
                ↓
Store updates errorsByDraft cache, triggers change
                ↓
decorateNode() re-runs, produces Decoration objects
                ↓
Slate renders decorations as wavy underlines
                ↓
User clicks on underlined text → cursor enters grammar-error mark
                ↓
FloatingCorrectionPopover appears (reads mark data)
                ↓
User clicks replacement → editor.insertText(replacement)
                ↓
onChange fires → block marked dirty → old decoration removed → re-check queued
```

### 5.4 Styles (`styles/grammar-check.less`)

```less
.grammar-error {
  cursor: pointer;
  position: relative;
}

.grammar-correction-popover {
  background: @background-primary;
  border: 1px solid @border-color-divider;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px 12px;
  max-width: 320px;
  min-width: 200px;
  z-index: 10;

  .grammar-message {
    margin-bottom: 8px;
    font-size: 12px;
    strong { display: block; margin-bottom: 2px; }
    p { color: @text-color-subtle; margin: 0; }
  }

  .grammar-replacements {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 6px;

    button {
      background: @background-color-info;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
      &:hover { opacity: 0.85; }
    }
  }

  .grammar-actions {
    border-top: 1px solid @border-color-divider;
    padding-top: 6px;
    .btn-dismiss {
      font-size: 11px;
      color: @text-color-subtle;
    }
  }
}

.btn-grammar-check {
  position: relative;
  .grammar-check-spinner {
    /* small animated spinner */
  }
  .grammar-error-count {
    position: absolute;
    top: -4px;
    right: -4px;
    background: @background-color-error;
    color: white;
    border-radius: 8px;
    font-size: 9px;
    padding: 1px 4px;
    min-width: 14px;
    text-align: center;
  }
}
```

---

## File Layout

```
app/internal_packages/composer-grammar-check/
├── package.json
├── lib/
│   ├── main.ts                          # activate/deactivate lifecycle
│   ├── grammar-check-store.ts           # Flux store: dirty tracking, check orchestration
│   ├── grammar-check-service.ts         # Backend abstraction (LT HTTP, Harper WASM)
│   ├── grammar-check-toggle.tsx         # Composer:ActionButton toggle component
│   ├── grammar-check-extension.ts       # ComposerExtension (warningsForSending)
│   └── preferences-grammar.tsx          # Preferences UI panel
├── assets/
│   └── icon-grammar@2x.png
└── styles/
    └── grammar-check.less

app/src/components/composer-editor/
├── grammar-check-plugins.tsx            # Slate plugin: decorateNode, renderMark,
│                                        #   FloatingCorrectionPopover, onChange
└── conversion.tsx                       # (modified) Import and register grammar plugin
```

The Slate plugin lives in `app/src/components/composer-editor/` alongside the other editor plugins because it needs to be registered in `conversion.tsx`'s static plugin array. The rest of the plugin lives in `internal_packages/` following the standard package structure.

---

## Key Technical Decisions

### Why Decorations, Not Marks

The `composer-view.tsx` onChange handler (line 185-192) already has special handling:

```typescript
const skipSaving = change.operations.every(
  op =>
    op.type === 'set_selection' ||
    (op.type === 'set_value' &&
      Object.keys(op.properties).every(k => k === 'decorations'))
);
```

This means decoration changes are classified as non-saving operations. Grammar underlines stored as decorations will:
- Not trigger draft persistence to the database
- Not be serialized to HTML in the sent email
- Be recalculated on the fly from the store's error cache
- Have zero impact on undo/redo history

### Why Paragraph-Level Checking

Following LibreOffice's architecture:
- Individual paragraphs are the natural unit — LanguageTool's API handles full sentences within submitted text
- Keeps API payload small (typically < 1KB per paragraph vs. potentially 100KB+ for full email with quoted text)
- Enables granular caching — only re-check what changed
- Privacy benefit — the server never sees the full email, just fragments
- Quoted text regions (uneditable blocks) can be excluded entirely

### Why a Flux Store (Not Inline State)

Grammar check state needs to:
- Persist across editor re-renders
- Be accessible from both the Slate plugin (for decorations) and the composer button (for error count)
- Support async API calls without blocking the editor
- Be addressable by `headerMessageId` (for multi-draft support)

A Flux store is the standard pattern in Mailspring for this kind of shared state.

### Interaction with Existing Spellcheck

Mailspring already has spellcheck via Chromium's built-in spellchecker (red dotted underlines managed by the browser). Grammar check is complementary:
- Spellcheck: handled by the browser, renders native underlines, right-click context menu
- Grammar check: handled by this plugin, renders CSS wavy underlines, click-to-show popover

The two systems are independent. A word can have both a spelling error (browser underline) and be part of a grammar error (our underline). This matches how LibreOffice distinguishes red (spelling) from blue (grammar) underlines.

---

## Open Questions

1. **Should quoted text be excluded from checking?** Almost certainly yes — users don't control quoted text. The `onChange` dirty tracker should skip blocks inside `isQuoteNode()` regions.

2. **Should we check the subject line?** LanguageTool works on any text. We could check the subject via a separate API call, but the decoration system is editor-specific. Subject checking would need a different rendering approach (perhaps a simple warning icon).

3. **Should errors persist across sessions?** Currently the plan re-checks on draft open. We could cache results in the draft's plugin metadata, but this adds complexity and the checks are fast enough to redo.

4. **Language detection**: LanguageTool supports `language=auto`. Should we use the draft's detected language, the user's configured language, or always auto-detect? Auto-detect is simplest and handles multilingual drafts.

5. **Context sending**: LanguageTool produces better results with more context. Should we send adjacent paragraphs alongside the dirty one (as context but not for error reporting)? The API doesn't have a "context" parameter, but we could concatenate paragraphs and only display errors within the target paragraph's offset range.
