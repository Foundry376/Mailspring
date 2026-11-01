# Local English grammar checking

The composer uses [Harper](https://writewithharper.com/), pinned to `harper.js` 3.0.0.
The JavaScript package includes the grammar engine, rules, and dictionary as WASM.
The loader imports the package's `binaryInlined` entry point: its data URL is local,
not a CDN or model download. No draft text, message ID, identity, or subscription
is sent to a service. Harper reports spelling issues alongside grammar and style
issues, including when Electron's native spellchecker is disabled.

Harper is enabled by default; use the composer button or composing preference to
toggle it. Harper only checks **English**. Choose American, British, Australian,
Canadian, or Indian English under Preferences → General → Composing → Harper
language. Changing it rechecks open drafts. American English is the default. The setting is stored as
`core.composing.grammarCheckLanguage` (`en-US`, `en-GB`, `en-AU`, `en-CA`, or
`en-IN`); `en` also selects American English. Automatic (`auto`) isolates English
text, but its heuristic can skip short sentences with spelling mistakes, so it
is optional. An explicit non-English language returns no grammar results;
`auto` is not multilingual grammar checking.

Advanced configuration uses comma-separated **Harper rule names**, not old
LanguageTool rule IDs:

- `core.composing.grammarCheckEnabledRules` turns individual rules on in addition
  to Harper's defaults.
- `core.composing.grammarCheckDisabledRules` turns individual rules off. The
  context menu's ignore-rule action saves here. Disabled rules win over enabled
  rules. Unknown names (including legacy LanguageTool IDs) are ignored.
- `SpellCheck` is enabled by default and follows the same rule settings as other
  checks.

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
