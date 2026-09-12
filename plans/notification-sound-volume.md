# Notification Sound Customization Implementation Plan

## Goal

Deliver two independently reviewable changes in one pull request:

1. A user-facing 0–100 preference that controls only Mailspring's new-mail
   notification sound volume.
2. A user-facing custom notification sound picker with reset and safe fallback.

Per-filter sounds are intentionally out of scope.

## References

- https://community.getmailspring.com/t/how-do-i-reduce-the-volume-of-the-sound-when-receiving-new-mail/1639/2
- https://community.getmailspring.com/t/custom-notification-sound/530
- https://community.getmailspring.com/t/custom-notification-sound/530/5
- https://github.com/Foundry376/Mailspring/issues/415
- https://github.com/Foundry376/Mailspring/pull/2619

## Work Plan

### Change 1: Notification volume

1. Inspect the current playback path, preference conventions, test infrastructure,
   and related Windows sound-routing fix in PR #2619.
2. Extend `SoundRegistry` with a reusable per-play volume option and clamp invalid
   values at the browser audio boundary.
3. Add a schema-backed 0–100 range control and pass only the new-mail preference
   to notification playback, leaving send and UI sounds unchanged.
4. Preserve and add regression coverage for the silent Windows toast declaration
   from PR #2619 so native toast audio cannot bypass application-controlled sound.
5. Add focused registry, notification integration, preference UI, and Windows XML
   tests.

### Change 2: Custom notification sound

1. Add a notification-sound preference service that resolves the bundled default
   or a persisted custom file without coupling file selection to playback.
2. Add select, preview, and reset controls using Electron's native file dialog;
   constrain selection to browser-supported audio formats.
3. Handle moved, deleted, unreadable, and malformed selections by falling back to
   the bundled sound without breaking notifications.
4. Add focused resolver, preference UI, and notification integration tests.

### Final verification and handoff

1. Run targeted tests, formatting/lint/type checks, and the documented local build;
   fix regressions found within scope.
2. Review each change independently for modularity and unrelated changes.
3. Prepare one PR description referencing the relevant forum discussions, GitHub
   issue, and PR #2619 as related Windows sound-routing prior art.

## Verification Checklist

- Existing users retain the current effective volume by default.
- Muting or lowering notification volume does not disable visual notifications.
- Values remain bounded to the browser audio API's valid range.
- Preference changes apply without requiring an application restart, if supported
  by the existing configuration flow.
- A custom sound can be selected, previewed, and reset to the bundled default.
- Missing or unreadable custom files safely use the bundled default sound.
- The volume and custom-sound changes remain separable for review and release.
- Tests and local build commands are reported with exact outcomes.
