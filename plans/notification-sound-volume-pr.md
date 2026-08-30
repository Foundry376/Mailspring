# Add notification sound volume control

## Summary

- Add a 0–100 notification volume slider in General > Notifications.
- Extend `SoundRegistry` with a clamped, per-play volume option so notification
  volume does not affect sent-message or other UI sounds.
- Route new-mail playback through the configured volume while preserving 100% as
  the backward-compatible default.
- Silence custom Windows toast XML so the native Windows sound cannot bypass the
  application setting, backporting the behavior from PR #2619.

## Testing

- Added unit coverage for 0%, intermediate, 100%, invalid, and out-of-range volume
  values.
- Added preference UI coverage for numeric slider persistence.
- Added new-mail integration coverage showing that the configured percentage is
  passed only to notification playback.
- Added regression coverage for silent individual and summary Windows toast XML.
- `npm run lint`
- `npx tsc -p app --noEmit`
- `npm run build` (produced the macOS arm64 app and ZIP successfully)

The local Electron test runner could not reach Jasmine because the downloaded
`app/mailsync` artifact is rejected/killed by macOS during test database migration;
the runner displays its database error before loading any specs.

## Context

- Volume support request: https://community.getmailspring.com/t/how-do-i-reduce-the-volume-of-the-sound-when-receiving-new-mail/1639/2
- Notification sound discussion: https://community.getmailspring.com/t/custom-notification-sound/530
- Windows/system-sound discussion: https://community.getmailspring.com/t/custom-notification-sound/530/5
- Original notification-sound feature request: https://github.com/Foundry376/Mailspring/issues/415
- Related Windows sound-routing fix: https://github.com/Foundry376/Mailspring/pull/2619
