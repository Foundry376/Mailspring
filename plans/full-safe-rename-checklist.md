# Full Safe Rename Checklist

## Scope
- Goal: remove legacy `Mailspring` branding and cloud dependencies while keeping runtime behavior stable.
- Constraint: no destructive rename sweep; migrate with compatibility layers first.

## Phase 1: Baseline And Guardrails
- [x] Add repeatable audit script: `scripts/rename-audit.sh`
- [x] Add checklist doc for phased execution
- [ ] Capture baseline smoke test notes (mail send, contacts, settings, onboarding)
- [x] Generate baseline report in `plans/rename-audit-baseline.md`

## Phase 2: Compatibility Layer
- [x] Add `postra-exports` alias module
- [x] Add `postra-store` alias module
- [x] Add `postra-component-kit` alias module
- [x] Keep legacy aliases active until final cutover

## Phase 3: Protocol Migration
- [x] Introduce `postra://` handling where `mailspring://` is currently parsed
- [x] Keep dual support (`postra://` + `mailspring://`) during transition
- [x] Update CSP and URL parsing tests

## Phase 4: User-Facing Rename
- [x] Replace all visible `Mailspring` strings in app UI
- [x] Replace static page titles and text
- [x] Replace desktop entry display names and notifications

## Phase 5: Integration Rename
- [x] Linux desktop/autostart identifiers
- [x] Windows app ID and protocol registration text
- [x] macOS URL scheme registration text

## Phase 6: Config/Data Migration
- [ ] Add startup migration from legacy config paths/keys
- [ ] Add migration marker + rollback-safe behavior
- [ ] Verify with existing user data

## Phase 7: Internal Symbol And File Renames
- [ ] Rename high-level modules/files in small batches
- [ ] Update imports with codemod per batch
- [ ] Run build and smoke checks after each batch

## Phase 8: Remove Compatibility Layer
- [ ] Remove legacy aliases only after zero references remain
- [ ] Remove legacy protocol support if desired
- [ ] Enforce CI grep rule to block regressions

## Verification Commands
- `npm run audit:rename`
- `rg -n --hidden -S "getmailspring|id\.getmailspring|updates\.getmailspring|community\.getmailspring|support@getmailspring|link\.getmailspring" app/src app/static app/internal_packages`
- `rg -n --hidden -S "\bMailspring\b|mailspring://" app/src app/static app/internal_packages`
