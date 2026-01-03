# Comparison: foundry376/Mailspring vs agent8/Mailspring

## Executive Summary

The **agent8/Mailspring** fork is actually **EdisonMail** (now OnMail) - a completely separate commercial email product built on the Mailspring codebase. This is not a simple fork with bug fixes, but a substantially diverged codebase with different goals, features, and architecture choices.

**Key Finding:** Due to the extensive divergence, there are **very few changes that could be cleanly backported**. The codebases have fundamentally different architectures (JavaScript vs TypeScript) and the agent8 fork has removed many Mailspring features while adding EdisonMail-specific functionality.

---

## Repository Statistics

| Metric | foundry376/Mailspring | agent8/Mailspring (EdisonMail) |
|--------|----------------------|--------------------------------|
| Stars | ~17,000 | ~7 |
| Commits | ~7,606 | ~14,790 |
| Version | 1.16.0 | 1.18.0 (1.20.0 last release) |
| Electron | 39.x | 12.x |
| Language | TypeScript | JavaScript (Babel) |
| Node.js | 16+ | 14.x |
| Product Name | Mailspring | EdisonMail |
| Last Active | July 2025 | October 2024 |

---

## Fork History

- **Common Ancestor:** Commit `97bbd3e` (circa 2018, around version 1.0.8)
- **Divergence Point:** The forks diverged after ~1,500 shared commits
- The agent8 fork has nearly double the commits due to extensive EdisonMail-specific development

---

## Architecture Differences

### Language/Build System
- **foundry376:** Full TypeScript with `.ts`/`.tsx` files
- **agent8:** Babel/JavaScript with `.es6`/`.jsx` files

This fundamental difference makes direct code backporting extremely difficult.

### Electron Version
- **foundry376:** Electron 39 (modern, actively updated)
- **agent8:** Electron 12 (significantly older)

The foundry376 version is actually more up-to-date with Electron.

---

## Feature Differences

### Features in foundry376 but NOT in agent8:
- `activity` - Activity tracking
- `category-mapper` - Category mapping
- `contacts` - Contact management
- `github-contact-card` - GitHub integration
- `link-tracking` - Link tracking feature
- `list-unsubscribe` - Unsubscribe functionality
- `main-calendar` - Calendar integration
- `message-view-on-github` - GitHub viewing
- `open-tracking` - Open tracking feature
- `participant-profile` - Participant profiles
- `personal-level-indicators` - Personal indicators
- `phishing-detection` - Phishing detection
- `remove-tracking-pixels` - Tracking pixel removal
- `send-and-archive` - Send and archive
- `send-later` - Delayed sending
- `send-reminders` - Send reminders
- `theme-picker` - Theme picker
- `thread-sharing` - Thread sharing
- `thread-snooze` - Thread snoozing
- `translation` - Translation support
- Additional themes: `ui-darkside`, `ui-less-is-more`, `ui-taiga`, `ui-ubuntu`

### Features in agent8 but NOT in foundry376:
- `account-color` - Account color coding
- `app-message-banner` - App message banners
- `license` - License management (commercial)
- `migrate-window` - Migration window
- `outbox` / `outbox-message` - Outbox management
- `pdf` - PDF export
- `quick-sidebar` - Quick sidebar
- `report-bug` - Bug reporting
- `runtime-info` - Runtime info display
- `show-eml-original` - EML file viewer
- `sift-list` - Edison's AI-powered mail sorting
- `webview-plugin` - In-app browser

---

## Potentially Interesting Changes in agent8

While most changes are EdisonMail-specific, here are some that address generic issues:

### 1. Thread Message Limit (Crash Prevention)
**Commit:** `722810579`
```
DC-3299 [Feedback][Crash] when open a thread with 100k responses.
Load max 500 messages in a thread
```
- Adds `MAX_COUNT = 500` limit to prevent crashes with extremely large threads
- Could be considered for foundry376, but trade-off is users can't see all messages

### 2. Spellchecker Improvements
Multiple commits related to spellcheck:
- `cb4334203` - Fix spellchecking by adjusting languages based on hunspell support
- `002f3ad11` - Add 800ms debounce for composer spellchecker
- `62a7d5901` - Replace electron-spellchecker with Electron native spellchecker

### 3. Context Menu Fix
**Commit:** `6c35c6651`
```
context menu on thread-list is not working
```

### 4. CJK Input Improvements
**Commit:** `bfee89672`
```
DC-3307 [Composer] when input in Chinese, the cursor position will go back
```
- Fixes composing mode cursor jumping (not applicable - foundry376 doesn't vendor slate-react)

### 5. Composer Focus Issues
Multiple fixes for cursor/focus behavior in the composer:
- `DC-3191/DC-3203` - Cursor focus at wrong location after special steps
- `DC-3227` - Focus delay when going from Subject to Body

---

## Why Backporting is Difficult

1. **Language Difference:** TypeScript vs JavaScript requires complete rewrite
2. **Different Package Ecosystem:** Different dependencies and versions
3. **Removed Features:** agent8 removed many features foundry376 has
4. **Product-Specific Code:** Most fixes reference Edison's internal ticket system (DC-XXXX)
5. **Different Electron APIs:** Electron 12 vs 39 have different APIs
6. **Vendored Dependencies:** agent8 vendors libraries like slate-react that foundry376 uses from npm

---

## Recommendations

### For foundry376/Mailspring maintainers:

1. **Thread Message Limit:** Consider implementing a configurable limit for very large threads to prevent memory issues. The agent8 approach of 500 messages is reasonable.

2. **Spellchecker Updates:** Review if there are any spellcheck improvements that could be adapted, though foundry376 may already have addressed these differently.

3. **Don't attempt bulk backporting:** The codebases are too divergent. Individual issues should be addressed independently in TypeScript.

4. **Feature Ideas (if desired):**
   - PDF export functionality
   - EML file viewer
   - Outbox management UI

### For users considering agent8/EdisonMail:

- EdisonMail is a commercial product with different goals than Mailspring
- It's on older Electron (12 vs 39) which may have security implications
- It has removed many features that exist in Mailspring
- Development appears to have slowed (last commit Oct 2024)

---

## Conclusion

The agent8/Mailspring fork is effectively a different product (EdisonMail/OnMail) that shares historical ancestry with Mailspring but has diverged significantly. The changes are too extensive and the architecture too different for meaningful backporting. Individual bug fixes should be identified and reimplemented in TypeScript if they address issues also present in Mailspring.

The foundry376/Mailspring repository is more actively maintained, uses more modern Electron, and has a richer feature set. The best approach is to continue developing Mailspring independently rather than attempting to merge changes from the agent8 fork.
