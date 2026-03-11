# Technical Debt Register

This document catalogs technical debt identified by scanning the codebase for **TODO**, **FIXME**, **XXX**, and **HACK** comments in `app/src` (excluding third-party vendored code under `quickpreview/`). Each entry includes location, short description, priority, and rough remediation effort (S/M/L). Legacy patterns and dependency notes are listed at the end.

**Scan scope**: `app/src` (TypeScript/TSX/JS). The `mailsync` submodule was not scanned (separate repository).

---

## Debt Items

| # | Location | Description | Priority | Effort |
|---|----------|-------------|----------|--------|
| 1 | `app/src/window-bootstrap.ts:3` | Remove when upgrading to Electron 4 (obsolete; app is on Electron 39) | Low | S |
| 2 | `app/src/secondary-window-bootstrap.ts:4` | Remove when upgrading to Electron 4 (obsolete) | Low | S |
| 3 | `app/src/spellchecker.ts:66` | Ensure custom dictionary add-word works on Ubuntu 20.12 | Medium | M |
| 4 | `app/src/services/search/search-query-backend-local.ts:74` | Consider SQL injection mitigation for local search | High | M |
| 5 | `app/src/services/search/search-query-backend-local.ts:249` | TODO BG: hasAttachment column fix note (documentation / sync engine alignment) | Low | S |
| 6 | `app/src/mailbox-perspective.ts:53` | Method is broken (needs fix or removal) | High | M |
| 7 | `app/src/flux/tasks/change-folder-task.ts:56` | Undo: each task has single undo; folder moves may need multi-undo support | Medium | L |
| 8 | `app/src/flux/stores/focused-perspective-store.ts:53-55` | navigation:go-to-contacts, go-to-tasks, go-to-label are no-ops (TODO) | Medium | M |
| 9 | `app/src/flux/stores/draft-factory.ts:46` | Fix inline images handling | Medium | L |
| 10 | `app/src/flux/stores/account-store.ts:61` | Incomplete TODO (context needed) | Low | S |
| 11 | `app/src/flux/models/utils.ts:35` | TODO BG: Code duplicated in mailsync core; consider single source of truth | Medium | L |
| 12 | `app/src/flux/models/thread.ts:43` | NONFUNCTIONAL (mark or fix) | High | M |
| 13 | `app/src/flux/models/mutable-query-result-set.ts:6` | Make mutator methods QueryResultSet.join(), QueryResultSet.clip... (design/impl) | Medium | L |
| 14 | `app/src/flux/mailsync-bridge.ts:430` | Move to "model" naming style for change record type; find all uses | Low | M |
| 15 | `app/src/flux/attributes/matcher.ts:198` | RAISE `TODO` in generated SQL (placeholder; needs proper handling) | High | M |
| 16 | `app/src/components/time-picker.tsx:27` | renderTimeOptions: relativeTo PropType / behavior | Low | S |
| 17 | `app/src/components/menu.tsx:296` | Hack; refactor | Medium | M |
| 18 | `app/src/components/composer-editor/emoji-toolbar-popover.tsx:200` | Find matches for aliases (emoji search) | Low | S |
| 19 | `app/src/components/composer-editor/conversion.tsx:238` | TODO BG (context in file) | Low | S |
| 20 | `app/src/components/composer-editor/conversion.tsx:456` | Typo/comment: "bigts" / "XXX" characters (sensitive content replacement) | Low | S |

---

## Priority and Effort Legend

- **Priority**: High (correctness/security or broken behavior), Medium (missing feature or quality), Low (cleanup, naming, docs).
- **Effort**: S (small, hours), M (medium, days), L (large, sprint or more).

---

## Legacy Patterns and Dependency Notes

| Area | Observation | Recommendation |
|------|-------------|----------------|
| **Electron** | Root and app lock to Electron 39.2.7. | Plan upgrade path; test thoroughly (native modules, IPC, notarization). |
| **Node** | Engines require Node >=16.17, npm >=8. | Consider moving to Node 20 LTS for CI and dev; align with GitHub Actions (e.g. Node 20). |
| **React** | App uses React 16.9.0. | Track React 18 migration for concurrent features and long-term support. |
| **Reflux** | State layer is Reflux 0.1.13. | No immediate change required; document as legacy if considering a future state-library migration. |
| **Slate** | Custom Slate forks (bengotow/slate, slate-react). | Monitor upstream and security; document fork rationale. |
| **Vendored assets** | quickpreview: xlsx, pdfjs, etc. | Prefer npm dependencies with license and security audits; exclude from TODO scans. |

---

## Maintenance

- Re-scan periodically: `grep -rn "TODO\|FIXME\|XXX\|HACK" app/src --include="*.ts" --include="*.tsx"` (excluding vendored dirs).
- When closing debt, add a brief "Resolved" note or remove the line and update this register.
- New items: add a row with location, one-line description, priority, and effort.
