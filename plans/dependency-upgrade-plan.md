# Dependency Upgrade Plan for Mailspring

**Created:** 2025-12-27
**Status:** In Progress

## Priority Security Issues (Should Update ASAP)

| Package | Current | Latest | Severity | Issue | Update Difficulty |
|---------|---------|--------|----------|-------|-------------------|
| **mammoth** | 1.4.19 | 1.11.0 | **Moderate** (CVSS 9.3!) | Directory Traversal - attacker can read arbitrary files | **Easy** - patch version, drop-in fix |
| **tar-fs** | 2.0.0-2.1.3 | 2.1.4+ | **High** | Symlink validation bypass | **Easy** - `npm audit fix` handles this |
| **debug** | github fork | 4.x | **High** | ReDoS vulnerabilities | **Medium** - need to switch from github fork to npm package |
| **raven** | 2.1.2 | deprecated | **Low** | Cookie handling issue; Raven is deprecated | **Medium** - should migrate to `@sentry/node` |

## Security Issues with No Direct Fix

| Package | Issue | Notes |
|---------|-------|-------|
| **emoji-data** | Depends on vulnerable underscore.string <3.3.5 | Unmaintained package - consider replacement or forking |
| **ms** (via debug) | ReDoS vulnerability | Fixed by updating debug to official npm version |

---

## Phase 1: Quick Security Wins ✅ COMPLETED

```bash
# In /app directory:
npm install mammoth@1.11.0   # Security fix, minor version
npm audit fix                 # Fixes tar-fs and electron
```

## Phase 2: Safe Minor Updates ✅ COMPLETED

These are low-risk updates that should be straightforward:

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| **dompurify** | ^3.0.8 | 3.3.1 | Security-critical sanitizer - always good to update |
| **cheerio** | ^1.0.0-rc.6 | 1.1.2 | Now stable! |
| **chrono-node** | ^2.7.6 | 2.9.0 | Date parsing |
| **moment** | ^2.24.0 | 2.30.1 | Date library |
| **moment-timezone** | ^0.5.32 | 0.5.48 → 0.6.0 | Timezone data updates |
| **underscore** | ^1.13.1 | 1.13.7 | Patch updates |
| **graceful-fs** | ^4.1.11 | 4.2.11 | FS operations |
| **mousetrap** | ^1.5.3 | 1.6.5 | Keyboard shortcuts |
| **react-color** | ^2.17.0 | 2.19.3 | Color picker |
| **enzyme** | ^3.8.0 | 3.11.0 | Testing (dev) |
| **enzyme-adapter-react-16** | ^1.9.0 | 1.15.8 | Testing (dev) |
| **source-map-support** | ^0.3.2 | 0.5.21 | Error stacks |
| **collapse-whitespace** | ^1.1.6 | 1.1.7 | Minor update |
| **rtlcss** | ^4.1.1 | 4.3.0 | RTL CSS support |
| **classnames** | 1.2.1 | 2.5.1 | CSS class utility |

```bash
npm install dompurify@latest cheerio@latest chrono-node@latest \
  moment@latest moment-timezone@latest graceful-fs@latest \
  underscore@latest mousetrap@latest react-color@latest \
  source-map-support@latest rtlcss@latest classnames@latest \
  collapse-whitespace@latest enzyme@latest enzyme-adapter-react-16@latest
```

---

## Phase 3: Requires Testing (TODO)

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| **better-sqlite3** | ^11.7.0 | 12.5.0 | Major version - check API changes |
| **juice** | ^7.0.0 | 11.0.3 | CSS inliner - major version jump |
| **node-emoji** | ^1.2.1 | 2.2.0 | Emoji handling - API changes |
| **snarkdown** | 1.2.2 | 2.0.0 | Markdown parsing |
| **proxyquire** | 1.3.1 | 2.1.3 | Testing mock (dev) |
| **jasmine-reporters** | 1.x.x | 2.5.2 | Testing reporters (dev) |
| **debug** | github fork | 4.x | Switch from github fork to npm package |

## Phase 4: Major Updates (Significant Work Required)

| Package | Current | Latest | Effort Required |
|---------|---------|--------|-----------------|
| **React** | 16.6.0 | 19.2.3 | **Very High** - 3 major versions behind, would need full audit of all components |
| **uuid** | ^3.0.0 | 13.0.0 | **High** - Major API changes |
| **immutable** | ^3.8.2 | 5.1.4 | **High** - 2 major versions, likely breaking changes |
| **node-fetch** | ^2.6.0 | 3.3.2 | **Medium** - v3 is ESM-only (breaking for CommonJS) |
| **lru-cache** | ^4.0.1 | 11.2.4 | **High** - Many major versions |
| **getmac** | ^1.2.1 | 6.6.0 | **Medium** - API likely changed |
| **mkdirp** | ^0.5 | 3.0.1 | **Medium** - Modern version is ESM |
| **rimraf** | 2.5.2 | 6.1.2 | **Medium** - Modern version has different API |
| **ini** | ^1.3.5 | 6.0.0 | **Medium** - Check for breaking changes |
| **ical.js** | ^1.3.0 | 2.2.1 | **Medium** - Calendar parsing |
| **ical-expander** | ^2.0.0 | 3.2.0 | **Medium** - iCal recurring events |
| **reflux** | 0.1.13 | 6.4.1 | **Very High** - State management, deeply integrated |
| **react-transition-group** | 1.2.1 | 4.4.5 | **High** - Animation library, API changes |
| **event-kit** | ^1.0.2 | 2.5.3 | **Medium** - Event handling |

## Slate Editor Dependencies (Special Case)

The Slate editor packages use GitHub forks and pinned versions:
- `slate` - github:bengotow/slate
- `slate-react` - github:bengotow/slate#0.45.1-react
- `@bengotow/slate-edit-list` - github fork

**Recommendation:** These are likely customized and should be evaluated separately. Slate has undergone major architecture changes between 0.4x and 0.5x+.

## Deprecated/Unmaintained Packages

| Package | Status | Recommendation |
|---------|--------|----------------|
| **raven** | Deprecated | Migrate to `@sentry/node` or `@sentry/electron` |
| **debug** (github fork) | Custom fork | Switch to official `debug` package |
| **emoji-data** | Unmaintained (0.2.0) | Consider `emoji-regex`, `node-emoji`, or `emojibase` |
| **rx-lite** | Deprecated | Consider full RxJS or alternative |
