# Local English grammar checking

The composer uses [Harper](https://writewithharper.com/), pinned to `harper.js` 3.0.0.
The JavaScript package includes the grammar engine, rules, and dictionary as WASM.
The loader imports the package's `binaryInlined` entry point: its data URL is local,
not a CDN or model download. No draft text, message ID, identity, or subscription
is sent to a service. Electron's native spellchecker still handles spelling.

Enable grammar checking using the existing composer button or the composing
preference. Harper only checks **English**. The legacy
`core.composing.grammarCheckLanguage` setting accepts `auto` (the default: isolate
English text), `en`, and English locale codes. American English is the default;
`en-GB`, `en-AU`, `en-CA`, and `en-IN` select Harper's other dialects. An explicit
non-English language returns no grammar results; `auto` is not multilingual
grammar checking, and its English detection is heuristic.

Advanced configuration uses comma-separated **Harper rule names**, not old
LanguageTool rule IDs:

- `core.composing.grammarCheckEnabledRules` turns individual rules on in addition
  to Harper's defaults.
- `core.composing.grammarCheckDisabledRules` turns individual rules off. The
  context menu's ignore-rule action saves here. Disabled rules win over enabled
  rules. Unknown names (including legacy LanguageTool IDs) are ignored.
- `SpellCheck` stays off regardless of these settings, to avoid duplicating the
  native spellchecker.

Configuration is read for each check; remove a disabled name to restore its
default behavior on subsequent edits. Checks use plain text, not Markdown.
Harper returns UTF-16 offsets matching the composer's text ranges.

The native dynamic imports live in `harper-worker.js` because the TypeScript
compiler targets CommonJS. Keep this file as JavaScript and keep the package's
`dist` JavaScript assets in production builds. No separate WASM copy or network
access is needed, and no ASAR unpack rule is required. The full npm package
currently adds approximately 91 MiB before archive compression, including unused
binary variants.

LocalLinter runs in a Node worker, constructed in the main process through the
existing `@electron/remote` bridge. Electron renderers cannot construct Node
workers directly, and their document CSP prevents fetching the inlined data URL.
The worker keeps startup and linting off the UI thread without weakening CSP. It
allows `fetch` only for a WASM data URL, never an HTTP URL. One worker is reused
per composer window, serialized across draft checks, and stopped on plugin
deactivation or window unload. The existing dirty-block debounce limits checks
to edited blocks.
